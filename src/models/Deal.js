const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Deal title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  originalPrice: {
    type: Number,
    required: [true, 'Original price is required'],
  },
  discountedPrice: {
    type: Number,
    required: [true, 'Discounted price is required'],
  },
  discountPercent: {
    type: Number,
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Beauty', 'Fashion', 'Tech', 'Home', 'Food', 'Travel', 'Sports', 'Gaming', 'Other'],
  },
  imageUrl: {
    type: String,
    default: '',
  },
  images: { type: [String], default: [] },
  externalLink: {
    type: String,
    required: [true, 'External deal link is required'],
  },
  retailer: {
    type: String,
    required: [true, 'Retailer is required'],
  },

  // ─── AFFILIATE SECTION ──────────────────────────────────────────
  // This is where eBay / Skimlinks plugs in later — don't remove this
  // When integration is ready:
  //   affiliate.url      = generated eBay rover / Skimlinks URL
  //   affiliate.platform = 'ebay' or 'skimlinks'
  //   affiliate.trackingCode = your unique tracking ID per user
  affiliate: {
    url: { type: String, default: null },
    platform: { type: String, default: null },
    trackingCode: { type: String, default: null },
  },
  // ────────────────────────────────────────────────────────────────

  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  votes: {
    up: { type: Number, default: 0 },
    down: { type: Number, default: 0 },
  },
  // Tracks who voted and how — prevents double voting
  voters: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voteType: { type: String, enum: ['up', 'down'] },
  }],
  // Score = upvotes - downvotes — used for hot ranking like HotUKDeals
  score: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['approved', 'rejected'],
    default: 'approved', // goes live immediately
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// Auto-calculate discount percentage
dealSchema.pre('save', function (next) {
  if (this.originalPrice && this.discountedPrice) {
    this.discountPercent = Math.round(
      ((this.originalPrice - this.discountedPrice) / this.originalPrice) * 100
    );
  }
  // next();
});

// Indexes for fast search and sorting
dealSchema.index({ title: 'text', description: 'text' });
dealSchema.index({ score: -1 });
dealSchema.index({ createdAt: -1 });
dealSchema.index({ category: 1 });
dealSchema.index({ retailer: 1 });

module.exports = mongoose.model('Deal', dealSchema);