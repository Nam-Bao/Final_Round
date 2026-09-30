const express = require('express');
const { getProducts, createProduct, updateProduct, deleteProduct } = require('../controllers/product.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Khách hàng có thể xem danh sách sản phẩm
router.get('/', getProducts); 

// Chỉ ADMIN và MANAGER được phép quản lý kho
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createProduct);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updateProduct);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deleteProduct);

module.exports = router;