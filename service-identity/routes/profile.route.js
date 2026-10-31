const express = require('express');
const { getMyProfile, updateMyProfile, getMyPatientProfiles, createPatientProfile, updatePatientProfile, deletePatientProfile, getPatientProfilesByUserId } = require('../controllers/profile.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Lấy và Cập nhật thông tin định danh Account
router.get('/me', verifyToken, getMyProfile);
router.put('/me', verifyToken, updateMyProfile); // Đã bổ sung PUT để lưu Profile

// ===================================
// TÍNH NĂNG QUẢN LÝ HỒ SƠ NGƯỜI BỆNH
// ===================================
router.get('/patients', verifyToken, getMyPatientProfiles);
router.post('/patients', verifyToken, createPatientProfile);
router.put('/patients/:id', verifyToken, updatePatientProfile);
router.delete('/patients/:id', verifyToken, deletePatientProfile);
// Xem hồ sơ người bệnh của tài khoản KHÁC: chỉ nhân viên (trước đây khách nào cũng xem được của khách khác)
router.get('/patients/user/:userId', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT', 'DOCTOR', 'SALES'), getPatientProfilesByUserId);

module.exports = router;