const Admin = require('../../models/adminModels/admin');

const signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    const adminExists = await Admin.findOne({ username });
    if (adminExists) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const admin = await Admin.create({
      username,
      password
    });

    const token = admin.getSignedJwtToken();

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }

    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error occurred while registering admin',
      error: error.message
    });
  }
};


const login = async (req, res) => {
  try {
    const {username, password} = req.body;

    if (!username || !password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const admin = await Admin.findOne({ username }).select('+password');

    if (!admin){
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const isPasswordMatch = await admin.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }


    const token = admin.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAdmin =  async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id);

    res.status(200).json({
      success: true,
      admin
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


module.exports = {
  signup,
  login,
  getAdmin
};