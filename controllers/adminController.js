const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/emailService');

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Optionally delete associated deposits, withdrawals, etc.
    await Deposit.deleteMany({ user: user._id });
    await Withdrawal.deleteMany({ user: user._id });
    await Notification.deleteMany({ user: user._id });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user balance and send message
exports.updateUser = async (req, res) => {
  try {
    const { balance, message } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (balance !== undefined) {
      user.balance = balance;
    }
    if (message) {
      await Notification.create({
        user: user._id,
        message: `Admin: ${message}`
      });
    }

    await user.save();
    res.json({ message: 'User updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get deposit requests
exports.getDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find({ status: 'pending' })
      .populate('user', 'email balance');
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve deposit
exports.approveDeposit = async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.id).populate('user');
    if (!deposit || deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit not found or already processed' });
    }

    deposit.status = 'approved';
    deposit.user.balance += deposit.amount;
    await deposit.user.save();
    await deposit.save();

    // Handle referral bonus: if user was referred and this is their first deposit, credit $20 to referrer
    if (deposit.user.referredBy) {
      // Check if this is the first approved deposit
      const previousApproved = await Deposit.findOne({
        user: deposit.user._id,
        status: 'approved',
        _id: { $ne: deposit._id }
      });
      if (!previousApproved) {
        const referrer = await User.findById(deposit.user.referredBy);
        if (referrer) {
          referrer.balance += 20;
          await referrer.save();
          // Notify referrer
          await Notification.create({
            user: referrer._id,
            message: `You earned $20 referral bonus from ${deposit.user.email}'s first deposit.`
          });
        }
      }
    }

    // Notify user
    await Notification.create({
      user: deposit.user._id,
      message: `Your deposit of $${deposit.amount} has been approved.`
    });

    sendEmail(process.env.ADMIN_EMAIL, 'Deposit Approved', `Deposit ID ${deposit._id} approved for $${deposit.amount}.`);

    res.json({ message: 'Deposit approved' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Reject deposit
exports.rejectDeposit = async (req, res) => {
  try {
    const { reason } = req.body;
    const deposit = await Deposit.findById(req.params.id).populate('user');
    if (!deposit || deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit not found or already processed' });
    }

    deposit.status = 'rejected';
    deposit.rejectionReason = reason || '';
    await deposit.save();

    await Notification.create({
      user: deposit.user._id,
      message: `Your deposit of $${deposit.amount} was rejected. Reason: ${reason || 'No reason provided'}`
    });

    res.json({ message: 'Deposit rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get withdrawal requests
exports.getWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ status: 'pending' })
      .populate('user', 'email balance');
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve withdrawal
exports.approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id).populate('user');
    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal not found or already processed' });
    }

    if (withdrawal.user.balance < withdrawal.amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    withdrawal.status = 'approved';
    withdrawal.user.balance -= withdrawal.amount;
    await withdrawal.user.save();
    await withdrawal.save();

    await Notification.create({
      user: withdrawal.user._id,
      message: `Your withdrawal of $${withdrawal.amount} has been approved.`
    });

    sendEmail(process.env.ADMIN_EMAIL, 'Withdrawal Approved', `Withdrawal ID ${withdrawal._id} approved for $${withdrawal.amount}.`);

    res.json({ message: 'Withdrawal approved' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Reject withdrawal
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id).populate('user');
    if (!withdrawal || withdrawal.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal not found or already processed' });
    }

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = reason || '';
    await withdrawal.save();

    await Notification.create({
      user: withdrawal.user._id,
      message: `Your withdrawal of $${withdrawal.amount} was rejected. Reason: ${reason || 'No reason provided'}`
    });

    res.json({ message: 'Withdrawal rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Settings: get current bitcoin address
exports.getSettings = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'bitcoinAddress' });
    res.json({ bitcoinAddress: setting ? setting.value : 'gsjgsjhgjsyyeg' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Settings: update bitcoin address
exports.updateBitcoinAddress = async (req, res) => {
  try {
    const { address } = req.body;
    await Settings.findOneAndUpdate(
      { key: 'bitcoinAddress' },
      { key: 'bitcoinAddress', value: address },
      { upsert: true, new: true }
    );
    res.json({ message: 'Bitcoin address updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};