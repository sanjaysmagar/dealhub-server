const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateProfile  } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe); // protected — needs JWT token
router.put('/profile', protect, updateProfile);

module.exports = router;