const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const {
  issueOtp,
  assertResendAllowed,
  verifyOtp: checkOtp,
} = require("../utils/otpService");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Check if username is taken
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // Create user (password gets hashed automatically via model pre-save hook)
    // const user = await User.create({
    //   username,
    //   email,
    //   password,
    //   authProvider: "local",
    // });

    // res.status(201).json({
    //   message: "User registered successfully",
    //   token: generateToken(user._id),
    //   user: {
    //     id: user._id,
    //     username: user.username,
    //     email: user.email,
    //     role: user.role,
    //     points: user.points,
    //     avatar: user.avatar,
    //   },
    // });

    const user = await User.create({
      username,
      email,
      password,
      authProvider: "local",
      isVerified: false,
    });

    await issueOtp(user);

    res.status(201).json({
      message:
        "Registration successful. Check your email for a verification code.",
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if user registered via Google
    if (user.authProvider === "google") {
      return res.status(401).json({ message: "Please sign in with Google" });
    }

    // Compare password
    // const isMatch = await user.matchPassword(password);
    // if (!isMatch) {
    //   return res.status(401).json({ message: "Invalid email or password" });
    // }
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Only newly-registered local accounts are ever explicitly marked
    // false — existing accounts default to true, so this can't lock
    // anyone out who registered before this feature existed.
    if (user.isVerified === false) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        userId: user._id,
        email: user.email,
        requiresVerification: true,
      });
    }

    res.status(200).json({
      message: "Login successful",
      token: generateToken(user._id),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        points: user.points,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/google
// @access  Public
// Body: { credential } — the ID token string from Google's Sign In button
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Missing Google credential" });
    }

    // Verify the token's signature and audience directly with Google —
    // never trust a decoded payload without this server-side check.
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find by googleId first, then fall back to matching email —
    // this correctly links an existing local account that later signs in
    // with Google using the same email, instead of creating a duplicate.
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Backfill googleId/avatar/provider if this was previously a local account
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = "google";
        if (!user.avatar) user.avatar = picture || "";
        await user.save();
      }
    } else {
      // Generate a unique username from their Google name, since your
      // schema requires one — appends a short suffix on collision.
      let baseUsername = (name || email.split("@")[0])
        .replace(/\s+/g, "")
        .toLowerCase();
      let username = baseUsername;
      let suffix = 0;
      while (await User.findOne({ username })) {
        suffix += 1;
        username = `${baseUsername}${suffix}`;
      }

      user = await User.create({
        username,
        email,
        googleId,
        authProvider: "google",
        avatar: picture || "",
        isVerified: true,
        // password stays undefined — schema already treats this as valid
        // for non-local accounts, and the pre-save hook correctly skips hashing
      });
    }

    res.status(200).json({
      message: "Google sign-in successful",
      token: generateToken(user._id),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        points: user.points,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.log("DEBUG — googleAuth error:", error.message);
    res
      .status(401)
      .json({ message: "Google sign-in failed: " + error.message });
  }
};

// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { username, avatar, preferences } = req.body;

    if (username) {
      const existing = await User.findOne({
        username,
        _id: { $ne: req.user._id },
      });
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        ...(username && { username }),
        ...(avatar !== undefined && { avatar }),
        ...(preferences && { preferences }),
      },
      { new: true, runValidators: true },
    ).select("-password");

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/verify-otp
// @access  Public   Body: { userId, code }
const verifyOtpHandler = async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ message: "userId and code are required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    const ok = await checkOtp(userId, code);
    if (!ok)
      return res.status(400).json({ message: "Invalid or expired code" });

    user.isVerified = true;
    await user.save();

    res.status(200).json({
      message: "Email verified successfully",
      token: generateToken(user._id),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        points: user.points,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/resend-otp
// @access  Public   Body: { userId }
const resendOtpHandler = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Account not found" });
    if (user.isVerified) {
      return res.status(400).json({ message: "Account is already verified" });
    }

    await assertResendAllowed(userId);
    await issueOtp(user);
    res.status(200).json({ message: "A new verification code has been sent" });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  googleAuth,
  verifyOtpHandler,
  resendOtpHandler,
};
