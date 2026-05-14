const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Transfer = require('../models/Transfer');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/emailService');
const cloudinary = require('../utils/cloudinary');
const bcrypt = require('bcryptjs');

// Dashboard
exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    // Return dashboard info
    res.json({
      account: {
        number: user.accountNumber
      },
      balance: user.balance,
      equity: user.equity,
      floatingPL: user.floatingPL,
      margin: user.margin,
      freeMargin: user.freeMargin,
      marginLevel: user.marginLevel,
      credit: user.credit,
      leverage: user.leverage,
      trades: [] // placeholder, could fetch from MT5 later
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Manage Account - Get funds & settings
exports.getManageAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      balance: user.balance,
      equity: user.equity,
      floatingPL: user.floatingPL,
      margin: user.margin,
      freeMargin: user.freeMargin,
      marginLevel: user.marginLevel,
      credit: user.credit,
      leverage: user.leverage,
      accountName: user.accountName
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update leverage
exports.updateLeverage = async (req, res) => {
  try {
    const { leverage } = req.body;
    const validLeverages = ['1000:1','500:1','200:1','100:1','50:1','25:1','15:1','10:1','5:1','3:1','2:1','1:1'];
    if (!validLeverages.includes(leverage)) {
      return res.status(400).json({ message: 'Invalid leverage' });
    }
    req.user.leverage = leverage;
    await req.user.save();
    res.json({ message: 'Leverage updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update account name
exports.updateAccountName = async (req, res) => {
  try {
    const { name } = req.body;
    req.user.accountName = name;
    await req.user.save();
    res.json({ message: 'Account name updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Set/Update MT5 password
exports.updateMt5Password = async (req, res) => {
  try {
    if (req.user.balance === 0) {
      return res.status(400).json({ message: 'Deposit required to set MT5 password' });
    }
    const { password } = req.body;
    req.user.mt5Password = password; // In production, hash this
    await req.user.save();
    res.json({ message: 'MT5 password updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get MT5 login details
exports.getMt5Details = async (req, res) => {
  try {
    if (req.user.balance === 0) {
      return res.status(400).json({ message: 'No balance, deposit first' });
    }
    res.json({
      server: 'oms-mt5Real',
      login: req.user.accountNumber.replace('#', ''),
      password: req.user.mt5Password || ''
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Deposit request
exports.requestDeposit = async (req, res) => {
  try {
    const { amount, method, cardDetails } = req.body;
    if (amount < 50 || amount > 500000) {
      return res.status(400).json({ message: 'Amount must be between $50 and $500,000' });
    }

    const deposit = new Deposit({
      user: req.user._id,
      amount,
      method,
      cardDetails: method === 'card' ? cardDetails : undefined
    });
    await deposit.save();

    // Notify admin
    sendEmail(process.env.ADMIN_EMAIL, 'New Deposit Request', `User ${req.user.email} requested deposit of $${amount}.`);

    res.status(201).json({ message: 'Deposit request submitted', depositId: deposit._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload proof of payment (Cloudinary)
// Upload proof of payment (Cloudinary)
exports.uploadProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload buffer to Cloudinary using a stream
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'oms_deposits' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      // Pipe the buffer into the upload stream
      const { Readable } = require('stream');
      const readableStream = new Readable();
      readableStream.push(req.file.buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });

    // Create deposit request with proof URL
    const deposit = new Deposit({
      user: req.user._id,
      amount: req.body.amount,
      method: 'bitcoin',
      proofUrl: result.secure_url
    });
    await deposit.save();

    sendEmail(process.env.ADMIN_EMAIL, 'New Deposit Proof', `User ${req.user.email} uploaded proof for $${req.body.amount}.`);

    res.json({ message: 'Proof uploaded, deposit request pending', proofUrl: result.secure_url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// Withdrawal request
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, bitcoinAddress } = req.body;
    if (amount < 50 || amount > 500000) {
      return res.status(400).json({ message: 'Amount must be between $50 and $500,000' });
    }
    if (req.user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const withdrawal = new Withdrawal({
      user: req.user._id,
      amount,
      bitcoinAddress
    });
    await withdrawal.save();

    sendEmail(process.env.ADMIN_EMAIL, 'New Withdrawal Request', `User ${req.user.email} requested withdrawal of $${amount}.`);

    res.json({ message: 'Withdrawal request submitted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Transfer
exports.requestTransfer = async (req, res) => {
  try {
    const { amount, recipientEmail } = req.body;
    if (amount < 20 || amount > 500000) {
      return res.status(400).json({ message: 'Amount must be between $20 and $500,000' });
    }
    if (req.user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
    if (!recipient) {
      return res.status(400).json({ message: 'Recipient not found' });
    }

    // Perform transfer
    req.user.balance -= amount;
    recipient.balance += amount;
    await req.user.save();
    await recipient.save();

    // Record transfer
    const transfer = new Transfer({
      sender: req.user._id,
      recipient: recipient._id,
      amount
    });
    await transfer.save();

    // Notify both users
    await Notification.create({
      user: req.user._id,
      message: `You sent $${amount} to ${recipient.email}.`
    });
    await Notification.create({
      user: recipient._id,
      message: `You received $${amount} from ${req.user.email}.`
    });

    sendEmail(process.env.ADMIN_EMAIL, 'Transfer Completed', `${req.user.email} transferred $${amount} to ${recipient.email}.`);

    res.json({ message: 'Transfer successful' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get referral code
exports.getReferralCode = async (req, res) => {
  try {
    res.json({ code: req.user.referralCode });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};