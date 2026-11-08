const User = require('../../models/user');
const PendingUser = require('../../models/pendingUser');
const Reservation = require('../../models/orderingModels/reservation');
const ServiceRequest = require('../../models/serviceRequest');
const BusinessRecord = require('../../models/businessRecord');
const Notification = require('../../models/notification');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { removeReceipt } = require('../../utils/paymentReceipt');
const emailSender = require('../../utils/sendEmail');
const EMAIL_DELIVERY_USER_MESSAGE = 'We could not send the verification email. Please try again in a moment.';

const handleEmailDeliveryError = (res, error) => {
  if (error?.code !== 'EMAIL_DELIVERY_FAILED') return false;
  const status = error.statusCode === 503 ? 503 : 502;
  res.status(status).json({ message: EMAIL_DELIVERY_USER_MESSAGE });
  return true;
};

const sendVerificationEmail = async (user, otp) => {
  await emailSender.sendEmail({
    to: user.email,
    subject: 'Verify your email',
    text: `
      Hello ${user.firstName},
      Your RevInsight verification code is: ${otp}
      This will expire in 10 minutes.
    `,
    html: `
      <div style="
        width: 100%;
        margin: 0;
        padding: 24px 12px;
        background-color: #f4f7fa;
        font-family: Arial, Helvetica, sans-serif;
        box-sizing: border-box;
      ">
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="max-width: 520px; margin: 0 auto;"
        >
          <tr>
            <td style="
              background-color: #F57627;
              padding: 28px 20px;
              text-align: center;
            ">
            </td>
          </tr>

          <tr>
            <td style="
              padding: 36px 24px;
              background-color: #ffffff;
              text-align: center;
            ">
              <h1 style="
                margin: 0 0 16px;
                color: #17202a;
                font-size: 26px;
                line-height: 1.2;
              ">
                Verify your email
              </h1>

              <p style="
                margin: 0 0 14px;
                color: #52616b;
                font-size: 16px;
                line-height: 1.6;
              ">
                Hello ${user.firstName},
              </p>

              <p style="
                margin: 0 auto 26px;
                max-width: 380px;
                color: #52616b;
                font-size: 15px;
                line-height: 1.6;
              ">
                Use the verification code below to complete your RevInsight account registration.
              </p>

              <div style="
                display: inline-block;
                max-width: 100%;
                padding: 18px 22px;
                background-color: #e8f4f7;
                border: 1px solid #b9dce5;
                border-radius: 8px;
                box-sizing: border-box;
              ">
                <span style="
                  color: #000000;
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 7px;
                ">
                  ${otp}
                </span>
              </div>

              <p style="
                margin: 26px 0 0;
                color: #687780;
                font-size: 14px;
                line-height: 1.5;
              ">
                This code will expire in <strong>10 minutes</strong>.
              </p>

              <p style="
                margin: 20px 0 0;
                color: #8a99a8;
                font-size: 13px;
                line-height: 1.5;
              ">
                If you did not request this verification code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="
              padding: 18px 20px;
              background-color: #f8fafb;
              text-align: center;
            ">
              <p style="
                margin: 0;
                color: #8a99a8;
                font-size: 12px;
              ">
                RevInsight Support
              </p>
            </td>
          </tr>
        </table>
      </div>
    `
  });
};

const sendLoginOtpEmail = async (user, otp) => {
  await emailSender.sendEmail({
    to: user.email,
    subject: 'Your RevInsight login code',
    text: `Hello ${user.firstName}, your RevInsight login code is ${otp}. It expires in 5 minutes.`,
    html: `<p>Hello ${user.firstName},</p><p>Your RevInsight login code is <strong>${otp}</strong>.</p><p>This code expires in 5 minutes. If you did not try to sign in, you can ignore this email.</p>`
  });
};

const resolveUserByIdentifier = async (identifier, { includePassword = false } = {}) => {
  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  if (!normalizedIdentifier) return null;
  const selectPassword = (query) => includePassword ? query.select('+password') : query;

  if (normalizedIdentifier.includes('@')) {
    const email = normalizedIdentifier.toLowerCase();
    const exact = await selectPassword(User.findOne({ email }));
    return exact || selectPassword(User.findOne({ email: normalizedIdentifier }).collation({ locale: 'en', strength: 2 }));
  }
  return selectPassword(User.findOne({ usernameLower: normalizedIdentifier.toLowerCase() }));
};

const hashLoginCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const createLoginCode = () => crypto.randomInt(100000, 1000000).toString();
const loginChallengeExpiry = () => new Date(Date.now() + 5 * 60 * 1000);
const LOGIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const maskEmail = (email) => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '';
  return `${local.charAt(0)}***@${domain}`;
};

const customerLoginResponse = (user, rememberMe) => {
  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: rememberMe === true ? '30d' : '1d'
  });
  return {
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage,
      twoFactorEnabled: user.twoFactorEnabled === true
    }
  };
};

// Step 1: Register Request - Send OTP to email
const registerRequest = async (req, res) => {
  try {
    const {
      email,
      username,
      usernameLower,
      password,
      firstName,
      lastName,
      phoneNumber
    } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: 'Email already in use'
      });
    }

    const [existingUsername, pendingUsername] = await Promise.all([
      User.findOne({ usernameLower }).select('_id').lean(),
      PendingUser.findOne({ usernameLower, email: { $ne: email } }).select('_id').lean()
    ]);
    if (existingUsername || pendingUsername) {
      return res.status(409).json({ message: 'Username is already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationOtp = crypto
      .randomInt(100000, 1000000)
      .toString();

    const verificationOtpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const pendingUser = await PendingUser.findOneAndUpdate(
      { email },
      {
        email,
        username,
        usernameLower,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        otp: {
          code: verificationOtp,
          expiresAt: verificationOtpExpiry,
          attempts: 0,
          lastSentAt: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    try {
      await sendVerificationEmail(pendingUser, verificationOtp);
    } catch (error) {
      await PendingUser.deleteOne({ _id: pendingUser._id });
      throw error;
    }

    return res.status(202).json({
      message: 'Registration pending. OTP sent to your email.',
      email
    });
  } catch (error) {
    console.error('[registerRequest] error:', error);

    if (handleEmailDeliveryError(res, error)) return;

    if (error.code === 11000 && error.keyPattern?.usernameLower) {
      return res.status(409).json({ message: 'Username is already taken' });
    }

    return res.status(500).json({
      message: 'Failed to register user'
    });
  }
};


// Step 2: Verify OTP - Create account after verification
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const pendingUser = await PendingUser
      .findOne({ email })
      .select('+password');

    if (!pendingUser) {
      return res.status(404).json({
        message: 'Registration not found or expired.'
      });
    }

    if (new Date() > pendingUser.otp.expiresAt) {
      await PendingUser.deleteOne({ _id: pendingUser._id });

      return res.status(400).json({
        message: 'OTP has expired. Please register again.'
      });
    }

    if (Number(pendingUser.otp.attempts || 0) >= 5) {
      return res.status(423).json({
        message: 'OTP verification is locked after too many incorrect attempts. Request a new code to continue.'
      });
    }

    if (pendingUser.otp.code !== otp) {
      const updatedPendingUser = await PendingUser.findOneAndUpdate(
        {
          _id: pendingUser._id,
          $or: [
            { 'otp.attempts': { $lt: 5 } },
            { 'otp.attempts': { $exists: false } }
          ]
        },
        { $inc: { 'otp.attempts': 1 } },
        { new: true }
      );
      if (!updatedPendingUser || Number(updatedPendingUser.otp.attempts) >= 5) {
        return res.status(423).json({
          message: 'OTP verification is locked after too many incorrect attempts. Request a new code to continue.'
        });
      }
      return res.status(400).json({
        message: 'Invalid OTP.'
      });
    }

    const user = await User.create({
      email: pendingUser.email,
      username: pendingUser.username,
      usernameLower: pendingUser.usernameLower,
      password: pendingUser.password,
      firstName: pendingUser.firstName,
      lastName: pendingUser.lastName,
      phoneNumber: pendingUser.phoneNumber,
      isEmailVerified: true
    });

    await PendingUser.deleteOne({ _id: pendingUser._id });

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Email verified successfully. Account created.',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[verifyOtp] error:', error);

    return res.status(500).json({
      message: 'Failed to verify OTP'
    });
  }
};

// Resend OTP - for expired or lost OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const pendingUser = await PendingUser.findOne({ email });

    if (!pendingUser) {
      return res.status(404).json({
        message: 'Registration not found or expired.'
      });
    }

    if (pendingUser.isEmailVerified) {
      return res.status(400).json({
        message: 'Email is already verified'
      });
    }

    const newOtp = crypto
      .randomInt(100000, 1000000)
      .toString();

    const newOtpExpiry = new Date(
      Date.now() + 10 * 60 * 1000
    );
    const previousOtp = pendingUser.otp.toObject();

    const cooldownCutoff = new Date(Date.now() - 60 * 1000);
    const updatedPendingUser = await PendingUser.findOneAndUpdate(
      {
        _id: pendingUser._id,
        $or: [
          { 'otp.lastSentAt': { $lte: cooldownCutoff } },
          { 'otp.lastSentAt': { $exists: false } }
        ]
      },
      {
        $set: {
          'otp.code': newOtp,
          'otp.expiresAt': newOtpExpiry,
          'otp.attempts': 0,
          'otp.lastSentAt': new Date()
        }
      },
      { new: true, runValidators: true }
    );
    if (!updatedPendingUser) {
      return res.status(429).json({
        message: 'Please wait 60 seconds before requesting another verification code.'
      });
    }
    try {
      await sendVerificationEmail(updatedPendingUser, newOtp);
    } catch (error) {
      await PendingUser.updateOne(
        { _id: updatedPendingUser._id, 'otp.code': newOtp },
        { $set: { otp: previousOtp } }
      );
      throw error;
    }

    return res.status(200).json({
      message: 'A new OTP was sent to your email.',
      email: updatedPendingUser.email
    });
  } catch (error) {
    console.error('[resendOtp] error:', error);

    if (handleEmailDeliveryError(res, error)) return;

    return res.status(500).json({
      message: 'Failed to resend OTP'
    });
  }
};

