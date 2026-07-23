const Deal = require("../models/Deal");
const AffiliateLink = require("../models/AffiliateLink");
const { awardPoints } = require("../utils/rewardEngine");
const { buildAffiliateUrl } = require("../utils/affiliateUrlBuilder");

// ─── GENERATE LINK ─────────────────────────────────────────────
// @route   POST /api/affiliate/generate
// @access  Private — any logged-in user, for any approved deal
// Body: { dealId }
const generateLink = async (req, res) => {
  try {
    const { dealId } = req.body;

    const deal = await Deal.findById(dealId);
    if (!deal || deal.status !== "approved") {
      return res.status(404).json({ message: "Deal not found" });
    }

    // Only the deal's original poster can hold an affiliate link for it —
    // keeps all reward-earning tied to the person who actually contributed
    // the deal, and guarantees exactly one tracking code per deal (which
    // also avoids any eBay commission attribution ambiguity).
    if (deal.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message:
          "Only the person who posted this deal can generate an affiliate link for it",
      });
    }

    // Reuse existing link (should already exist from auto-creation at
    // posting time — this is a safety net, not the normal path)
    let link = await AffiliateLink.findOne({ dealId, userId: req.user._id });
    if (!link) {
      link = await AffiliateLink.create({ dealId, userId: req.user._id });

      if (!deal.affiliate?.url) {
        const { url, platform } = buildAffiliateUrl({
          externalLink: deal.externalLink,
          retailer: deal.retailer,
          customId: link.trackingCode,
        });

        if (url) {
          deal.affiliate = { url, platform, trackingCode: link.trackingCode };
          await deal.save();
        }
      }
    }

    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    res.status(201).json({
      message: "Affiliate link ready to share",
      trackingCode: link.trackingCode,
      shareUrl: `${baseUrl}/api/affiliate/go/${link.trackingCode}`,
      clicks: link.clicks,
      conversions: link.conversions,
      pointsEarned: link.pointsEarned,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── CLICK + REDIRECT ──────────────────────────────────────────
// @route   GET /api/affiliate/go/:trackingCode
// @access  Public — deliberately NO auth. Real customers clicking
// this link from social media won't be logged into your platform.
const trackClick = async (req, res) => {
  try {
    const link = await AffiliateLink.findOne({
      trackingCode: req.params.trackingCode,
    });
    if (!link)
      return res
        .status(404)
        .json({ message: "Invalid or expired affiliate link" });

    const deal = await Deal.findById(link.dealId);
    if (!deal)
      return res.status(404).json({ message: "Deal no longer exists" });

    // Record the click + award the click point
    link.clicks += 1;
    link.pointsEarned += await awardPoints({
      userId: link.userId,
      type: "click",
      affiliateLinkId: link._id,
    });

    // ─── AUTO-SIMULATE CONVERSION (~10% chance) ──────────────────
    // Stand-in for a real eBay/Skimlinks postback until that's wired up.
    if (Math.random() < 0.1) {
      link.conversions += 1;
      link.pointsEarned += await awardPoints({
        userId: link.userId,
        type: "conversion",
        affiliateLinkId: link._id,
        description: "Simulated purchase (auto)",
      });
    }

    await link.save();

    // ─── REDIRECT TARGET ───────────────────────────────────────────
    // When eBay/Skimlinks is integrated, deal.affiliate.url gets
    // populated and takes over automatically — nothing else changes.
    res.redirect(302, deal.affiliate?.url || deal.externalLink);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── MANUAL "SIMULATE PURCHASE" (for demos) ─────────────────────
// @route   POST /api/affiliate/:trackingCode/simulate-purchase
// @access  Private — kept open to any logged-in user since this is
// purely a demo/testing tool, not a real transaction.
const simulatePurchase = async (req, res) => {
  try {
    const link = await AffiliateLink.findOne({
      trackingCode: req.params.trackingCode,
    });
    if (!link)
      return res.status(404).json({ message: "Affiliate link not found" });

    link.conversions += 1;
    const points = await awardPoints({
      userId: link.userId,
      type: "conversion",
      affiliateLinkId: link._id,
      description: "Simulated purchase (manual demo trigger)",
    });
    link.pointsEarned += points;
    await link.save();

    res.status(200).json({
      message: "Purchase simulated successfully",
      pointsAwarded: points,
      link,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── MY AFFILIATE LINKS (for dashboard) ─────────────────────────
// @route   GET /api/affiliate/my-links
// @access  Private
const getMyLinks = async (req, res) => {
  try {
    const links = await AffiliateLink.find({ userId: req.user._id })
      .populate("dealId", "title imageUrl discountPercent retailer")
      .sort({ createdAt: -1 });

    res.status(200).json(links);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { generateLink, trackClick, simulatePurchase, getMyLinks };
