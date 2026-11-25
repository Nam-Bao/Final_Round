const express = require('express');
const { getSalesReport, getOverview, getPointsOrders } = require('../controllers/report.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Báo cáo bán mỹ phẩm + tổng quan kho cho quản lý (gateway: /api/commerce/reports/...)
router.get('/sales', ...managers, getSalesReport);
router.get('/overview', ...managers, getOverview);
router.get('/points-orders', ...managers, getPointsOrders); // đơn trả bằng Điểm GlowSkin (báo cáo điểm)

module.exports = router;
