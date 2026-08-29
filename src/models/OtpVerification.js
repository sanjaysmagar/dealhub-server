const mongoose = require("mongoose");

const otpVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one active code per user — a new one replaces the old
    },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL index — Mongo deletes the doc once "now" passes expiresAt (the 0
// means no extra offset beyond that stored timestamp).
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpVerification", otpVerificationSchema);