const jwt = require('jsonwebtoken');
const { isDeletedCustomer, isInactiveMechanic } = require('./auth');

const authorizeRoles = (...roles) => async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  if (!roles.includes(decoded.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (decoded.role === 'customer') {
    try {
      if (await isDeletedCustomer(decoded.userId)) {
        return res.status(401).json({ message: 'This customer account has been deleted.' });
      }
      if (decoded.role === 'mechanic') {
        try {
          if (await isInactiveMechanic(decoded.userId)) {
            return res.status(401).json({ message: 'This mechanic account is inactive.' });
          }
        } catch (error) {
          console.error('[authorizeRoles] mechanic status check failed', error);
          return res.status(500).json({ message: 'Authentication could not be verified.' });
        }
      }
    } catch (error) {
      console.error('[authorizeRoles] customer status check failed', error);
      return res.status(500).json({ message: 'Authentication could not be verified.' });
    }
  }

  req.user = decoded;
  return next();
};

module.exports = { authorizeRoles };