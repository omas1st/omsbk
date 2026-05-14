const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const adminController = require('../controllers/adminController');

// All admin routes require auth + admin role
router.use(auth);
router.use(adminMiddleware);

router.get('/users', adminController.getUsers);
router.delete('/users/:id', adminController.deleteUser);
router.put('/users/:id', adminController.updateUser);

router.get('/deposits', adminController.getDeposits);
router.put('/deposits/:id/approve', adminController.approveDeposit);
router.put('/deposits/:id/reject', adminController.rejectDeposit);

router.get('/withdrawals', adminController.getWithdrawals);
router.put('/withdrawals/:id/approve', adminController.approveWithdrawal);
router.put('/withdrawals/:id/reject', adminController.rejectWithdrawal);

router.get('/settings', adminController.getSettings);
router.put('/settings/bitcoin', adminController.updateBitcoinAddress);

module.exports = router;