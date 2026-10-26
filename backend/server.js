const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const mongoose = require('mongoose');
const Admin = require('./models/adminModels/admin');
const ReservationSettings = require('./models/reservationSettings');
const { expireReservations } = require('./controllers/reservationController');

const mongoUri = process.env.MONGODB_URI;
const port = process.env.PORT || 5000;

const ensureAdminUser = async () => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn(
      'Admin bootstrap skipped: ADMIN_USERNAME and ADMIN_PASSWORD are not configured'
    );
    return;
  }

  try {
    const existingAdmin = await Admin.findOne({ username });

    if (!existingAdmin) {
      await Admin.create({ username, password });
      console.log(`Default admin created: ${username}`);
    } else {
      console.log(`Default admin already exists: ${username}`);
    }
  } catch (err) {
    console.error('Failed to create default admin:', err.message);
  }
};

if (!mongoUri) {
  console.error('MongoDB connection error: MONGODB_URI is not configured.');
  process.exit(1);
}

mongoose
  .connect(mongoUri)
  .then(async () => {
    console.log('MongoDB connected');
    await ensureAdminUser();
    await ReservationSettings.getDefaults();
    const reservationExpiryInterval = setInterval(() => {
      expireReservations().catch(error => console.error('Reservation expiry check failed:', error));
    }, 15 * 60 * 1000);
    reservationExpiryInterval.unref();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
