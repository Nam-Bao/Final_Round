const express = require('express');
const { getAllUsers, createUser, updateUser, deleteUser } = require('../controllers/user.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chuỗi phòng thủ: Request -> verifyToken -> authorizeRoles -> getAllUsers
router.use(verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'));

// Các đường dẫn API
router.get('/', getAllUsers);           // Lấy danh sách
router.post('/', createUser);           // Tạo mới (Body JSON)
router.put('/:id', updateUser);         // Cập nhật (Cần truyền ID lên URL)
router.delete('/:id', deleteUser);      // Xóa (Cần truyền ID lên URL)

module.exports = router;
