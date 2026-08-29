const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  googleAuth,
  verifyOtpHandler,
  resendOtpHandler,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/verify-otp', verifyOtpHandler);
router.post('/resend-otp', resendOtpHandler);
router.get('/me', protect, getMe); // protected — needs JWT token
router.put('/profile', protect, updateProfile);

module.exports = router;