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

// ----------------- CORS FIX -----------------
const allowedOrigins = [
  'http://localhost:3000',                     // local development
  'https://omsft.vercel.app',                 // your React frontend on Vercel
  'https://omsbk.vercel.app'                  // in case you need to test from backend domain
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Explicitly handle preflight requests
app.options('*', cors());
// -------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic welcome route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the OMS Brokerage API' });
});

// API routes
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
          referralCode: 'ADMIN001'
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

// Vercel serverless export
module.exports = app;