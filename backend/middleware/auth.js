const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Mechanic = require('../models/mechanic');

const customerSessionError = async (claims) => {
  const user = await User.findById(claims.userId).select('isDeleted isActive sessionVersion').lean();
  if (!user || user.isDeleted) return 'This customer account has been deleted.';
  if (user.isActive === false) return 'Customer account is inactive.';
  if ((user.sessionVersion ?? 0) !== (claims.sessionVersion ?? 0)) return 'Invalid token';
  return null;
};

const isInactiveMechanic = async (mechanicId) => {
  const mechanic = await Mechanic.findById(mechanicId).select('isActive').lean();
  return !mechanic || mechanic.isActive === false;
};

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  if (decoded.role === 'customer') {
    try {
      const message = await customerSessionError(decoded);
      if (message) return res.status(401).json({ message });
    } catch (error) {
      console.error('[authenticate] customer status check failed', error);
      return res.status(500).json({ message: 'Authentication could not be verified.' });
    }
  } else if (decoded.role === 'mechanic') {
    try {
      if (await isInactiveMechanic(decoded.userId)) {
        return res.status(401).json({ message: 'Mechanic account is inactive.' });
      }
    } catch (error) {
      console.error('[authenticate] mechanic status check failed', error);
      return res.status(500).json({ message: 'Authentication could not be verified.' });
    }
  }

  req.user = decoded;
  return next();
};

const adminOnly = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = { authenticate, adminOnly, customerSessionError, isInactiveMechanic };
