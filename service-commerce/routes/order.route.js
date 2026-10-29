const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// 1. API Sổ địa chỉ (Các route cụ thể phải đặt lên trước route '/')
router.get('/addresses', orderController.getUserAddresses);
router.post('/addresses', orderController.addUserAddress);
router.put('/addresses/:id', orderController.updateUserAddress);

// 2. API Checkout Đơn hàng (POST /api/commerce/orders/checkout)
router.post('/checkout', orderController.checkout);

// 3. API Quản lý dành cho Admin / Sale (Đặt trước route '/')
router.get('/admin', orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', orderController.updateOrderStatus);
router.put('/admin/:id/cancel', orderController.cancelOrder);

// 4. API Lấy danh sách đơn hàng của Khách hàng (GET /api/commerce/orders?customer_id=xxx)
router.get('/', orderController.getCustomerOrders);

module.exports = router;