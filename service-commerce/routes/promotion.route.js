const express = require('express');
const {
    getAllPromotionsForAdmin,
    createPromotion,
    updatePromotion,
    deletePromotion,
    applyPromotion,
    getActivePromotions,
    savePromotion,
    getSavedPromotions,
    getUsedPromotions,
    incrementUsage
} = require('../controllers/promotion.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Danh sách mã đang chạy: công khai
router.get('/', getActivePromotions);
// Kiểm tra mã: cần đăng nhập. Khách => kiểm tra theo chính mình; nhân viên (thu ngân) => theo customer_id gửi kèm
router.post('/apply', verifyToken, applyPromotion);
// Lưu mã / mã đã lưu / mã đã dùng: luôn của khách đang đăng nhập (customer_id lấy từ token)
router.post('/save', verifyToken, authorizeRoles('CUSTOMER'), savePromotion);
router.get('/saved', verifyToken, authorizeRoles('CUSTOMER'), getSavedPromotions);
router.get('/used', verifyToken, authorizeRoles('CUSTOMER'), getUsedPromotions);
// Booking gọi sau khi chốt bill có dùng voucher (trước đây route này KHÔNG tồn tại => voucher spa không bị trừ lượt)
router.post('/increment-usage', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), incrementUsage);
// Các API quản lý dành cho Admin
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllPromotionsForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPromotion);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePromotion);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePromotion);

module.exports = router;