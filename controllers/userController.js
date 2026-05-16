const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdrawal = require('../models/Withdrawal');
const Transfer = require('../models/Transfer');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const sendEmail = require('../utils/emailService');
const cloudinary = require('../utils/cloudinary');
const bcrypt = require('bcryptjs');
const Trade = require('../models/Trade');

// Dashboard
exports.dashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({
      account: { number: user.accountNumber },
      balance: user.balance,
      equity: user.equity,
      floatingPL: user.floatingPL,
      margin: user.margin,
      freeMargin: user.freeMargin,
      marginLevel: user.marginLevel,
      credit: user.credit,
      leverage: user.leverage,
      trades: []
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Manage Account – now returns live metrics and total closed profit
exports.getManageAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const openTrades = await Trade.find({ user: user._id, status: 'open' });
    const closedTrades = await Trade.find({ user: user._id, status: 'closed' });

    // Total profit from all closed trades
    const totalProfit = closedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);

    // Simulate floating profit
    const totalFloatingPL = openTrades.reduce((sum, trade) => {
      return sum + (Math.random() * 20 * trade.lots);
    }, 0);

    const equity = user.balance + totalFloatingPL;

    // Calculate margin
    const leverageNum = parseFloat(user.leverage.split(':')[0]);
    const contractSize = 100000; // adjust per pair if needed
    const totalMargin = openTrades.reduce((sum, trade) => {
      return sum + (trade.lots * contractSize) / leverageNum;
    }, 0);

    const freeMargin = equity - totalMargin;
    const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;

    res.json({
      balance: user.balance,
      equity: parseFloat(equity.toFixed(2)),
      floatingPL: parseFloat(totalFloatingPL.toFixed(2)),
      margin: parseFloat(totalMargin.toFixed(2)),
      freeMargin: parseFloat(freeMargin.toFixed(2)),
      marginLevel: parseFloat(marginLevel.toFixed(2)),
      credit: user.credit,
      leverage: user.leverage,
      accountName: user.accountName,
      totalProfit: parseFloat(totalProfit.toFixed(2))
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
    req.user.mt5Password = password;
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
      server: 'tradeaxis-mt5Real',
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
    if (amount < 100 || amount > 500000) {
      return res.status(400).json({ message: 'Amount must be between $100 and $500,000' });
    }
    const deposit = new Deposit({
      user: req.user._id,
      amount,
      method,
      cardDetails: method === 'card' ? cardDetails : undefined
    });
    await deposit.save();
    sendEmail(process.env.ADMIN_EMAIL, 'New Deposit Request', `User ${req.user.email} requested deposit of $${amount}.`);
    res.status(201).json({ message: 'Deposit request submitted', depositId: deposit._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload proof of payment
exports.uploadProof = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'tradeaxis_deposits' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      const { Readable } = require('stream');
      const readableStream = new Readable();
      readableStream.push(req.file.buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
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
    if (amount < 100 || amount > 500000) {
      return res.status(400).json({ message: 'Amount must be between $100 and $500,000' });
    }
    if (req.user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    const withdrawal = new Withdrawal({ user: req.user._id, amount, bitcoinAddress });
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
    if (amount < 20 || amount > 500000) return res.status(400).json({ message: 'Amount must be between $20 and $500,000' });
    if (req.user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });
    const recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
    if (!recipient) return res.status(400).json({ message: 'Recipient not found' });
    req.user.balance -= amount;
    recipient.balance += amount;
    await req.user.save();
    await recipient.save();
    const transfer = new Transfer({ sender: req.user._id, recipient: recipient._id, amount });
    await transfer.save();
    await Notification.create({ user: req.user._id, message: `You sent $${amount} to ${recipient.email}.` });
    await Notification.create({ user: recipient._id, message: `You received $${amount} from ${req.user.email}.` });
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
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get Bitcoin address
exports.getBitcoinAddress = async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: 'bitcoinAddress' });
    res.json({ bitcoinAddress: setting ? setting.value : 'gsjgsjhgjsyyeg' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Execute a new trade
exports.executeTrade = async (req, res) => {
  try {
    const { pair, type, lots, takeProfit, stopLoss, orderType } = req.body;
    const user = req.user;
    if (user.balance <= 0) {
      return res.status(400).json({ message: 'Insufficient balance. Please deposit funds first.' });
    }
    const openPrice = req.body.currentPrice;
    if (!openPrice) return res.status(400).json({ message: 'Current price is required.' });
    const trade = new Trade({
      user: user._id,
      pair,
      type,
      lots,
      orderType: orderType || 'instant',
      openPrice,
      takeProfit: takeProfit || null,
      stopLoss: stopLoss || null,
      status: 'open'
    });
    await trade.save();
    res.status(201).json({ message: 'Trade executed', trade });
  } catch (error) {
    console.error('Execute trade error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get user trades (filtered by status)
exports.getUserTrades = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    const trades = await Trade.find(filter).sort({ openedAt: -1 });
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update TP/SL for an open trade
exports.updateTradeTP_SL = async (req, res) => {
  try {
    const { tradeId, takeProfit, stopLoss } = req.body;
    const trade = await Trade.findOne({ _id: tradeId, user: req.user._id, status: 'open' });
    if (!trade) return res.status(404).json({ message: 'Open trade not found' });
    if (takeProfit !== undefined) trade.takeProfit = takeProfit;
    if (stopLoss !== undefined) trade.stopLoss = stopLoss;
    await trade.save();
    res.json({ message: 'Trade updated', trade });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Close an open trade (always in profit) and update user balance
exports.closeTrade = async (req, res) => {
  try {
    const { tradeId } = req.body;
    const trade = await Trade.findOne({ _id: tradeId, user: req.user._id, status: 'open' });
    if (!trade) return res.status(404).json({ message: 'Open trade not found' });

    let minProfit, maxProfit;
    if (trade.lots <= 0.09) { minProfit = 0.2; maxProfit = 5; }
    else if (trade.lots <= 0.9) { minProfit = 1; maxProfit = 20; }
    else if (trade.lots <= 10) { minProfit = 10; maxProfit = 200; }
    else { minProfit = 100; maxProfit = 2000; }

    const profit = Math.random() * (maxProfit - minProfit) + minProfit;
    trade.status = 'closed';
    trade.closePrice = trade.openPrice * (1 + (profit / 10000));
    trade.profitLoss = parseFloat(profit.toFixed(2));
    trade.closedAt = new Date();
    await trade.save();

    const user = await User.findById(req.user._id);
    user.balance += trade.profitLoss;
    await user.save();

    res.json({ message: 'Trade closed with profit', trade, newBalance: user.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};