const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifySepay, verifyGhnOrStaff } = require('../middlewares/webhook.middleware.js');

const staffRoles = ['SALES', 'ADMIN', 'GEN_MANAGER'];

// Sổ địa chỉ: chỉ của chính khách đang đăng nhập (customer_id lấy từ token)
router.get('/addresses', verifyToken, orderController.getUserAddresses);
router.post('/addresses', verifyToken, orderController.addUserAddress); // API Thêm địa chỉ mới
router.put('/addresses/:id', verifyToken, orderController.updateUserAddress); // API Cập nhật địa chỉ

// Webhook: xác thực bằng khóa bí mật của bên gửi (không dùng JWT của người dùng)
router.post('/ghn-webhook', verifyGhnOrStaff, orderController.ghnWebhook);
router.post('/sepay-webhook', verifySepay, orderController.sepayOrderWebhook);

// Danh mục địa giới & báo giá GHN: công khai (không chứa dữ liệu cá nhân)
router.get('/ghn/province', orderController.getGHNProvince);
router.get('/ghn/district', orderController.getGHNDistrict);
router.get('/ghn/ward', orderController.getGHNWard);
router.post('/ghn/fee', orderController.calculateGHNFee);

// Endpoint: POST /api/commerce/orders/checkout (thanh toán giỏ hàng CỦA CHÍNH khách đang đăng nhập)
router.post('/checkout', verifyToken, authorizeRoles('CUSTOMER'), orderController.checkout);

// Quản lý đơn: chỉ NVBH/Quản lý/Admin
router.get('/admin', verifyToken, authorizeRoles(...staffRoles), orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', verifyToken, authorizeRoles(...staffRoles), orderController.updateOrderStatus);
router.put('/admin/:id/cancel', verifyToken, authorizeRoles(...staffRoles), orderController.cancelOrder);

router.get('/:id/check-payment', verifyToken, orderController.checkOrderPaymentStatus);

module.exports = router;
