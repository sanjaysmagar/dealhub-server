const express = require('express');
const router = express.Router();
const {
  getMyHistory, getMySummary,
  getLeaderboard, checkBadges,
} = require('../controllers/rewardController');
const { protect } = require('../middleware/authMiddleware');

// Public
router.get('/leaderboard', getLeaderboard);

// Private
router.get('/history', protect, getMyHistory);
router.get('/summary', protect, getMySummary);
router.post('/check-badges', protect, checkBadges);

module.exports = router;