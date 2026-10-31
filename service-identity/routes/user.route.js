const express = require('express');
const { getAllUsers, createUser, updateUser, deleteUser, getDoctors, getPublicDoctors, getTechnicianIds, getCustomers, getEmployees, createQuickCustomer, getCusProfile } = require('../controllers/user.controller.js');
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
// Công khai cho trang Đội ngũ bác sĩ (chỉ tên + ảnh); đặt trước các route có tham số
router.get('/doctors/public', getPublicDoctors);
router.get('/doctors', verifyToken, getDoctors);
// Mã KTV đang làm việc (service-booking dùng khi khách đặt buổi liệu trình)
router.get('/technician-ids', verifyToken, getTechnicianIds);
router.post('/quick-customer', verifyToken, authorizeRoles('ADMIN', 'CONSULTANT', 'SALES'), createQuickCustomer);
// Quản lý tài khoản: chỉ ADMIN (trang Quản lý Người dùng)
router.post('/', verifyToken, authorizeRoles('ADMIN'), createUser);
router.put('/:id', verifyToken, authorizeRoles('ADMIN'), updateUser);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN'), deleteUser);

module.exports = router;
