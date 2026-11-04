const express = require('express');
const c = require('../controllers/payroll.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { STAFF_ROLES, MANAGER_ROLES } = require('../utils/attendanceRules');

const router = express.Router();
const manager = [verifyToken, authorizeRoles(...MANAGER_ROLES)];
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi server', error: err.message }));

// Mức lương ca (riêng từng nhân viên, có lịch sử)
router.get('/rates', ...manager, wrap(c.listRates));
router.post('/rates', ...manager, wrap(c.createRate));

// Bảng lương tháng
router.get('/', ...manager, wrap(c.getPayroll));
router.post('/generate', ...manager, wrap(c.generatePayroll));
router.post('/:id/adjustments', ...manager, wrap(c.addAdjustment));
router.delete('/:id/adjustments/:adjustmentId', ...manager, wrap(c.removeAdjustment));
router.post('/:id/lock', ...manager, wrap(c.lockPayroll));
router.post('/:id/unlock', ...manager, wrap(c.unlockPayroll));
router.post('/discipline', ...manager, wrap(c.createDiscipline));

// Phiếu lương của nhân viên
router.get('/me', verifyToken, authorizeRoles(...STAFF_ROLES), wrap(c.myPayslip));

module.exports = router;
