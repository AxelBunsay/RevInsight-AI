const Mechanic = require('../models/mechanic');
const ServiceRequest = require('../models/serviceRequest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const getMechanicsSummary = async (req, res) => {
  try {
    const now = new Date();
    const manilaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const manilaStart = new Date(
      Date.UTC(
        manilaNow.getUTCFullYear(),
        manilaNow.getUTCMonth(),
        manilaNow.getUTCDate(),
      ) -
        8 * 60 * 60 * 1000,
    );
    const manilaEnd = new Date(manilaStart.getTime() + 24 * 60 * 60 * 1000);

    const [summaryRows, repairRows, mechanics] = await Promise.all([
      ServiceRequest.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            totalRepairs: { $sum: 1 },
            totalLaborToday: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$completedAt', manilaStart] },
                      { $lt: ['$completedAt', manilaEnd] }
                    ]
                  },
                  { $ifNull: ['$laborFee', 0] },
                  0
                ]
              }
            }
          }
        }
      ]),
      ServiceRequest.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: { $ifNull: ['$mechanicId', '$mechanic'] },
            totalRepairs: { $sum: 1 }
          }
        }
      ]),
      Mechanic.find({ isActive: { $ne: false } }).select('_id').lean()
    ]);

    const repairsByMechanic = new Map(
      repairRows
        .filter((row) => row._id)
        .map((row) => [String(row._id), row.totalRepairs]),
    );

    res.status(200).json({
      totalLaborToday: summaryRows[0]?.totalLaborToday || 0,
      totalRepairs: summaryRows[0]?.totalRepairs || 0,
      mechanics: mechanics.map((mechanic) => ({
        mechanicId: String(mechanic._id),
        totalRepairs: repairsByMechanic.get(String(mechanic._id)) || 0
      }))
    });
  } catch (error) {
    console.error('[getMechanicsSummary] error', error);
    res.status(500).json({ message: 'Failed to load mechanics summary. Please try again.' });
  }
};

const createMechanic = async (req, res) => {
    try {
    const { email, password, firstName, lastName, phoneNumber, specialization, yearsOfExperience, certifications } = req.body;

    if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
    }

    // Check if mechanic exists (normalize email to match schema lowercase/trim)
    const normalizedEmail = email.toLowerCase().trim();
    const existingMechanic = await Mechanic.findOne({ email: normalizedEmail });
    if (existingMechanic) {
      return res.status(400).json({ message: 'Mechanic email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const mechanic = await Mechanic.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber,
      specialization,
      yearsOfExperience,
      certifications: certifications || [],
      createdBy: req.user.id
    });

    res.status(201).json({
      message: 'Mechanic account created successfully',
      mechanic: {
        id: mechanic._id,
        email: mechanic.email,
        firstName: mechanic.firstName,
        lastName: mechanic.lastName,
        specialization: mechanic.specialization,
        yearsOfExperience: mechanic.yearsOfExperience,
        certifications: mechanic.certifications,
        photoUrl: mechanic.photoUrl,
        bio: mechanic.bio,
        availabilityStatus: mechanic.availabilityStatus,
        totalRepairs: mechanic.totalRepairs,
        successRate: mechanic.successRate
      }
    });
  } catch (error) {
    console.error('[createMechanic] error', error);
    res.status(500).json({ message: 'Failed to create mechanic. Please try again.' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const mechanic = await Mechanic.findOne({ email: normalizedEmail }).select('+password');
    if (!mechanic) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!mechanic.isActive) {
      return res.status(403).json({ message: 'Mechanic account is inactive' });
    }

    const isPasswordValid = await bcrypt.compare(password, mechanic.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: mechanic._id, role: 'mechanic' }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      mechanic: {
        id: mechanic._id,
        _id: mechanic._id,
        email: mechanic.email,
        firstName: mechanic.firstName,
        lastName: mechanic.lastName,
        specialization: mechanic.specialization,
        photoUrl: mechanic.photoUrl,
        availabilityStatus: mechanic.availabilityStatus
      }
    });
  } catch (error) {
    console.error('[login] error', error);
    res.status(500).json({ message: 'Failed to login. Please try again.' });
  }
};

// Get mechanic profile
const getProfile = async (req, res) => {
  try {
    const mechanic = await Mechanic.findById(req.user.userId);
    if (!mechanic) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }

    res.status(200).json({
      mechanic: {
        id: mechanic._id,
        email: mechanic.email,
        firstName: mechanic.firstName,
        lastName: mechanic.lastName,
        phoneNumber: mechanic.phoneNumber,
        specialization: mechanic.specialization,
        yearsOfExperience: mechanic.yearsOfExperience,
        certifications: mechanic.certifications,
        photoUrl: mechanic.photoUrl,
        bio: mechanic.bio,
        availabilityStatus: mechanic.availabilityStatus,
        totalRepairs: mechanic.totalRepairs,
        averageRating: mechanic.averageRating,
        successRate: mechanic.successRate,
        isActive: mechanic.isActive
      }
    });
  } catch (error) {
    console.error('[getProfile] error', error);
    res.status(500).json({ message: 'Failed to load profile. Please try again.' });
  }
};


