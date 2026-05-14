const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASSWORD
  }
});

const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: `"OMS Brokerage" <${process.env.ADMIN_EMAIL}>`,
      to,
      subject,
      text
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Email error:', error);
  }
};

module.exports = sendEmail;