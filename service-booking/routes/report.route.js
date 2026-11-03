const express = require('express');
const { getClinicRevenue, getTodayOverview } = require('../controllers/report.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Báo cáo doanh thu phòng khám theo ngày, theo nguồn (gateway: /api/booking/reports/...)
router.get('/revenue', ...managers, getClinicRevenue);
router.get('/today', ...managers, getTodayOverview);

module.exports = router;
