const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Protect routes — checks JWT token
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorised, no token" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (excluding password)
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorised, token failed" });
  }
};

// Admin only routes
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Access denied, admins only" });
  }
};

// Optional identification for PUBLIC routes — attaches req.user if a valid
// login cookie is present, but NEVER blocks the request either way. This
// lets trackClick() recognise "this click came from the logged-in owner"
// without breaking anonymous clicks from real, logged-out customers.
const identifyIfLoggedIn = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
    }
  } catch (error) {
    // Invalid or expired cookie — just proceed as anonymous
  }
  next();
};

module.exports = { protect, adminOnly, identifyIfLoggedIn };
