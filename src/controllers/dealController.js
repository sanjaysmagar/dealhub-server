const Deal = require("../models/Deal");
const AffiliateLink = require("../models/AffiliateLink");
const { buildAffiliateUrl } = require("../utils/affiliateUrlBuilder");
const { checkAndAwardBadges } = require("../utils/rewardEngine");
const User = require("../models/User");
const SavedDeal = require("../models/SavedDeal");
const { notify } = require("../utils/notify");

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
      images,
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
      imageUrl: imageUrl || (images && images[0]) || "",
      images: images || [],
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
      postedBy,
      exclude,
      sort = "hot",
      page = 1,
      limit = 10,
    } = req.query;

    const now = new Date();
    const filter = {
      status: "approved",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    };
    if (search) filter.$text = { $search: search };
    if (category) filter.category = category;
    if (retailer) filter.retailer = retailer;
    if (postedBy) filter.postedBy = postedBy;
    if (exclude) filter._id = { $ne: exclude };

    const sortOptions = {
      hot: { score: -1 },
      new: { createdAt: -1 },
      top: { "votes.up": -1 },
    };
    const sortBy = sortOptions[sort] || sortOptions.hot;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const deals = await Deal.find(filter)
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum)
      .populate("postedBy", "username avatar");

    const total = await Deal.countDocuments(filter);

    // Personalise each deal with this user's vote + saved status,
    // without exposing the full voters list to the client.
    let savedIds = new Set();
    if (req.user) {
      const mySaves = await SavedDeal.find({ userId: req.user._id }).select(
        "dealId",
      );
      savedIds = new Set(mySaves.map((s) => s.dealId.toString()));
    }

    const dealsOut = deals.map((deal) => {
      const obj = deal.toObject();
      if (req.user) {
        const mine = obj.voters.find(
          (v) => v.userId.toString() === req.user._id.toString(),
        );
        obj.myVote = mine ? mine.voteType : null;
        obj.isSaved = savedIds.has(obj._id.toString());
      } else {
        obj.myVote = null;
        obj.isSaved = false;
      }
      delete obj.voters;
      return obj;
    });

    res.status(200).json({
      deals: dealsOut,
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

// ─── FEATURED DEAL (top-rated, non-expired) ─────────────────
// @route   GET /api/deals/featured
// @access  Public
const getFeaturedDeal = async (req, res) => {
  try {
    const now = new Date();

    const deal = await Deal.findOne({
      status: "approved",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .sort({ score: -1 })
      .populate("postedBy", "username avatar")
      .select("-voters");

    res.status(200).json(deal); // null if no deals exist yet — frontend handles that
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── PLATFORM STATS (real, computed from actual data) ────────
// @route   GET /api/deals/stats
// @access  Public
const getPlatformStats = async (req, res) => {
  try {
    const totalDeals = await Deal.countDocuments({ status: "approved" });
    const totalMembers = await User.countDocuments();

    const savingsResult = await Deal.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: null,
          totalSaved: {
            $sum: { $subtract: ["$originalPrice", "$discountedPrice"] },
          },
        },
      },
    ]);
    const totalSaved = savingsResult[0]?.totalSaved || 0;

    res.status(200).json({ totalDeals, totalMembers, totalSaved });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── GET SINGLE DEAL ─────────────────────────────────────────
// @route   GET /api/deals/:id
// @access  Public
const getDealById = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id).populate(
      "postedBy",
      "username avatar points badges",
    );

    if (!deal || deal.status === "rejected") {
      return res.status(404).json({ message: "Deal not found" });
    }

    const obj = deal.toObject();
    if (req.user) {
      const mine = obj.voters.find(
        (v) => v.userId.toString() === req.user._id.toString(),
      );
      obj.myVote = mine ? mine.voteType : null;
      obj.isSaved = !!(await SavedDeal.exists({
        dealId: deal._id,
        userId: req.user._id,
      }));
    } else {
      obj.myVote = null;
      obj.isSaved = false;
    }
    delete obj.voters;

    res.status(200).json(obj);
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
      images,
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
        images,
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
    const { voteType } = req.body;

    if (!["up", "down"].includes(voteType)) {
      return res.status(400).json({ message: "Vote type must be up or down" });
    }

    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: "Deal not found" });

    const isSelfVote = deal.postedBy.toString() === req.user._id.toString();
    let wasRemoved = false;

    const existingVoteIndex = deal.voters.findIndex(
      (v) => v.userId.toString() === req.user._id.toString(),
    );

    if (existingVoteIndex !== -1) {
      const existingVote = deal.voters[existingVoteIndex];
      if (existingVote.voteType === voteType) {
        deal.votes[voteType] -= 1;
        deal.voters.splice(existingVoteIndex, 1);
        wasRemoved = true;
      } else {
        deal.votes[existingVote.voteType] -= 1;
        deal.votes[voteType] += 1;
        deal.voters[existingVoteIndex].voteType = voteType;
      }
    } else {
      deal.votes[voteType] += 1;
      deal.voters.push({ userId: req.user._id, voteType });
    }

    deal.score = deal.votes.up - deal.votes.down;
    await deal.save();

    // Notify the poster of a genuine new/switched vote — skip self-votes
    // (voting on your own deal) and toggle-offs (removing a vote isn't
    // really "receiving" one).
    if (!isSelfVote && !wasRemoved) {
      await notify({
        userId: deal.postedBy,
        type: "vote_received",
        message: `Your deal "${deal.title}" got a ${voteType === "up" ? "🔥 Hot" : "❄️ Cold"} vote`,
        link: `/deals/${deal._id}`,
      });
    }

    const myVoteEntry = deal.voters.find(
      (v) => v.userId.toString() === req.user._id.toString(),
    );

    res.status(200).json({
      message: "Vote recorded",
      votes: deal.votes,
      score: deal.score,
      myVote: myVoteEntry ? myVoteEntry.voteType : null,
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

    await notify({
      userId: deal.postedBy,
      type: status === "approved" ? "deal_approved" : "deal_rejected",
      message:
        status === "approved"
          ? `Your deal "${deal.title}" was approved and is now live!`
          : `Your deal "${deal.title}" was rejected`,
      link: status === "approved" ? `/deals/${deal._id}` : null,
    });

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
  getFeaturedDeal,
  getPlatformStats,
};
