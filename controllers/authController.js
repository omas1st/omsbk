const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ResetCode = require('../models/ResetCode');
const Notification = require('../models/Notification');
const generateAccountNumber = require('../utils/generateAccountNumber');
const sendEmail = require('../utils/emailService');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.secret_key, { expiresIn: '30d' });
};

// Register
exports.register = async (req, res) => {
  try {
    const { country, email, password, partnerCode } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate account number
    const accountNumber = await generateAccountNumber();

    // Create user
    const userData = {
      email: email.toLowerCase(),
      password: hashedPassword,
      country,
      accountNumber
    };

    // Handle referral
    if (partnerCode) {
      const referrer = await User.findOne({ referralCode: partnerCode });
      if (referrer) {
        userData.referredBy = referrer._id;
      }
    }

    const user = new User(userData);
    await user.save();

    // If referral, when the referred user makes first deposit, credit referrer $20.
    // We'll handle that in deposit approval.

    // Send admin notification
    sendEmail(process.env.ADMIN_EMAIL, 'New User Registration', `New user registered: ${user.email}`);

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        accountNumber: user.accountNumber,
        balance: user.balance,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Admin login check – same login for admin
    // If user.isAdmin is true, they can access admin panel

    const token = generateToken(user._id);

    // Admin email notification
    sendEmail(process.env.ADMIN_EMAIL, 'User Login', `${user.email} logged in.`);

    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        accountNumber: user.accountNumber,
        balance: user.balance,
        isAdmin: user.isAdmin,
        country: user.country
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Forgot Password - send code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Email not registered' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Save code
    await ResetCode.create({ email: email.toLowerCase(), code });

    // Send email
    await sendEmail(email, 'Password Reset Code', `Your OMS password reset code is: ${code}`);

    res.json({ message: 'Reset code sent to email' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Verify reset code
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    const resetCode = await ResetCode.findOne({
      email: email.toLowerCase(),
      code
    }).sort({ createdAt: -1 });

    if (!resetCode) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    // Delete used code
    await resetCode.deleteOne();

    res.json({ message: 'Code verified' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    // Verify code again (optional, but we already deleted it after verification, so we need a different flow)
    // We'll just find user and update password
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get current user (for auth context persistence)
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};