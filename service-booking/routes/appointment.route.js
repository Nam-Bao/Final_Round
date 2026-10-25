const express = require('express');
const router = express.Router();

const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const { 
  getMyTodayAppointments,
  getMyHistory,
  getTakenSlots,
  createAppointment,
  checkPaymentStatus,
  confirmPayment,
  sepayWebhook,
  getConsultantQueues,
  rescheduleAppointment,
  preCheckAppointment,
  finishExam,
  getAllAppointments,
  updateAppointment,
  cancelAppointment, 
  getAvailableDoctors,
  getAvailableSlots,
  checkoutAppointment,
  getAppointmentsByPatient
} = require('../controllers/appointment.controller.js');

// ==========================================
// 1. CÁC ĐƯỜNG DẪN TĨNH (Phải đặt lên trên)
// ==========================================
router.get('/', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAllAppointments);
router.get('/consultant-queues', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), getConsultantQueues);
router.get('/my-today', verifyToken, authorizeRoles('DOCTOR'), getMyTodayAppointments);
router.get('/my-history', verifyToken, getMyHistory);
router.get('/taken-slots', getTakenSlots);
router.get('/doctors-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableDoctors);
router.get('/slots-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableSlots);

// API Webhook cho SePay (KHÔNG VERIFY TOKEN Ở ĐÂY) - NGUYÊN NHÂN GÂY LỖI 404 ĐÃ ĐƯỢC ĐẶT LÊN ĐÂY
router.post('/sepay-webhook', sepayWebhook);

// Đặt lịch hẹn mới (Tạo đơn Pending Payment)
router.post('/', verifyToken, createAppointment);

router.get('/patient/:patientProfileId', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT', 'DOCTOR'), getAppointmentsByPatient);
// ==========================================
// 2. CÁC ĐƯỜNG DẪN ĐỘNG (Có chứa /:id ở giữa)
// ==========================================
// Khách kiểm tra trạng thái thanh toán
router.get('/:id/check-payment', verifyToken, checkPaymentStatus);

// Admin/Hệ thống tự chốt thanh toán
router.put('/:id/confirm-payment', verifyToken, confirmPayment);

router.put('/:id/reschedule', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), rescheduleAppointment);
router.put('/:id/pre-check', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), preCheckAppointment);
router.put('/:id/finish-exam', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER'), finishExam);
router.put('/:id/cancel', verifyToken, authorizeRoles('CUSTOMER','CONSULTANT', 'GEN_MANAGER', 'ADMIN'), cancelAppointment);
router.put('/:id', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN', 'DOCTOR'), updateAppointment);
router.put('/:id/checkout', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), checkoutAppointment);

module.exports = router;