// Login (only for verified users)
const login = async (req, res) => {
  try {
    const { password, rememberMe } = req.body;
    const identifier = req.body.identifier ?? req.body.email;
    const user = await resolveUserByIdentifier(identifier, { includePassword: true });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isDeleted) {
      return res.status(401).json({ message: 'This customer account has been deleted.' });
    }
    if (user.isActive === false) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({ message: 'Please verify your email first' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.twoFactorEnabled === true) {
      const code = createLoginCode();
      user.loginChallenge = {
        codeHash: hashLoginCode(code),
        expiresAt: loginChallengeExpiry(),
        attempts: 0,
        lastSentAt: new Date(),
        rememberMe: rememberMe === true
      };
      await user.save();
      try {
        await sendLoginOtpEmail(user, code);
      } catch (error) {
        user.loginChallenge = undefined;
        await user.save();
        throw error;
      }
      return res.status(200).json({
        requiresOtp: true,
        email: maskEmail(user.email),
        message: 'A login code was sent to your email.'
      });
    }

    return res.status(200).json(customerLoginResponse(user, rememberMe));
  } catch (error) {
    console.error('[login] error', error);
    if (handleEmailDeliveryError(res, error)) return;
    res.status(500).json({ message: 'Failed to login. Please try again.' });
  }
};

const verifyLoginOtp = async (req, res) => {
  try {
    const identifier = req.body.identifier ?? req.body.email;
    const code = req.body.code;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter the 6-digit login code.' });
    }

    const user = await resolveUserByIdentifier(identifier);
    if (!user || user.isDeleted || user.isActive === false || !user.twoFactorEnabled || !user.loginChallenge) {
      return res.status(401).json({ message: 'No active login code was found. Sign in again to request a new code.' });
    }
    if (user.loginChallenge.attempts >= 5) {
      return res.status(429).json({ message: 'Too many incorrect codes. Request a new code to try again.' });
    }
    if (user.loginChallenge.expiresAt <= new Date()) {
      return res.status(401).json({ message: 'This login code has expired. Request a new code.' });
    }

    const submittedHash = Buffer.from(hashLoginCode(code), 'hex');
    const storedHash = Buffer.from(user.loginChallenge.codeHash, 'hex');
    const matches = submittedHash.length === storedHash.length && crypto.timingSafeEqual(submittedHash, storedHash);
    if (!matches) {
      user.loginChallenge.attempts += 1;
      const attemptsExhausted = user.loginChallenge.attempts >= 5;
      await user.save();
      return res.status(attemptsExhausted ? 429 : 401).json({
        message: attemptsExhausted
          ? 'Too many incorrect codes. Request a new code to try again.'
          : 'The login code is incorrect.'
      });
    }

    const rememberMe = user.loginChallenge.rememberMe === true;
    user.loginChallenge = undefined;
    await user.save();
    return res.status(200).json(customerLoginResponse(user, rememberMe));
  } catch (error) {
    console.error('[verifyLoginOtp] error', error);
    return res.status(500).json({ message: 'Failed to verify login code. Please try again.' });
  }
};

