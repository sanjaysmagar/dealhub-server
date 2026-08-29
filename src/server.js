const dotenv = require("dotenv");
// Load .env.test when running tests, otherwise the normal .env
dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const dealRoutes = require("./routes/dealRoutes");
const affiliateRoutes = require("./routes/affiliateRoutes");
const rewardRoutes = require("./routes/rewardRoutes");
const savedDealRoutes = require("./routes/savedDealRoutes");
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean),
    credentials: true,
  }),
);

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/saved", savedDealRoutes);
app.use('/api/notifications', notificationRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Deals API is running" });
});

// Only connect to the real database and start listening when this file is
// run directly (e.g. `node server.js`) — not when Supertest imports `app`
// for testing, since tests connect to their own in-memory database instead.
if (require.main === module) {
  connectDB();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;