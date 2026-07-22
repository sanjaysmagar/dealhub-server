const mongoose = require("mongoose");

const savedDealSchema = new mongoose.Schema(
  {
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// One save per user per deal
savedDealSchema.index({ dealId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("SavedDeal", savedDealSchema);
