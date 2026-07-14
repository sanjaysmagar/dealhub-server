const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['click', 'conversion', 'badge', 'deal_post'],
    required: true,
  },
  points: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  affiliateLinkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AffiliateLink',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('Reward', rewardSchema);