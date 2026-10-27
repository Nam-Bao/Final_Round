const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// API lấy danh sách sổ địa chỉ (Phải đặt ở trên)
router.get('/addresses', orderController.getUserAddresses);
// Endpoint: POST /api/commerce/orders/checkout
router.post('/checkout', orderController.checkout);
router.post('/addresses', orderController.addUserAddress); // API Thêm địa chỉ mới
router.put('/addresses/:id', orderController.updateUserAddress); // API Cập nhật địa chỉ

router.get('/admin', orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', orderController.updateOrderStatus);
router.put('/admin/:id/cancel', orderController.cancelOrder);

module.exports = router;