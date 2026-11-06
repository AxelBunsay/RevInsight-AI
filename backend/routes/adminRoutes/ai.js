const express = require('express');
const router = express.Router();
const { askRevenueAI, getRevenueCardInsights } = require('../../controllers/adminControllers/aiController');
const { protect } = require('../../middleware/adminAuth');

router.post('/revenue/ask-ai', protect, askRevenueAI);
router.post('/ai/card-insights', protect, getRevenueCardInsights);

module.exports = router;