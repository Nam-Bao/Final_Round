const express = require('express');
const {
    getAllPromotionsForAdmin,
    createPromotion,
    updatePromotion,
    deletePromotion,
    applyPromotion,
    redeemPromotion,
    getActivePromotions,
    savePromotion,
    getSavedPromotions,
    getUsedPromotions
} = require('../controllers/promotion.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// API Public: danh sách mã đang chạy
router.get('/', getActivePromotions);
// Áp mã: khách tự áp cho mình, nhân viên áp hộ khách tại quầy
router.post('/apply', verifyToken, authorizeRoles('CUSTOMER', 'CONSULTANT', 'SALES', 'GEN_MANAGER', 'ADMIN'), applyPromotion);
// Ghi nhận lượt dùng khi chốt hóa đơn tại quầy (service-booking gọi kèm token của nhân viên)
router.post('/redeem', verifyToken, authorizeRoles('CONSULTANT', 'SALES', 'GEN_MANAGER', 'ADMIN'), redeemPromotion);
// Ví voucher của khách đang đăng nhập (customer_id lấy từ token)
router.post('/save', verifyToken, authorizeRoles('CUSTOMER'), savePromotion); // API Lưu mã
router.get('/saved', verifyToken, authorizeRoles('CUSTOMER'), getSavedPromotions); // API Lấy mã đã lưu
router.get('/used', verifyToken, authorizeRoles('CUSTOMER'), getUsedPromotions);
// Các API quản lý dành cho Admin
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllPromotionsForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPromotion);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePromotion);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePromotion);

module.exports = router;