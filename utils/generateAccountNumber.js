const User = require('../models/User');

const generateAccountNumber = async () => {
  let number;
  let exists = true;
  while (exists) {
    // Generate random 8-digit number
    number = Math.floor(10000000 + Math.random() * 90000000).toString();
    exists = await User.findOne({ accountNumber: number });
  }
  return `#${number}`; // Prefix with #
};

module.exports = generateAccountNumber;