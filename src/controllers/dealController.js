const Deal = require("../models/Deal");
const AffiliateLink = require("../models/AffiliateLink");
const { buildAffiliateUrl } = require("../utils/affiliateUrlBuilder");
const { checkAndAwardBadges } = require("../utils/rewardEngine");

// ─── CREATE DEAL ─────────────────────────────────────────────
// @route   POST /api/deals
// @access  Private
const createDeal = async (req, res) => {
  try {
    const {
      title,
      description,
      originalPrice,
      discountedPrice,
      category,
      imageUrl,
      externalLink,
      retailer,
      expiresAt,
    } = req.body;

    const deal = await Deal.create({
      title,
      description,
      originalPrice,
      discountedPrice,
      category,
      imageUrl,
      externalLink,
      retailer: retailer || "other",
      expiresAt: expiresAt || null,
      postedBy: req.user._id,
    });

    // ─── AUTO-CREATE THE POSTER'S AFFILIATE LINK ────────────────────
    // Every deal gets a tracked link owned by whoever posted it, so the
    // main "Get This Deal" button on the detail page earns them clicks,
    // points, and (once eBay/Skimlinks credentials exist for that
    // retailer) real commission — by default, without them having to
    // manually click "Generate My Affiliate Link" first.
    const posterLink = await AffiliateLink.create({
      dealId: deal._id,
      userId: req.user._id,
    });

    const { url, platform } = buildAffiliateUrl({
      externalLink: deal.externalLink,
      retailer: deal.retailer,
      customId: posterLink.trackingCode,
    });

    deal.affiliate = {
      url: url || null,
      platform: platform || null,
      trackingCode: posterLink.trackingCode, // always set, even if url is null —
      // trackClick() falls back to externalLink
    };
    await deal.save();

    // Check for first_deal and deal_maker badges automatically
    await checkAndAwardBadges(req.user._id);

    const populatedDeal = await Deal.findById(deal._id).populate(
      "postedBy",
      "username avatar",
    );

    res.status(201).json({
      message: "Deal posted successfully",
      deal: populatedDeal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET ALL DEALS ───────────────────────────────────────────
// @route   GET /api/deals
// @access  Public
// Supports: ?search=&category=&retailer=&sort=hot|new|top&page=1&limit=10
const getAllDeals = async (req, res) => {
  try {
    const {
      search,
      category,
      retailer,
      sort = "hot",
      page = 1,
      limit = 10,
    } = req.query;

    // Only show live approved deals
    const filter = { status: "approved" };

    if (search) {
      filter.$text = { $search: search };
    }
    if (category) filter.category = category;
    if (retailer) filter.retailer = retailer;

    // Sort options — just like HotUKDeals
    const sortOptions = {
      hot: { score: -1 }, // highest score (upvotes - downvotes)
      new: { createdAt: -1 }, // newest first
      top: { "votes.up": -1 }, // most upvotes
    };
    const sortBy = sortOptions[sort] || sortOptions.hot;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const deals = await Deal.find(filter)
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum)
      .populate("postedBy", "username avatar")
      .select("-voters"); // don't expose full voters list

    const total = await Deal.countDocuments(filter);

    res.status(200).json({
      deals,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET SINGLE DEAL ─────────────────────────────────────────
// @route   GET /api/deals/:id
// @access  Public
const getDealById = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id)
      .populate("postedBy", "username avatar points badges")
      .select("-voters");

    if (!deal || deal.status === "rejected") {
      return res.status(404).json({ message: "Deal not found" });
    }

    res.status(200).json(deal);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── UPDATE DEAL ─────────────────────────────────────────────
// @route   PUT /api/deals/:id
// @access  Private (own deal only)
const updateDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (deal.postedBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorised to update this deal" });
    }

    const {
      title,
      description,
      originalPrice,
      discountedPrice,
      category,
      imageUrl,
      externalLink,
      retailer,
      expiresAt,
    } = req.body;

    const updatedDeal = await Deal.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        originalPrice,
        discountedPrice,
        category,
        imageUrl,
        externalLink,
        retailer,
        expiresAt,
      },
      { new: true, runValidators: true },
    ).populate("postedBy", "username avatar");

    res.status(200).json({
      message: "Deal updated successfully",
      deal: updatedDeal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── DELETE DEAL ─────────────────────────────────────────────
// @route   DELETE /api/deals/:id
// @access  Private (own deal or admin)
const deleteDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const isOwner = deal.postedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorised to delete this deal" });
    }

    await deal.deleteOne();
    res.status(200).json({ message: "Deal deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── VOTE (HOT / COLD) ───────────────────────────────────────
// @route   POST /api/deals/:id/vote
// @access  Private
// Behaviour:
//   First vote        → adds vote
//   Same vote again   → removes it (toggle off)
//   Opposite vote     → switches from up to down or vice versa
const voteDeal = async (req, res) => {
  try {
    const { voteType } = req.body; // 'up' or 'down'

    if (!["up", "down"].includes(voteType)) {
      return res.status(400).json({ message: "Vote type must be up or down" });
    }

    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: "Deal not found" });

    const existingVoteIndex = deal.voters.findIndex(
      (v) => v.userId.toString() === req.user._id.toString(),
    );

    if (existingVoteIndex !== -1) {
      const existingVote = deal.voters[existingVoteIndex];

      if (existingVote.voteType === voteType) {
        // Same vote → toggle off
        deal.votes[voteType] -= 1;
        deal.voters.splice(existingVoteIndex, 1);
      } else {
        // Different vote → switch
        deal.votes[existingVote.voteType] -= 1;
        deal.votes[voteType] += 1;
        deal.voters[existingVoteIndex].voteType = voteType;
      }
    } else {
      // New vote
      deal.votes[voteType] += 1;
      deal.voters.push({ userId: req.user._id, voteType });
    }

    // Recalculate score for hot ranking
    deal.score = deal.votes.up - deal.votes.down;
    await deal.save();

    res.status(200).json({
      message: "Vote recorded",
      votes: deal.votes,
      score: deal.score,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── ADMIN — REMOVE / RESTORE DEAL ──────────────────────────
// @route   PUT /api/deals/:id/moderate
// @access  Admin only
const moderateDeal = async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'

    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be approved or rejected" });
    }

    const deal = await Deal.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    if (!deal) return res.status(404).json({ message: "Deal not found" });

    res.status(200).json({
      message: `Deal ${status} successfully`,
      deal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET MY DEALS ─────────────────────────────────────────────
// @route   GET /api/deals/user/mydeals
// @access  Private
const getMyDeals = async (req, res) => {
  try {
    const deals = await Deal.find({ postedBy: req.user._id })
      .sort({ createdAt: -1 })
      .select("-voters");

    res.status(200).json(deals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── ADMIN — GET ALL DEALS (any status) ─────────────────────
// @route   GET /api/deals/admin/all
// @access  Admin only
const getAllDealsAdmin = async (req, res) => {
  try {
    const { search, category, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const deals = await Deal.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("postedBy", "username avatar")
      .select("-voters");

    const total = await Deal.countDocuments(filter);
    const approvedCount = await Deal.countDocuments({ status: "approved" });
    const rejectedCount = await Deal.countDocuments({ status: "rejected" });

    res.status(200).json({
      deals,
      counts: {
        total: approvedCount + rejectedCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        limit: limitNum,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createDeal,
  getAllDeals,
  getDealById,
  updateDeal,
  deleteDeal,
  voteDeal,
  moderateDeal,
  getMyDeals,
  getAllDealsAdmin,
};
