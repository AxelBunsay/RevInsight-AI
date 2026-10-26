const path = require('path');
const aiRoutes = require('./routes/adminRoutes/ai');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const userRoutes = require('./routes/user');
const customerRoutes = require('./routes/customer');
const mechanicRoutes = require('./routes/mechanic');
const adminRoutes = require('./routes/adminRoutes/admin');
const productRoutes = require('./routes/adminRoutes/product');
const serviceRoutes = require('./routes/adminRoutes/service');
const dashboardRoutes = require('./routes/adminRoutes/dashboard');
const chatRoutes = require('./routes/chat');
const cartRoutes = require('./routes/orderingRoutes/cart');
const orderRoutes = require('./routes/orderingRoutes/order');
const serviceRequestRoutes = require('./routes/serviceRequest');
const customerServiceRoutes = require('./routes/customerServices');
const mechanicPartsRoutes = require('./routes/mechanicParts');
const reservationRoutes = require('./routes/reservations');
const notificationRoutes = require('./routes/notifications');

const app = express();

app.set('trust proxy', 1);

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
) {
  throw new Error(
    'JWT_SECRET must be configured with at least 32 characters in production'
  );
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176'
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin is not allowed by CORS'));
    }
  })
);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com']
    }
  }
}));

app.use(
  '/api',
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false
    })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendPath));

app.use('/api/admin', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/mechanics', mechanicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin/services', serviceRoutes);
app.use('/api/services', customerServiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/mechanic', mechanicPartsRoutes);

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status || error.statusCode);
  const statusCode = status >= 400 && status < 600 ? status : 500;
  if (statusCode >= 500) console.error('[express] unhandled error:', error);
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'An unexpected server error occurred.' : error.message
  });
});

module.exports = app;
