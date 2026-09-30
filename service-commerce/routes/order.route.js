const express = require('express');
const { getUnpaidOrders, payOrder } = require('../controllers/order.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Lấy danh sách hóa đơn chờ thu ngân
router.get('/unpaid', getUnpaidOrders);

// Cập nhật thanh toán
router.put('/:id/pay', payOrder);

module.exports = router;