const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, specialization, yearsOfExperience, certifications, photoUrl, bio, availabilityStatus } = req.body;

    const mechanic = await Mechanic.findByIdAndUpdate(
      req.user.userId,
      {
        firstName,
        lastName,
        phoneNumber,
        specialization,
        yearsOfExperience,
        certifications,
        photoUrl,
        bio,
        availabilityStatus
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Profile updated successfully',
      mechanic: {
        id: mechanic._id,
        email: mechanic.email,
        firstName: mechanic.firstName,
        lastName: mechanic.lastName,
        specialization: mechanic.specialization,
        yearsOfExperience: mechanic.yearsOfExperience,
        certifications: mechanic.certifications,
        photoUrl: mechanic.photoUrl,
        bio: mechanic.bio,
        availabilityStatus: mechanic.availabilityStatus
      }
    });
  } catch (error) {
    console.error('[updateProfile] error', error);
    res.status(500).json({ message: 'Failed to update profile. Please try again.' });
  }
};

const listAllMechanics = async (req, res) => {
  try {
    const mechanics = await Mechanic.find({ isActive: { $ne: false } }).select('firstName lastName email specialization totalRepairs averageRating isActive createdBy photoUrl bio availabilityStatus successRate yearsOfExperience');

    const formatted = mechanics.map(m => ({
      id: m._id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      specialization: m.specialization,
      yearsOfExperience: m.yearsOfExperience,
      totalRepairs: m.totalRepairs || 0,
      averageRating: m.averageRating || 0,
      successRate: m.successRate || 0,
      isActive: m.isActive,
      availabilityStatus: m.availabilityStatus,
      photoUrl: m.photoUrl,
      bio: m.bio,
      createdBy: m.createdBy
    }));

    res.status(200).json({ mechanics: formatted });
  } catch (error) {
    console.error('[listAllMechanics] error', error);
    res.status(500).json({ message: 'Failed to load mechanics. Please try again.' });
  }
};

const listAvailableMechanics = async (req, res) => {
  try {
    const mechanics = await Mechanic.find({ isActive: { $ne: false } }).select('firstName lastName specialization isActive availabilityStatus');
    res.status(200).json({ mechanics });
  } catch (error) {
    console.error('[listAvailableMechanics] error', error);
    res.status(500).json({ message: 'Failed to load available mechanics. Please try again.' });
  }
};

const deleteMechanic = async (req, res) => {
  try {
    const mechanicId = req.params?.id || req.body?.id || req.query?.id;

    if (!mechanicId) {
      return res.status(400).json({ message: 'Mechanic id required' });
    }

    const activeJobs = await ServiceRequest.exists({
      $or: [{ mechanic: mechanicId }, { mechanicId }],
      status: { $in: ['assigned', 'confirmed', 'accepted', 'in-progress'] }
    });
    if (activeJobs) {
      return res.status(409).json({ message: "Reassign or finish this mechanic's jobs first." });
    }

    const deletedMechanic = await Mechanic.findByIdAndUpdate(
      mechanicId,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!deletedMechanic) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }

    return res.status(200).json({ message: 'Mechanic deleted successfully' });
  } catch (error) {
    console.error('[deleteMechanic] error', error);
    return res.status(500).json({ message: 'Failed to delete mechanic. Please try again.' });
  }
};

const updateMechanic = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phoneNumber, specialization, yearsOfExperience, certifications, password, photoUrl, bio, availabilityStatus, successRate } = req.body;

    const mechanic = await Mechanic.findById(id);
    if (!mechanic) {
      return res.status(404).json({ message: 'Mechanic not found' });
    }

    const update = {
      firstName: firstName !== undefined ? firstName : mechanic.firstName,
      lastName: lastName !== undefined ? lastName : mechanic.lastName,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : mechanic.phoneNumber,
      specialization: specialization !== undefined ? specialization : mechanic.specialization,
      yearsOfExperience: yearsOfExperience !== undefined ? yearsOfExperience : mechanic.yearsOfExperience,
      certifications: certifications !== undefined ? certifications : mechanic.certifications,
      photoUrl: photoUrl !== undefined ? photoUrl : mechanic.photoUrl,
      bio: bio !== undefined ? bio : mechanic.bio,
      availabilityStatus: availabilityStatus !== undefined ? availabilityStatus : mechanic.availabilityStatus,
      successRate: successRate !== undefined ? successRate : mechanic.successRate
    };

    if (password) {
      if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
      }
      const hashed = await bcrypt.hash(password, 10);
      update.password = hashed;
    }

    const updated = await Mechanic.findByIdAndUpdate(id, update, { new: true, runValidators: true });

    res.status(200).json({ message: 'Mechanic updated successfully', mechanic: {
      id: updated._id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      specialization: updated.specialization,
      yearsOfExperience: updated.yearsOfExperience,
      certifications: updated.certifications,
      photoUrl: updated.photoUrl,
      bio: updated.bio,
      availabilityStatus: updated.availabilityStatus,
      successRate: updated.successRate
    }});
  } catch (error) {
    console.error('[updateMechanic] error', error);
    res.status(500).json({ message: 'Failed to update mechanic. Please try again.' });
  }
};

module.exports = {
  createMechanic,
  login,
  getProfile,
  updateProfile,
  listAllMechanics,
  listAvailableMechanics,
  deleteMechanic,
  updateMechanic,
  getMechanicsSummary
};
