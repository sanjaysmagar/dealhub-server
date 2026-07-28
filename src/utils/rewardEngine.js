const User = require('../models/User');
const Reward = require('../models/Reward');
const Deal = require('../models/Deal');
const AffiliateLink = require('../models/AffiliateLink');
const { notify } = require('./notify');

const POINTS = {
  click: 1,
  conversion: 20,
};

// ─── BADGE DEFINITIONS ────────────────────────────────────────────
// Add new badges here in future — nothing else needs changing
const BADGES = [
  {
    id: 'first_deal',
    label: 'First Deal',
    description: 'Posted your first deal',
    check: async (userId) => {
      const count = await Deal.countDocuments({ postedBy: userId });
      return count >= 1;
    },
  },
  {
    id: 'deal_maker',
    label: 'Deal Maker',
    description: 'Posted 5 deals',
    check: async (userId) => {
      const count = await Deal.countDocuments({ postedBy: userId });
      return count >= 5;
    },
  },
  {
    id: 'click_king',
    label: 'Click King',
    description: 'Earned 100 total clicks across all your links',
    check: async (userId) => {
      const result = await AffiliateLink.aggregate([
        { $match: { userId } },
        { $group: { _id: null, totalClicks: { $sum: '$clicks' } } },
      ]);
      return result.length > 0 && result[0].totalClicks >= 100;
    },
  },
  {
    id: 'converter',
    label: 'Converter',
    description: 'Achieved 10 total conversions across all your links',
    check: async (userId) => {
      const result = await AffiliateLink.aggregate([
        { $match: { userId } },
        { $group: { _id: null, totalConversions: { $sum: '$conversions' } } },
      ]);
      return result.length > 0 && result[0].totalConversions >= 10;
    },
  },
  {
    id: 'hot_shot',
    label: 'Hot Shot',
    description: 'Had a deal reach 10+ upvotes',
    check: async (userId) => {
      const deal = await Deal.findOne({ postedBy: userId, 'votes.up': { $gte: 10 } });
      return !!deal;
    },
  },
  {
    id: 'point_collector',
    label: 'Point Collector',
    description: 'Earned 100 total points',
    check: async (userId) => {
      const user = await User.findById(userId);
      return user && user.points >= 100;
    },
  },
];

// ─── CHECK AND AWARD BADGES ───────────────────────────────────────
// Runs automatically after every point award.
// Checks every badge condition and awards any not yet earned.
const checkAndAwardBadges = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return;

  const newBadges = [];

  for (const badge of BADGES) {
    // Skip if already earned
    if (user.badges.includes(badge.id)) continue;

    const earned = await badge.check(userId);
    if (earned) {
      newBadges.push(badge.id);
    }
  }

if (newBadges.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $push: { badges: { $each: newBadges } },
    });

    // Log each badge as a reward event so it shows in history,
    // and notify the user for each one earned
    for (const badgeId of newBadges) {
      const badge = BADGES.find(b => b.id === badgeId);
      await Reward.create({
        userId,
        type: 'badge',
        points: 0,
        description: `Badge unlocked: ${badge.label} — ${badge.description}`,
      });

      await notify({
        userId,
        type: 'badge_earned',
        message: `🏆 New badge unlocked: ${badge.label}!`,
        link: '/rewards',
      });
    }
  }

  return newBadges;
};

// ─── AWARD POINTS ─────────────────────────────────────────────────
// Central function — every part of the app uses this to give points.
// Never update User.points directly anywhere else in the codebase.
const awardPoints = async ({ userId, type, affiliateLinkId, description }) => {
  const points = POINTS[type];
  if (!points) throw new Error(`Unknown reward type: ${type}`);

  await User.findByIdAndUpdate(userId, { $inc: { points } });

  const finalDescription = description || (type === 'click'
    ? 'Affiliate link click reward'
    : 'Affiliate conversion reward');

  await Reward.create({
    userId,
    type,
    points,
    description: finalDescription,
    affiliateLinkId: affiliateLinkId || null,
  });

  await notify({
    userId,
    type: 'points_earned',
    message: `+${points} pts — ${finalDescription}`,
    link: '/rewards',
  });

  // Auto-check badges after every award
  await checkAndAwardBadges(userId);

  return points;
};

module.exports = { awardPoints, checkAndAwardBadges, POINTS, BADGES };