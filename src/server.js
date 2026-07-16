const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const dealRoutes = require('./routes/dealRoutes');
const affiliateRoutes = require('./routes/affiliateRoutes');
const rewardRoutes = require('./routes/rewardRoutes');

dotenv.config();
console.log('DEBUG — FRONTEND_URL is:', JSON.stringify(process.env.FRONTEND_URL));
const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean), // filters out undefined if FRONTEND_URL isn't set yet
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Connect to database
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/rewards', rewardRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Deals API is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));