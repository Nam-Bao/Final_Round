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
    getUsedPromotions
} = require('../controllers/promotion.controller.js');
const { verifyToken, authorizeRoles, i } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// API Public cho phép khách hàng check mã
router.get('/', getActivePromotions);
router.post('/apply', applyPromotion);
router.post('/save', savePromotion); // API Lưu mã
router.get('/saved', getSavedPromotions); // API Lấy mã đã lưu
router.get('/used', getUsedPromotions);
// Các API quản lý dành cho Admin
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllPromotionsForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPromotion);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePromotion);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePromotion);

module.exports = router;