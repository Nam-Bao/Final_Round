const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// API lấy danh sách sổ địa chỉ (Phải đặt ở trên)
router.get('/addresses', orderController.getUserAddresses);

router.post('/ghn-webhook', orderController.ghnWebhook);
router.get('/ghn/province', orderController.getGHNProvince);
router.get('/ghn/district', orderController.getGHNDistrict);
router.get('/ghn/ward', orderController.getGHNWard);
router.post('/ghn/fee', orderController.calculateGHNFee);

router.post('/sepay-webhook', orderController.sepayOrderWebhook); // <== THÊM DÒNG NÀY

// Endpoint: POST /api/commerce/orders/checkout
router.post('/checkout', orderController.checkout);
router.post('/addresses', orderController.addUserAddress); // API Thêm địa chỉ mới
router.put('/addresses/:id', orderController.updateUserAddress); // API Cập nhật địa chỉ

router.get('/admin', orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', orderController.updateOrderStatus);
router.put('/admin/:id/cancel', orderController.cancelOrder);

router.get('/:id/check-payment', verifyToken, orderController.checkOrderPaymentStatus); // <== THÊM DÒNG NÀY

module.exports = router;