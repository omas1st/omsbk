const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pair: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  orderType: {
    type: String,
    enum: ['instant', 'buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'],
    default: 'instant'
  },
  lots: {
    type: Number,
    required: true
  },
  openPrice: {
    type: Number,
    required: true
  },
  takeProfit: {
    type: Number,
    default: null
  },
  stopLoss: {
    type: Number,
    default: null
  },
  closePrice: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  openedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date
  }
});

module.exports = mongoose.model('Trade', tradeSchema);