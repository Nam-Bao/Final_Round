const express = require('express');
const router = express.Router();

const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

// Nhớ import ĐẦY ĐỦ các hàm vừa tạo
const { 
  getMyTodayAppointments,
  getMyHistory,
  getTakenSlots,
  createAppointment,
  getConsultantQueues,
  rescheduleAppointment,
  preCheckAppointment,
  finishExam,
  getAllAppointments,
  updateAppointment,
  cancelAppointment, 
  getAvailableDoctors,
  getAvailableSlots
} = require('../controllers/appointment.controller.js');

router.get('/', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAllAppointments);
// 0. Lấy danh sách hàng chờ cho CSKH
router.get('/consultant-queues', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), getConsultantQueues);
// 1. Chỉ Bác sĩ mới được kéo danh sách hàng đợi của mình
router.get('/my-today', verifyToken, authorizeRoles('DOCTOR'), getMyTodayAppointments);

// 2. Khách hàng xem lịch sử cá nhân (Route 'my-history' phải đặt trước '/:id' nếu có)
router.get('/my-history', verifyToken, getMyHistory);

// 3. API lấy giờ đã bị đặt (Mở công khai không cần token để xem trước giờ trống)
router.get('/taken-slots', getTakenSlots);

// 4. Khách hàng (hoặc nhân viên) tạo lịch hẹn mới
router.post('/', verifyToken, createAppointment);

router.post('/', verifyToken, authorizeRoles('CUSTOMER', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN'), createAppointment);

router.get('/doctors-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableDoctors);
router.get('/slots-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableSlots);

router.put('/:id/reschedule', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), rescheduleAppointment);
router.put('/:id/pre-check', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), preCheckAppointment);
router.put('/:id/finish-exam', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER'), finishExam);
router.put('/:id', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), updateAppointment);
router.put('/:id/cancel', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), cancelAppointment);

module.exports = router;