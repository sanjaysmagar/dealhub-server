const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const affiliateLinkSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  trackingCode: {
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  clicks: {
    type: Number,
    default: 0,
  },
  conversions: {
    type: Number,
    default: 0,
  },
  pointsEarned: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

affiliateLinkSchema.index({ dealId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('AffiliateLink', affiliateLinkSchema);