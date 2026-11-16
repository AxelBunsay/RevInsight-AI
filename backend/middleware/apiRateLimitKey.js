const jwt = require('jsonwebtoken');
const { ipKeyGenerator } = require('express-rate-limit');

// Signed-in users sharing a shop/network IP get independent request budgets.
// Verify the signature before using identity; forged tokens use the IP budget.
function apiRateLimitKey(req) {
  const authorization = req.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) {
    try {
      const claims = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
      const id = claims.role === 'admin' ? claims.id : claims.userId;
      if (['admin', 'customer', 'mechanic'].includes(claims.role) && /^[a-f\d]{24}$/i.test(String(id))) {
        return `${claims.role}:${id}`;
      }
    } catch { /* Invalid credentials retain the anonymous IP budget. */ }
  }
  return ipKeyGenerator(req.ip);
}

module.exports = apiRateLimitKey;
