const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Identifies the user if a valid token is present, but NEVER blocks the
// request either way. Used on public routes (deal listings) that want to
// personalise the response — "did I vote on this?", "did I save this?" —
// without requiring login, since anonymous visitors browse deals too.
const identifyIfLoggedIn = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
    }
  } catch (error) {
    // Invalid/expired token — proceed as anonymous, don't block
  }
  next();
};

module.exports = { identifyIfLoggedIn };
