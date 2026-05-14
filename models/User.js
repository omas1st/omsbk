const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  partnerCode: {
    type: String,
    default: ''
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralCode: {
    type: String,
    unique: true
  },
  accountNumber: {
    type: String,
    unique: true,
    required: true
  },
  accountName: {
    type: String,
    default: ''
  },
  balance: {
    type: Number,
    default: 0
  },
  equity: {
    type: Number,
    default: 0
  },
  floatingPL: {
    type: Number,
    default: 0
  },
  margin: {
    type: Number,
    default: 0
  },
  freeMargin: {
    type: Number,
    default: 0
  },
  marginLevel: {
    type: Number,
    default: 0
  },
  credit: {
    type: Number,
    default: 0
  },
  leverage: {
    type: String,
    default: '1000:1'
  },
  mt5Password: {
    type: String,
    default: ''
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate unique referral code before saving
userSchema.pre('save', async function() {
  if (!this.referralCode) {
    this.referralCode = 'REF' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
});

module.exports = mongoose.model('User', userSchema);