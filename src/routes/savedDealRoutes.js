const express = require('express');
const router = express.Router();
const { toggleSaveDeal, getMySavedDeals } = require('../controllers/savedDealController');
const { protect } = require('../middleware/authMiddleware');

router.post('/:dealId/toggle', protect, toggleSaveDeal);
router.get('/my-saved', protect, getMySavedDeals);

module.exports = router;