const express = require('express');
const c = require('../controllers/attendance.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { STAFF_ROLES, MANAGER_ROLES } = require('../utils/attendanceRules');

const router = express.Router();
const manager = [verifyToken, authorizeRoles(...MANAGER_ROLES)];
const staff = [verifyToken, authorizeRoles(...STAFF_ROLES)];
// Bọc async để lỗi bất ngờ trả 500 thay vì làm treo request
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi server', error: err.message }));

// Máy chấm công tại quầy
router.post('/kiosks', ...manager, wrap(c.createKiosk));
router.get('/kiosks', ...manager, wrap(c.listKiosks));
router.put('/kiosks/:id', ...manager, wrap(c.updateKiosk));
router.get('/kiosk/status', wrap(c.kioskAuth), wrap(c.kioskStatus));
router.post('/kiosk/qr', wrap(c.kioskAuth), wrap(c.createQr));
router.get('/kiosk/qr/:id', wrap(c.kioskAuth), wrap(c.qrState));

// Nhân viên
router.get('/me/today', ...staff, wrap(c.myToday));
router.get('/me', ...staff, wrap(c.myMonth));
router.post('/scan', ...staff, wrap(c.scanQr));
router.post('/check-in', ...staff, wrap(c.checkIn));
router.post('/explanations', ...staff, wrap(c.createExplanation));
router.post('/checkout-requests', ...staff, wrap(c.createCheckoutRequest)); // xin về sớm / quên chấm ra ca

// Quản lý
router.get('/daily', ...manager, wrap(c.dailyBoard));
router.get('/explanations', ...manager, wrap(c.listExplanations));
router.post('/explanations/:id/review', ...manager, wrap(c.reviewExplanation));
router.get('/checkout-requests', ...manager, wrap(c.listCheckoutRequests));
router.post('/checkout-requests/:id/review', ...manager, wrap(c.reviewCheckoutRequest));
router.get('/report', ...manager, wrap(c.monthlyReport));

module.exports = router;