const resendLoginOtp = async (req, res) => {
  try {
    const identifier = req.body.identifier ?? req.body.email;
    const user = await resolveUserByIdentifier(identifier);
    if (!user || user.isDeleted || user.isActive === false || !user.twoFactorEnabled) {
      return res.status(404).json({ message: 'No two-step sign-in is pending for that account.' });
    }

    const lastSentAt = user.loginChallenge?.lastSentAt;
    if (lastSentAt && Date.now() - lastSentAt.getTime() < LOGIN_OTP_RESEND_COOLDOWN_MS) {
      const secondsRemaining = Math.ceil((LOGIN_OTP_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt.getTime())) / 1000);
      return res.status(429).json({
        message: `Please wait ${secondsRemaining} seconds before requesting another login code.`,
        retryAfterSeconds: secondsRemaining
      });
    }

    const code = createLoginCode();
    const rememberMe = user.loginChallenge?.rememberMe === true;
    const previousLoginChallenge = user.loginChallenge?.toObject?.() || user.loginChallenge;
    user.loginChallenge = {
      codeHash: hashLoginCode(code),
      expiresAt: loginChallengeExpiry(),
      attempts: 0,
      lastSentAt: new Date(),
      rememberMe
    };
    await user.save();
    try {
      await sendLoginOtpEmail(user, code);
    } catch (error) {
      user.loginChallenge = previousLoginChallenge || undefined;
      await user.save();
      throw error;
    }
    return res.status(200).json({
      message: 'A new login code was sent to your email.',
      email: maskEmail(user.email),
      retryAfterSeconds: 60
    });
  } catch (error) {
    console.error('[resendLoginOtp] error', error);
    if (handleEmailDeliveryError(res, error)) return;
    return res.status(500).json({ message: 'Failed to resend login code. Please try again.' });
  }
};

const setTwoFactorEnabled = (enabled) => async (req, res) => {
  try {
    const { currentPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ message: 'Your current password is required.' });
    }
    const user = await User.findById(req.user.userId).select('+password');
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.twoFactorEnabled = enabled;
    if (!enabled) user.loginChallenge = undefined;
    await user.save();
    return res.status(200).json({
      message: enabled ? 'Two-step verification enabled.' : 'Two-step verification disabled.',
      twoFactorEnabled: user.twoFactorEnabled
    });
  } catch (error) {
    console.error('[setTwoFactorEnabled] error', error);
    return res.status(500).json({ message: 'Two-step verification settings could not be updated.' });
  }
};

