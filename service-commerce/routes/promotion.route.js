const express = require('express');
const { 
  getAllPromotionsForAdmin, createPromotion, 
  updatePromotion, deletePromotion, applyPromotion, incrementUsage 
} = require('../controllers/promotion.controller.js');
const { verifyToken, authorizeRoles, i } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// API Public cho phép khách hàng check mã
router.post('/apply', applyPromotion); 

router.post('/increment-usage', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT'), incrementUsage);

// Các API quản lý dành cho Admin
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllPromotionsForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPromotion);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePromotion);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePromotion);

module.exports = router;