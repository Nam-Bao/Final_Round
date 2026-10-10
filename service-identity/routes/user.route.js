const express = require('express');
const { getAllUsers, createUser, updateUser, deleteUser, getDoctors, getCustomers, getEmployees } = require('../controllers/user.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chuỗi phòng thủ: Request -> verifyToken -> authorizeRoles -> getAllUsers
router.get('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN'), getAllUsers);
// Lễ tân, CSKH, Bác sĩ, Quản lý đều được xem danh sách khách
router.get('/customers', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN'), getCustomers);

// Chỉ Quản lý và Admin được xem danh sách toàn bộ nhân viên
router.get('/employees', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getEmployees);

// Các đường dẫn API
router.get('/doctors', verifyToken, getDoctors);
router.post('/', createUser);           // Tạo mới (Body JSON)
router.put('/:id', updateUser);         // Cập nhật (Cần truyền ID lên URL)
router.delete('/:id', deleteUser);      // Xóa (Cần truyền ID lên URL)

module.exports = router;
