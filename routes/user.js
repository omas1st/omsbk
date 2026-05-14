const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');
const multer = require('multer');

// Use memory storage – files are never written to disk
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(auth);

router.get('/dashboard', userController.dashboard);
router.get('/manage-account', userController.getManageAccount);
router.put('/leverage', userController.updateLeverage);
router.put('/account-name', userController.updateAccountName);
router.put('/mt5-password', userController.updateMt5Password);
router.get('/mt5-details', userController.getMt5Details);

router.post('/deposit', userController.requestDeposit);
router.post('/upload-proof', upload.single('proof'), userController.uploadProof);

router.post('/withdraw', userController.requestWithdrawal);
router.post('/transfer', userController.requestTransfer);
router.get('/referral-code', userController.getReferralCode);
router.get('/notifications', userController.getNotifications);

module.exports = router;