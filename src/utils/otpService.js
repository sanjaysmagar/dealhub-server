const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const OtpVerification = require("../models/OtpVerification");
const sendEmail = require("./sendEmail");

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// Generates a fresh 6-digit code, stores its hash (replacing any
// existing code for this user), and emails it.
const issueOtp = async (user) => {
  const code = crypto.randomInt(100000, 1000000).toString(); // always 6 digits
  const otpHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await OtpVerification.findOneAndUpdate(
    { userId: user._id },
    { otpHash, expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await sendEmail({
    to: user.email,
    subject: "Your DealHub verification code",
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
  });
};

// Throws if a resend is requested before the cooldown elapses.
const assertResendAllowed = async (userId) => {
  const existing = await OtpVerification.findOne({ userId });
  if (!existing) return;
  const elapsed = Date.now() - existing.createdAt.getTime();
  if (elapsed < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    const err = new Error(`Please wait ${wait}s before requesting another code`);
    err.status = 429;
    throw err;
  }
};

// Verifies a submitted code against the stored hash; deletes the
// record on success so it can't be reused.
const verifyOtp = async (userId, submittedCode) => {
  const record = await OtpVerification.findOne({ userId });
  if (!record) return false;
  if (record.expiresAt < new Date()) {
    await record.deleteOne();
    return false;
  }
  const match = await bcrypt.compare(submittedCode, record.otpHash);
  if (!match) return false;
  await record.deleteOne();
  return true;
};

module.exports = { issueOtp, assertResendAllowed, verifyOtp };