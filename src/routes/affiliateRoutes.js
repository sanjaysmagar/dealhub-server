const express = require('express');
const router = express.Router();
const {
  generateLink, trackClick, simulatePurchase, getMyLinks,
} = require('../controllers/affiliateController');
const { protect, identifyIfLoggedIn  } = require('../middleware/authMiddleware');

// Public — the actual shareable link
router.get('/go/:trackingCode', identifyIfLoggedIn, trackClick);

// Private
router.post('/generate', protect, generateLink);
router.post('/:trackingCode/simulate-purchase', protect, simulatePurchase);
router.get('/my-links', protect, getMyLinks);

module.exports = router;