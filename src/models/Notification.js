const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['deal_approved', 'deal_rejected', 'points_earned', 'badge_earned', 'vote_received'],
    required: true,
  },
  message: { type: String, required: true },
  link: { type: String, default: null }, // where clicking the notification should navigate to
  read: { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);