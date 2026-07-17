const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/dealController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// Public
router.get("/", getAllDeals);
router.get("/featured", getFeaturedDeal);
router.get("/:id", getDealById);

// Private
router.post("/", protect, createDeal);
router.get("/user/mydeals", protect, getMyDeals);
router.put("/:id", protect, updateDeal);
router.delete("/:id", protect, deleteDeal);
router.post("/:id/vote", protect, voteDeal);

// Admin only
router.get("/admin/all", protect, adminOnly, getAllDealsAdmin);
router.put("/:id/moderate", protect, adminOnly, moderateDeal);

module.exports = router;
