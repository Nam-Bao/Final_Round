const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { createMedicalRecord, getCustomerMedicalHistory, getUpcomingFollowUps } = require('../controllers/medical-record.controller.js');

// 1. Tuyến đường tạo hồ sơ: 
// Khi Bác sĩ bấm "Hoàn tất khám" bên service-booking, token của bác sĩ sẽ được truyền sang đây.
router.post('/', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), createMedicalRecord);

router.get('/follow-ups/upcoming', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), getUpcomingFollowUps);

// 2. Tuyến đường xem hồ sơ:
// Cho phép CSKH, Bác sĩ và Quản lý xem toàn bộ lịch sử bệnh án của 1 Khách hàng
router.get('/:customerId', verifyToken, authorizeRoles('CONSULTANT', 'DOCTOR', 'GEN_MANAGER', 'ADMIN'), getCustomerMedicalHistory);

module.exports = router;