// Get profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage,
        preferences: user.preferences,
        twoFactorEnabled: user.twoFactorEnabled === true,
        totalPurchases: user.totalPurchases,
        totalSpent: user.totalSpent,
        firstPurchaseDate: user.firstPurchaseDate,
        lastPurchaseDate: user.lastPurchaseDate
      }
    });
  } catch (error) {
    console.error('[getProfile] error', error);
    res.status(500).json({ message: 'Failed to load profile. Please try again.' });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, preferences } = req.body;
    const userId = req.user.userId;
    const update = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(preferences && { preferences })
    };
    if (phoneNumber && !req.phoneNumberUnchanged) update.phoneNumber = phoneNumber;

    const user = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('[updateProfile] error', error);
    res.status(500).json({ message: 'Failed to update profile. Please try again.' });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const update = {
      firstName: req.body.firstName.trim(),
      lastName: req.body.lastName.trim()
    };
    if (req.body.phoneNumber !== undefined && !req.phoneNumberUnchanged) {
      update.phoneNumber = req.body.phoneNumber;
    }
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error('[updateMyProfile] error', error);
    return res.status(500).json({ message: 'Failed to update profile. Please try again.' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (
      typeof currentPassword !== 'string' || !currentPassword
      || typeof newPassword !== 'string' || !newPassword
      || typeof confirmPassword !== 'string' || !confirmPassword
    ) {
      return res.status(400).json({ message: 'Current password, new password, and confirmation are required.' });
    }
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters and include a letter and a number.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirmation do not match.' });
    }

    const user = await User.findById(req.user.userId).select('+password');
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: 'New password must be different from your current password.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('[changePassword] error', error);
    return res.status(500).json({ message: 'Failed to change password. Please try again.' });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    const [activeReservation, activeBooking] = await Promise.all([
      Reservation.exists({
        customerId: user._id,
        status: { $in: ['Pending Down Payment', 'Payment Submitted', 'Reserved'] }
      }),
      ServiceRequest.exists({
        $or: [{ user: user._id }, { customerId: user._id }],
        status: { $in: ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress'] }
      })
    ]);
    if (activeReservation || activeBooking) {
      return res.status(409).json({
        message: 'Finish or cancel your active reservations and bookings first.',
        records: {
          reservations: Boolean(activeReservation),
          bookings: Boolean(activeBooking)
        }
      });
    }

    const [customerReservations, customerBookings] = await Promise.all([
      Reservation.find({ customerId: user._id }).select('_id customerName customerPhone paymentProofPublicId paymentSubmissions').lean(),
      ServiceRequest.find({ $or: [{ user: user._id }, { customerId: user._id }] })
        .select('_id paymentProofPublicId paymentSubmissions')
        .lean()
    ]);
    const deletedAt = new Date();
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = await User.updateOne(
          { _id: user._id, isDeleted: { $ne: true } },
          {
            $set: {
              isDeleted: true,
              deletedAt,
              name: 'Deleted customer',
              firstName: 'Deleted',
              lastName: 'customer',
              email: `deleted-${user._id}@deleted.local`,
              phoneNumber: null,
              isActive: false
            },
            $unset: {
              password: 1,
              passwordHash: 1,
              savedVehicles: 1,
              profileImage: 1
            }
          },
          { session }
        );
        if (result.modifiedCount === 1) {
          const reservationIds = customerReservations.map((reservation) => reservation._id);
          const bookingIds = customerBookings.map((booking) => booking._id);
          if (reservationIds.length) {
            await Reservation.updateMany(
              { _id: { $in: reservationIds } },
              { $set: { customerName: 'Deleted customer', customerPhone: '' } },
              { session }
            );
          }
          const sourceIds = [...reservationIds, ...bookingIds];
          if (sourceIds.length) {
            await BusinessRecord.updateMany(
              { sourceId: { $in: sourceIds } },
              { $set: { customer: 'Deleted customer', customerPhone: '' } },
              { session }
            );
          }
          await Notification.updateMany(
            { audience: 'customer', customerId: user._id, clearedAt: null },
            { $set: { clearedAt: new Date() } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }
    if (result.modifiedCount !== 1) {
      return res.status(409).json({ message: 'This customer account has already been deleted.' });
    }

    const receiptIds = new Set([
      ...customerReservations.flatMap((reservation) => [
        reservation.paymentProofPublicId,
        ...(reservation.paymentSubmissions || []).map((submission) => submission.paymentProofPublicId)
      ]),
      ...customerBookings.flatMap((booking) => [
        booking.paymentProofPublicId,
        ...(booking.paymentSubmissions || []).map((submission) => submission.paymentProofPublicId)
      ])
    ].filter(Boolean));
    for (const publicId of receiptIds) {
      try {
        await removeReceipt(publicId);
      } catch (receiptError) {
        console.error(`[deleteAccount] failed to remove receipt ${publicId} from Cloudinary`, receiptError);
      }
    }

    return res.status(200).json({ message: 'Your account was deleted.' });
  } catch (error) {
    console.error('[deleteAccount] error', error);
    return res.status(500).json({ message: 'Failed to delete account. Please try again.' });
  }
};

// Get purchase history
const getPurchaseHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      totalPurchases: user.totalPurchases,
      totalSpent: user.totalSpent,
      firstPurchaseDate: user.firstPurchaseDate,
      lastPurchaseDate: user.lastPurchaseDate
    });
  } catch (error) {
    console.error('[getPurchaseHistory] error', error);
    res.status(500).json({ message: 'Failed to load purchase history. Please try again.' });
  }
};

const getReceipts = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({
      message: 'Receipts retrieved',
      lastReceiptDate: user.lastReceiptDate
    });
  } catch (error) {
    console.error('[getReceipts] error', error);
    res.status(500).json({ message: 'Failed to load receipts. Please try again.' });
  }
};

module.exports = {
  registerRequest,
  verifyOtp,
  resendOtp,
  login,
  verifyLoginOtp,
  resendLoginOtp,
  enableTwoFactor: setTwoFactorEnabled(true),
  disableTwoFactor: setTwoFactorEnabled(false),
  getProfile,
  updateProfile,
  updateMyProfile,
  changePassword,
  deleteAccount,
  getPurchaseHistory,
  getReceipts
};
