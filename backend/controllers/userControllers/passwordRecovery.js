const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const mail = require('../../utils/sendEmail');
const { validCustomerPassword } = require('../../utils/customerPassword');

const confirmation = 'If a customer account uses this email, we’ll send a reset code.';
const invalidCode = 'The reset code is invalid or expired. Request a new code.';
const minute = 60000;

function accountFilter(email) {
  return { email, role: 'customer', isEmailVerified: true, isActive: { $ne: false }, isDeleted: { $ne: true } };
}
function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function digest(email, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET)
    .update('customer-password-recovery:' + email + ':' + code).digest('hex');
}

async function requestCode(req, res) {
  const email = normalizedEmail(req.body?.email);
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();
  const recovery = { digest: digest(email, code), expiresAt: new Date(now + 5 * minute), attempts: 0, lastSentAt: new Date(now) };
  const user = await User.findOneAndUpdate({
    ...accountFilter(email),
    $or: [{ 'passwordRecovery.lastSentAt': { $exists: false } }, { 'passwordRecovery.lastSentAt': { $lte: new Date(now - minute) } }]
  }, { $set: { passwordRecovery: recovery } }).select('email');
  res.json({ message: confirmation });
  if (user) {
    try {
      await mail.sendEmail({ to: user.email, subject: 'RevInsight password reset code',
        text: `Your customer password reset code is ${code}. It expires in 5 minutes. If you did not request it, you can ignore this email.` });
    } catch {
      await User.updateOne({ _id: user._id, 'passwordRecovery.digest': recovery.digest }, { $unset: { passwordRecovery: 1 } });
    }
  }
}

async function resetPassword(req, res) {
  const { code, newPassword, confirmPassword } = req.body || {};
  const email = normalizedEmail(req.body?.email);
  if (!email || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ message: invalidCode });
  if (!validCustomerPassword(newPassword)) return res.status(400).json({ message: 'New password must be at least 8 characters and include a letter and a number.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New password and confirmation do not match.' });

  // Reserve one of five attempts atomically, including when requests arrive together.
  const user = await User.findOneAndUpdate({
    ...accountFilter(email), 'passwordRecovery.expiresAt': { $gt: new Date() }, 'passwordRecovery.attempts': { $lt: 5 }
  }, { $inc: { 'passwordRecovery.attempts': 1 } }).select('+passwordRecovery +password');
  const expected = digest(email, code);
  if (!user || !crypto.timingSafeEqual(Buffer.from(user.passwordRecovery.digest, 'hex'), Buffer.from(expected, 'hex'))) {
    return res.status(400).json({ message: invalidCode });
  }
  if (await bcrypt.compare(newPassword, user.password)) return res.status(400).json({ message: 'Choose a different password from your current password.' });
  const password = await bcrypt.hash(newPassword, 10);
  const result = await User.updateOne({
    ...accountFilter(email), _id: user._id, 'passwordRecovery.digest': expected, 'passwordRecovery.expiresAt': { $gt: new Date() }
  }, { $set: { password }, $inc: { sessionVersion: 1 }, $unset: { passwordRecovery: 1, loginChallenge: 1 } });
  if (!result.modifiedCount) return res.status(400).json({ message: invalidCode });
  let message = 'Your password was reset. Sign in with your new password.';
  try {
    await mail.sendEmail({ to: user.email, subject: 'Your RevInsight password was changed',
      text: 'Your customer account password was reset. If you did not request this change, contact the shop.' });
  } catch {
    message += ' The confirmation email could not be delivered.';
  }
  return res.json({ message });
}

module.exports = { requestCode, resetPassword };
