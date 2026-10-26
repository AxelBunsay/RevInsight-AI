const { rateLimit } = require('express-rate-limit');

const createLoginRateLimit = () => process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
  });

module.exports = createLoginRateLimit;
