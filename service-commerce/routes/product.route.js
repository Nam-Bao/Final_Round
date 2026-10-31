const express = require('express');
const { getProducts, getProductsForAdmin, createProduct, updateProduct, deleteProduct, deductInventory, getAllProducts } = require('../controllers/product.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();


// Khách hàng có thể xem danh sách sản phẩm (chỉ mỹ phẩm bán, không có vật tư nội bộ)
router.get('/', getProducts);
// Trang Kho & Sản phẩm: xem cả vật tư nội bộ
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getProductsForAdmin);
// Đã bỏ dòng router.get('/', getAllProducts) trùng đường dẫn: Express luôn chạy getProducts trước nên dòng này không bao giờ được gọi

router.post('/deduct', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT'), deductInventory);

// Chỉ ADMIN và MANAGER được phép quản lý kho
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createProduct);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updateProduct);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deleteProduct);

module.exports = router;