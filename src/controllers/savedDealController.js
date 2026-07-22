const SavedDeal = require("../models/SavedDeal");

// @route   POST /api/saved/:dealId/toggle
// @access  Private
const toggleSaveDeal = async (req, res) => {
  try {
    const { dealId } = req.params;
    const existing = await SavedDeal.findOne({ dealId, userId: req.user._id });

    if (existing) {
      await existing.deleteOne();
      return res.status(200).json({ saved: false });
    }

    await SavedDeal.create({ dealId, userId: req.user._id });
    res.status(200).json({ saved: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/saved/my-saved
// @access  Private
const getMySavedDeals = async (req, res) => {
  try {
    const saved = await SavedDeal.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: "dealId",
        populate: { path: "postedBy", select: "username avatar" },
      });

    // Filter out saves pointing to deals that were later deleted
    const deals = saved.filter((s) => s.dealId).map((s) => s.dealId);

    res.status(200).json(deals);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { toggleSaveDeal, getMySavedDeals };
