const express = require('express');
const { getAllUsers, createUser, updateUser, deleteUser, getDoctors, getCustomers, getEmployees, createQuickCustomer, getCusProfile } = require('../controllers/user.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chuỗi phòng thủ: Request -> verifyToken -> authorizeRoles -> getAllUsers
router.get('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN'), getAllUsers);
// Lễ tân, CSKH, Bác sĩ, Quản lý đều được xem danh sách khách
router.get('/customers', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN'), getCustomers);
router.get('/profile', verifyToken, getCusProfile);

// Chỉ Quản lý và Admin được xem danh sách toàn bộ nhân viên
router.get('/employees', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getEmployees);

// Các đường dẫn API
router.get('/doctors', verifyToken, getDoctors);
router.post('/quick-customer', verifyToken, authorizeRoles('ADMIN', 'CONSULTANT', 'SALES'), createQuickCustomer);
// Quản lý tài khoản: chỉ ADMIN (trang Quản lý Người dùng)
router.post('/', verifyToken, authorizeRoles('ADMIN'), createUser);
router.put('/:id', verifyToken, authorizeRoles('ADMIN'), updateUser);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN'), deleteUser);

module.exports = router;
