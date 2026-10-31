const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// Khách hàng chỉ thao tác trên dữ liệu của chính mình (customer_id lấy từ token)
const customerOnly = [verifyToken, authorizeRoles('CUSTOMER')];
const salesStaff = [verifyToken, authorizeRoles('SALES', 'ADMIN', 'GEN_MANAGER')];

// 0. Webhook từ bên ngoài (tự xác thực bằng khoá bí mật, không dùng JWT của khách)
router.post('/ghn-webhook', orderController.verifyGhnWebhook, orderController.ghnWebhook);
router.post('/sepay-webhook', orderController.sepayOrderWebhook);

// 0b. Giao hàng nhanh (GHN): tra Tỉnh / Quận / Phường (công khai) và tính phí ship (cần đăng nhập)
router.get('/ghn/province', orderController.getGHNProvince);
router.get('/ghn/district', orderController.getGHNDistrict);
router.get('/ghn/ward', orderController.getGHNWard);
router.post('/ghn/fee', verifyToken, orderController.calculateGHNFee);

// 1. API Sổ địa chỉ (Các route cụ thể phải đặt lên trước route '/')
router.get('/addresses', customerOnly, orderController.getUserAddresses);
router.post('/addresses', customerOnly, orderController.addUserAddress);
router.put('/addresses/:id', customerOnly, orderController.updateUserAddress);

// 2. API Checkout Đơn hàng (POST /api/commerce/orders/checkout)
router.post('/checkout', customerOnly, orderController.checkout);

// 2b. Đơn mỹ phẩm mua tại quầy sau buổi khám (service-booking gọi khi CSKH chốt sale)
router.post('/counter', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), orderController.createCounterOrder);

// 3. API Quản lý dành cho Admin / Sale (Đặt trước route '/')
router.get('/admin', salesStaff, orderController.getAllOrdersForAdmin);
router.put('/admin/:id/status', salesStaff, orderController.updateOrderStatus);
router.put('/admin/:id/cancel', salesStaff, orderController.cancelOrder);

// 4. API Lấy danh sách đơn hàng của Khách hàng đang đăng nhập (GET /api/commerce/orders)
router.get('/', customerOnly, orderController.getCustomerOrders);

// 5. Khách kiểm tra đơn của mình đã được thanh toán chưa (polling sau khi quét QR)
router.get('/:id/check-payment', customerOnly, orderController.checkOrderPaymentStatus);

module.exports = router;
