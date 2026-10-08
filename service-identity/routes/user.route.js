const express = require('express');
const { getAllUsers, createUser, updateUser, deleteUser } = require('../controllers/user.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chuỗi phòng thủ: Request -> verifyToken -> authorizeRoles -> getAllUsers
router.get('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN'), getAllUsers);
// Các đường dẫn API
router.post('/', createUser);           // Tạo mới (Body JSON)
router.put('/:id', updateUser);         // Cập nhật (Cần truyền ID lên URL)
router.delete('/:id', deleteUser);      // Xóa (Cần truyền ID lên URL)

module.exports = router;
