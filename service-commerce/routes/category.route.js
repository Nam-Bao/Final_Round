const express = require('express');
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/category.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', getCategories); 
// Các thao tác Thêm/Sửa/Xóa bị khóa chặt, chỉ ADMIN mới được vào
router.post('/', verifyToken, authorizeRoles('ADMIN'), createCategory);
router.put('/:id', verifyToken, authorizeRoles('ADMIN'), updateCategory);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN'), deleteCategory);

module.exports = router;