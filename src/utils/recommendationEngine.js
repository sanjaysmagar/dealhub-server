const Deal = require("../models/Deal");
const SavedDeal = require("../models/SavedDeal");
const User = require("../models/User");

// How heavily each signal counts toward a user's category affinity.
// Stated preference counts most since the user told us directly;
// votes and saves are behavioural signals, weighted lower.
const WEIGHTS = { preference: 3, upvote: 2, save: 1 };

// Builds a { category: weight } affinity map from a user's stated
// preferences plus their voting and saving history.
const getCategoryAffinity = async (userId) => {
  const affinity = {};
  const add = (category, amount) => {
    if (!category) return;
    affinity[category] = (affinity[category] || 0) + amount;
  };

  const user = await User.findById(userId).select("preferences");
  (user?.preferences || []).forEach((cat) => add(cat, WEIGHTS.preference));

  const upvoted = await Deal.find({
    voters: { $elemMatch: { userId, voteType: "up" } },
  }).select("category");
  upvoted.forEach((d) => add(d.category, WEIGHTS.upvote));

  const saved = await SavedDeal.find({ userId }).populate("dealId", "category");
  saved.forEach((s) => s.dealId && add(s.dealId.category, WEIGHTS.save));

  return affinity;
};

// Ranked list of deals personalised for a user. Falls back to the
// general "hot" feed for users with no signal yet (new accounts) —
// this is what handles the cold-start case from your lit review.
const getRecommendedDeals = async (userId, limit = 8) => {
  const now = new Date();

  const [affinity, saved] = await Promise.all([
    getCategoryAffinity(userId),
    SavedDeal.find({ userId }).select("dealId"),
  ]);

  const excludeIds = saved.map((s) => s.dealId);
  const baseFilter = {
    status: "approved",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    postedBy: { $ne: userId }, // don't recommend the user's own deals
    _id: { $nin: excludeIds }, // don't recommend what they've already saved
  };

  const preferredCategories = Object.keys(affinity);
  let picked = [];

  if (preferredCategories.length > 0) {
    const candidates = await Deal.find({
      ...baseFilter,
      category: { $in: preferredCategories },
    })
      .sort({ score: -1, createdAt: -1 })
      .limit(limit * 3) // overfetch so the re-rank below has room to work with
      .populate("postedBy", "username avatar")
      .select("-voters");

    picked = candidates
      .map((deal) => ({
        deal,
        rank: (affinity[deal.category] || 0) * 10 + deal.score,
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map((r) => r.deal);
  }

  if (picked.length < limit) {
    const excludeMore = [...excludeIds, ...picked.map((d) => d._id)];
    const filler = await Deal.find({
      ...baseFilter,
      _id: { $nin: excludeMore },
    })
      .sort({ score: -1, createdAt: -1 })
      .limit(limit - picked.length)
      .populate("postedBy", "username avatar")
      .select("-voters");
    picked = [...picked, ...filler];
  }

  return picked;
};

module.exports = { getCategoryAffinity, getRecommendedDeals };
