const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { chat } = require('../controllers/aichatController/chatController');
const { rateLimit } = require('express-rate-limit');

const chatRateLimit = process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.userId),
  message: { message: 'Chat limit reached. Please try again later.' }
  });

router.post('/', authenticate, chatRateLimit, chat);

module.exports = router;