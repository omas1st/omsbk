const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/emailService');
const Trade = require('../models/Trade');

// Get all users – now sorted newest first
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
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

    if (deposit.user.referredBy) {
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
          await Notification.create({
            user: referrer._id,
            message: `You earned $20 referral bonus from ${deposit.user.email}'s first deposit.`
          });
        }
      }
    }

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

// ---------- Closed Trades Admin Functions ----------
// Get all closed trades
exports.getClosedTrades = async (req, res) => {
  try {
    const trades = await Trade.find({ status: 'closed' })
      .populate('user', 'email balance')
      .sort({ closedAt: -1 });
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update a closed trade – adjust user balance if profitLoss changed
exports.updateClosedTrade = async (req, res) => {
  try {
    const { pair, type, orderType, lots, takeProfit, stopLoss, profitLoss, closePrice, closedAt } = req.body;
    const trade = await Trade.findById(req.params.id);
    if (!trade || trade.status !== 'closed') {
      return res.status(404).json({ message: 'Closed trade not found' });
    }

    // Remember old profit for balance adjustment
    const oldProfit = trade.profitLoss || 0;
    let newProfit = oldProfit;

    // Update fields
    if (pair) trade.pair = pair;
    if (type) trade.type = type;
    if (orderType) trade.orderType = orderType;
    if (lots !== undefined) trade.lots = lots;
    if (takeProfit !== undefined) trade.takeProfit = takeProfit;
    if (stopLoss !== undefined) trade.stopLoss = stopLoss;
    if (profitLoss !== undefined) {
      trade.profitLoss = profitLoss;
      newProfit = profitLoss;
    }
    if (closePrice !== undefined) trade.closePrice = closePrice;
    if (closedAt) trade.closedAt = new Date(closedAt);

    await trade.save();

    // Adjust user balance if profit changed
    const profitDiff = newProfit - oldProfit;
    if (profitDiff !== 0) {
      const user = await User.findById(trade.user);
      if (user) {
        user.balance += profitDiff;
        await user.save();
      }
    }

    res.json({ message: 'Trade updated', trade });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new closed trade (admin creates for a user)
exports.createClosedTrade = async (req, res) => {
  try {
    const { userId, pair, type, orderType, lots, openPrice, closePrice, profitLoss, takeProfit, stopLoss, closedAt } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(400).json({ message: 'User not found' });

    const trade = new Trade({
      user: userId,
      pair,
      type,
      orderType: orderType || 'instant',
      lots,
      openPrice: openPrice || 0,
      closePrice: closePrice || 0,
      takeProfit: takeProfit || null,
      stopLoss: stopLoss || null,
      profitLoss: profitLoss || 0,
      status: 'closed',
      closedAt: closedAt ? new Date(closedAt) : new Date()
    });
    await trade.save();

    // Add profit to user balance
    if (profitLoss && profitLoss !== 0) {
      user.balance += profitLoss;
      await user.save();
    }

    res.status(201).json({ message: 'Closed trade created', trade });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete a closed trade completely – adjust user balance accordingly
exports.deleteClosedTrade = async (req, res) => {
  try {
    const trade = await Trade.findById(req.params.id);
    if (!trade || trade.status !== 'closed') {
      return res.status(404).json({ message: 'Closed trade not found' });
    }

    // Subtract the trade's profit/loss from the user's balance
    const user = await User.findById(trade.user);
    if (user) {
      user.balance -= (trade.profitLoss || 0);
      await user.save();
    }

    await Trade.findByIdAndDelete(req.params.id);
    res.json({ message: 'Closed trade deleted and user balance updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};