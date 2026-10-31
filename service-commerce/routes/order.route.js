const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifySepay, verifyGhnOrStaff } = require('../middlewares/webhook.middleware.js');

// Khách hàng chỉ thao tác trên dữ liệu của chính mình (customer_id lấy từ token)
const customerOnly = [verifyToken, authorizeRoles('CUSTOMER')];
const salesStaff = [verifyToken, authorizeRoles('SALES', 'ADMIN', 'GEN_MANAGER')];

// 0. Webhook: xác thực bằng khóa bí mật của bên gửi (không dùng JWT của người dùng)
router.post('/ghn-webhook', verifyGhnOrStaff, orderController.ghnWebhook);
router.post('/sepay-webhook', verifySepay, orderController.sepayOrderWebhook);

// 0b. Danh mục địa giới & báo giá GHN: công khai (không chứa dữ liệu cá nhân)
router.get('/ghn/province', orderController.getGHNProvince);
router.get('/ghn/district', orderController.getGHNDistrict);
router.get('/ghn/ward', orderController.getGHNWard);
router.post('/ghn/fee', orderController.calculateGHNFee);

// 1. Sổ địa chỉ (các route cụ thể phải đặt lên trước route '/')
router.get('/addresses', customerOnly, orderController.getUserAddresses);
router.post('/addresses', customerOnly, orderController.addUserAddress);
router.put('/addresses/:id', customerOnly, orderController.updateUserAddress);

// 2. Endpoint: POST /api/commerce/orders/checkout (thanh toán giỏ hàng CỦA CHÍNH khách đang đăng nhập)
router.post('/checkout', customerOnly, orderController.checkout);

// 2b. Đơn mỹ phẩm mua tại quầy sau buổi khám (service-booking gọi khi CSKH chốt sale)
router.post('/counter', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), orderController.createCounterOrder);

// 3. Quản lý đơn: chỉ NVBH/Quản lý/Admin (đặt trước route '/')
router.get('/admin', salesStaff, orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', salesStaff, orderController.updateOrderStatus);
router.put('/admin/:id/cancel', salesStaff, orderController.cancelOrder);

// 4. Danh sách đơn hàng của khách đang đăng nhập (GET /api/commerce/orders)
router.get('/', customerOnly, orderController.getCustomerOrders);

// 5. Khách kiểm tra đơn của mình đã được thanh toán chưa (polling sau khi quét QR)
router.get('/:id/check-payment', customerOnly, orderController.checkOrderPaymentStatus);

module.exports = router;
