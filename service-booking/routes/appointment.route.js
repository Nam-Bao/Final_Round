const express = require('express');
const router = express.Router();

const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifySepay } = require('../middlewares/webhook.middleware.js');

const { 
  getMyTodayAppointments,
  getMyHistory,
  getTakenSlots,
  getDepositQuote,
  createAppointment,
  checkPaymentStatus,
  confirmPayment,
  sepayWebhook,
  getConsultantQueues,
  rescheduleAppointment,
  preCheckAppointment,
  finishExam,
  scanCounterImages,
  getCustomerUpcoming,
  attachChatImages,
  getAllAppointments,
  updateAppointment,
  cancelAppointment, 
  getAvailableDoctors,
  getAvailableSlots,
  checkoutAppointment,
  getAppointmentsByPatient,
  abandonUnpaidAppointment,
  getPendingDepositRefunds,
  confirmDepositRefund,
  markNoShow,
  startExam,
  returnToQueue,
  getDoctorBoard,
  createWalkIn,
  inviteWalkIn,
  getRescheduleSlots,
  customerRescheduleAppointment,
  getMyReminders
} = require('../controllers/appointment.controller.js');
const { getVideoToken } = require('../controllers/video.controller.js');

// ==========================================
// 1. CÁC ĐƯỜNG DẪN TĨNH (Phải đặt lên trên)
// ==========================================
router.get('/', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAllAppointments);
router.get('/consultant-queues', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), getConsultantQueues);
router.get('/my-today', verifyToken, authorizeRoles('DOCTOR'), getMyTodayAppointments);
router.get('/my-history', verifyToken, getMyHistory);
router.get('/my-reminders', verifyToken, authorizeRoles('CUSTOMER'), getMyReminders);
router.get('/walk-in/doctor-board', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), getDoctorBoard);
router.post('/walk-in', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), createWalkIn);
router.get('/taken-slots', getTakenSlots);
// Lịch do phòng khám hủy, chờ CSKH hoàn cọc cho khách
// Lịch khám tại phòng khám quá giờ hẹn mà khách chưa đến quầy: CSKH gọi khách hoặc ghi "không đến" (hệ thống không tự ghi)
router.get('/overdue-arrivals', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const list = await require('../utils/reminders').overdueArrivals();
    res.json({ data: list.map((a) => ({ id: a.id, customer_id: a.customer_id, patient_profile_id: a.patient_profile_id, doctor_id: a.doctor_id, appointment_date: a.appointment_date, appointment_time: a.appointment_time, status: a.status })) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});
router.get('/pending-refunds', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), getPendingDepositRefunds);
router.get('/deposit-quote', verifyToken, authorizeRoles('CUSTOMER'), getDepositQuote); // Báo giá cọc theo đúng công thức server
router.get('/doctors-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableDoctors);
router.get('/slots-available', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN', 'CONSULTANT'), getAvailableSlots);

// API Webhook cho SePay (KHÔNG VERIFY TOKEN Ở ĐÂY) - NGUYÊN NHÂN GÂY LỖI 404 ĐÃ ĐƯỢC ĐẶT LÊN ĐÂY
router.post('/sepay-webhook', verifySepay, sepayWebhook); // Xác thực bằng API key SePay (không dùng JWT)

// Đặt lịch hẹn mới (Tạo đơn Pending Payment)
router.post('/', verifyToken, createAppointment);

router.get('/patient/:patientProfileId', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT', 'DOCTOR'), getAppointmentsByPatient);
// ==========================================
// 2. CÁC ĐƯỜNG DẪN ĐỘNG (Có chứa /:id ở giữa)
// ==========================================
// Chứng từ in cho khách (A5): phiếu thanh toán sau khám, đơn thuốc / chỉ định điều trị
const { printInvoice, printPrescription } = require('../controllers/print.controller.js');
router.get('/:id/print/invoice', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), printInvoice);
router.get('/:id/print/prescription', verifyToken, authorizeRoles('DOCTOR', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN'), printPrescription);

// Khách kiểm tra trạng thái thanh toán
router.get('/:id/check-payment', verifyToken, checkPaymentStatus);

// Lấy token vào phòng khám video (chỉ khách và bác sĩ của lịch hẹn online)
router.get('/:id/video-token', verifyToken, authorizeRoles('CUSTOMER', 'DOCTOR'), getVideoToken);

// Nhân viên xác nhận khách đóng cọc tiền mặt tại quầy (khách KHÔNG tự xác nhận được)
router.put('/:id/confirm-payment', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), confirmPayment);

// Khách rời trang thanh toán mà chưa trả => xóa lịch giữ chỗ, trả ca khám về trống
router.delete('/:id/unpaid', verifyToken, authorizeRoles('CUSTOMER'), abandonUnpaidAppointment);

router.put('/:id/reschedule', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), rescheduleAppointment);
router.get('/:id/reschedule-slots', verifyToken, authorizeRoles('CUSTOMER'), getRescheduleSlots);
router.put('/:id/customer-reschedule', verifyToken, authorizeRoles('CUSTOMER'), customerRescheduleAppointment);
router.put('/:id/invite', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), inviteWalkIn);
router.put('/:id/no-show', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), markNoShow);
router.put('/:id/pre-check', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), preCheckAppointment);
router.put('/:id/start-exam', verifyToken, authorizeRoles('DOCTOR'), startExam);
router.put('/:id/ai-scan', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER'), scanCounterImages); // quét AI ảnh CSKH chụp tại quầy
// CSKH đính ảnh khách gửi qua chat vào hồ sơ khám
router.get('/customer/:customerId/upcoming', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), getCustomerUpcoming);
router.put('/:id/attach-images', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), attachChatImages);
router.put('/:id/return-to-queue', verifyToken, authorizeRoles('DOCTOR'), returnToQueue);
router.put('/:id/finish-exam', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER'), finishExam);
router.put('/:id/refund-deposit', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), confirmDepositRefund);
router.put('/:id/cancel', verifyToken, authorizeRoles('CUSTOMER','CONSULTANT', 'GEN_MANAGER', 'ADMIN'), cancelAppointment);
router.put('/:id', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN', 'DOCTOR'), updateAppointment);
router.put('/:id/checkout', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), checkoutAppointment);

module.exports = router;