const { rateLimit } = require('express-rate-limit');

function getLoginRateLimitSettings(env = process.env) {
  const parsedWindowMinutes = Number.parseInt(env.LOGIN_RATE_LIMIT_WINDOW_MINUTES, 10);
  const parsedLimit = Number.parseInt(env.LOGIN_RATE_LIMIT_MAX, 10);
  const windowMinutes = Number.isFinite(parsedWindowMinutes) && parsedWindowMinutes > 0
    ? parsedWindowMinutes
    : 2;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : 5;

  return {
    windowMinutes,
    windowMs: windowMinutes * 60 * 1000,
    limit
  };
}

function getRetryMessage(req, settings = getLoginRateLimitSettings()) {
  const resetTime = req.rateLimit?.resetTime;
  const remainingMs = resetTime instanceof Date
    ? Math.max(0, resetTime.getTime() - Date.now())
    : settings.windowMs;
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return {
    message: `Too many login attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  };
}

const createLoginRateLimit = () => {
  const settings = getLoginRateLimitSettings();
  if (process.env.NODE_ENV === 'test') return (req, res, next) => next();
  return rateLimit({
    windowMs: settings.windowMs,
    limit: settings.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: (req) => getRetryMessage(req, settings)
  });
};

createLoginRateLimit.getLoginRateLimitSettings = getLoginRateLimitSettings;
createLoginRateLimit.getRetryMessage = getRetryMessage;
module.exports = createLoginRateLimit;
