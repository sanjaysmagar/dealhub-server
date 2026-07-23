const Reward = require("../models/Reward");
const User = require("../models/User");
const AffiliateLink = require("../models/AffiliateLink");
const Deal = require("../models/Deal");
const { BADGES, checkAndAwardBadges } = require("../utils/rewardEngine");

// ─── MY POINTS HISTORY ────────────────────────────────────────────
// @route   GET /api/rewards/history
// @access  Private
// Shows every point event: clicks, conversions, badges, deal posts
const getMyHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const history = await Reward.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("affiliateLinkId", "trackingCode clicks conversions");

    const total = await Reward.countDocuments({ userId: req.user._id });

    res.status(200).json({
      history,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── MY SUMMARY ───────────────────────────────────────────────────
// @route   GET /api/rewards/summary
// @access  Private
// Everything a user needs for their rewards dashboard in one call
const getMySummary = async (req, res) => {
  try {
    const userId = req.user._id;

    // Points and badges from user document
    const user = await User.findById(userId).select(
      "username points badges avatar",
    );

    // Total clicks and conversions across all affiliate links
    const affiliateStats = await AffiliateLink.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: "$clicks" },
          totalConversions: { $sum: "$conversions" },
          totalLinks: { $count: {} },
        },
      },
    ]);

    // Total deals posted
    const totalDeals = await Deal.countDocuments({ postedBy: userId });

    // User's rank on the leaderboard
    const rank =
      (await User.countDocuments({ points: { $gt: user.points } })) + 1;

    // Enrich badges with label and description
    const earnedBadges = BADGES.filter((b) => user.badges.includes(b.id)).map(
      (b) => ({
        id: b.id,
        label: b.label,
        description: b.description,
      }),
    );

    // Locked badges (not yet earned) — useful for frontend progress display
    const lockedBadges = BADGES.filter((b) => !user.badges.includes(b.id)).map(
      (b) => ({
        id: b.id,
        label: b.label,
        description: b.description,
      }),
    );

    const stats = affiliateStats[0] || {
      totalClicks: 0,
      totalConversions: 0,
      totalLinks: 0,
    };

    res.status(200).json({
      username: user.username,
      avatar: user.avatar,
      points: user.points,
      rank,
      totalDeals,
      totalLinks: stats.totalLinks,
      totalClicks: stats.totalClicks,
      totalConversions: stats.totalConversions,
      earnedBadges,
      lockedBadges,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── LEADERBOARD ──────────────────────────────────────────────────
// @route   GET /api/rewards/leaderboard?period=all|month|week
// @access  Public
const getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const period = req.query.period || "all";

    // ── All time — unchanged, reads directly from the running total ──
    if (period === "all") {
      const topUsers = await User.find({ points: { $gt: 0 } })
        .sort({ points: -1 })
        .limit(limit)
        .select("username avatar points badges");

      const leaderboard = topUsers.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        avatar: user.avatar,
        points: user.points,
        badgeCount: user.badges.length,
      }));

      return res.status(200).json(leaderboard);
    }

    // ── Month / Week — computed from individual timestamped Reward
    // events, since User.points has no time dimension of its own ──
    const now = new Date();
    let startDate;
    if (period === "week") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else {
      // Calendar month-to-date (resets on the 1st)
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const periodTotals = await Reward.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$userId", totalPoints: { $sum: "$points" } } },
      { $sort: { totalPoints: -1 } },
      { $limit: limit },
    ]);

    const userIds = periodTotals.map((p) => p._id);
    const users = await User.find({ _id: { $in: userIds } }).select(
      "username avatar badges",
    );
    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = u;
    });

    const leaderboard = periodTotals
      .map((p, index) => {
        const u = userMap[p._id.toString()];
        if (!u) return null; // safety: skip if the user account was since deleted
        return {
          rank: index + 1,
          username: u.username,
          avatar: u.avatar,
          points: p.totalPoints,
          badgeCount: u.badges.length,
        };
      })
      .filter(Boolean);

    res.status(200).json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── CHECK BADGES MANUALLY ────────────────────────────────────────
// @route   POST /api/rewards/check-badges
// @access  Private
// Useful to call from the frontend after any action —
// badges are checked automatically but this forces a recheck
const checkBadges = async (req, res) => {
  try {
    const newBadges = await checkAndAwardBadges(req.user._id);

    const user = await User.findById(req.user._id).select("badges");
    const allBadges = BADGES.filter((b) => user.badges.includes(b.id)).map(
      (b) => ({
        id: b.id,
        label: b.label,
        description: b.description,
      }),
    );

    res.status(200).json({
      newBadgesAwarded: newBadges || [],
      allEarnedBadges: allBadges,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getMyHistory, getMySummary, getLeaderboard, checkBadges };
