require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const generateAccountNumber = require('./utils/generateAccountNumber');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Database connection and admin seeding
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');

    // Seed the admin user if not exists
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;

      const existingAdmin = await User.findOne({ email: adminEmail, isAdmin: true });
      if (!existingAdmin) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminPassword, salt);
        const accountNumber = await generateAccountNumber();

        await User.create({
          email: adminEmail.toLowerCase(),
          password: hashedPassword,
          country: 'AdminCountry',
          isAdmin: true,
          accountNumber,
          referralCode: 'ADMIN001' // just for completeness, not used
        });
        console.log('Admin user created successfully');
      } else {
        console.log('Admin user already exists');
      }
    } catch (err) {
      console.error('Error seeding admin user:', err);
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));