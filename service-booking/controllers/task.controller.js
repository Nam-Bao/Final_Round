// GET /tasks/mine — việc đang chờ người dùng xử lý (chuông thông báo + số trên menu của trang quản trị).
// Đếm thẳng từ dữ liệu: tải lại trang không mất, xử lý xong thì tự hết. Thay đổi được báo real-time qua utils/notify.js.
// Mỗi việc: { key, label, count, path (trang xử lý), topic (chủ đề thông báo) }
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const {
  Appointment, AppointmentCancellation, Consultation, ShiftRequest, AttendanceCheckoutRequest, AttendanceExplanation,
  RefundClaim, BankTransaction, TreatmentSession, ServiceSession, SafetyRule, SafetyRuleReview,
} = require('../models');
const { OPEN: OPEN_REFUND } = require('../utils/refunds');

const OPEN_BANK = ['PARTIAL', 'UNMATCHED', 'OVERPAID'];
const task = (key, label, count, path, topic) => ({ key, label, count, path, topic });

const managerTasks = async (me, role) => {
  const [refunds, shifts, checkouts, explanations, rules] = await Promise.all([
    RefundClaim.count({ where: { status: { [Op.in]: OPEN_REFUND }, claimed_by: { [Op.ne]: me } } }),
    ShiftRequest.count({ where: { status: 'PENDING' } }),
    AttendanceCheckoutRequest.count({ where: { status: 'PENDING' } }),
    AttendanceExplanation.count({ where: { status: 'PENDING' } }),
    // Quy tắc an toàn: chỉ quản lý chung duyệt (đã được bác sĩ xem xét + đề xuất của bác sĩ)
    role === 'GEN_MANAGER' ? SafetyRule.count({ where: { status: { [Op.in]: ['REVIEWED', 'PROPOSED'] } } }) : 0,
  ]);
  return [
    task('refund-claims', 'Khoản hoàn tiền chờ đối chiếu', refunds, '/bank-transactions', 'bank'),
    task('shift-requests', 'Yêu cầu đổi / nghỉ ca chờ duyệt', shifts, '/schedule', 'shift-requests'),
    task('attendance', 'Giải trình / về sớm chờ duyệt', checkouts + explanations, '/attendance-management', 'attendance'),
    ...(role === 'GEN_MANAGER' ? [task('safety-rules', 'Quy tắc an toàn chờ quản lý xử lý (đã xem xét / bác sĩ đề xuất)', rules, '/safety-rules', 'safety-rules')] : []),
  ];
};

const doctorTasks = async (me, today) => {
  const [waiting, reviews, changes] = await Promise.all([
    Appointment.count({ where: { doctor_id: me, appointment_date: today, status: 'WAITING' } }),
    SafetyRuleReview.count({ where: { reviewer_id: me, verdict: 'PENDING', replaced: false } }),
    SafetyRule.count({ where: { created_by: me, origin: 'DOCTOR', status: 'CHANGES_REQUESTED' } }),
  ]);
  return [
    task('patients-waiting', 'Khách đang chờ khám', waiting, '/workspace', 'appointments'),
    task('rule-reviews', 'Quy tắc an toàn cần bạn xem xét', reviews, '/safety-rule-reviews', 'safety-rules'),
    task('rule-proposal-changes', 'Đề xuất quy tắc của bạn cần sửa theo góp ý của quản lý', changes, '/safety-rule-reviews', 'safety-rules'),
  ];
};

const consultantTasks = async () => {
  const [walkIn, reschedule, checkout, aptRefund, consultRefund, bank] = await Promise.all([
    Appointment.count({ where: { status: 'CHECK_IN', source: 'WALK_IN' } }),
    Appointment.count({ where: { status: 'NEEDS_RESCHEDULE' } }),
    Appointment.count({ where: { status: 'WAITING_FOR_SALE' } }),
    AppointmentCancellation.count({ where: { deposit_outcome: 'REFUND_PENDING' } }),
    Consultation.count({ where: { deposit_outcome: 'REFUND_PENDING' } }),
    BankTransaction.count({ where: { status: { [Op.in]: OPEN_BANK } } }),
  ]);
  return [
    task('walk-in', 'Khách vãng lai đang chờ', walkIn, '/consultant-workspace', 'appointments'),
    task('reschedule', 'Lịch cần sắp xếp lại', reschedule, '/consultant-workspace', 'appointments'),
    task('checkout', 'Khách khám xong chờ thu tiền', checkout, '/consultant-checkout', 'appointments'),
    task('appointment-refunds', 'Lịch hủy chờ hoàn cọc', aptRefund, '/appointment-management', 'appointments'),
    task('consultation-refunds', 'Lịch tư vấn chờ hoàn cọc', consultRefund, '/consultations', 'consultations'),
    task('bank', 'Giao dịch tiền vào cần xử lý', bank, '/bank-transactions', 'bank'),
  ];
};

const technicianTasks = async (me, today) => {
  const mine = { session_date: today, status: 'WAITING', [Op.or]: [{ technician_id: me }, { technician_id: null }] };
  const [treatments, services] = await Promise.all([TreatmentSession.count({ where: mine }), ServiceSession.count({ where: mine })]);
  return [task('sessions', 'Khách đang chờ làm dịch vụ', treatments + services, '/technician-workspace', 'sessions')];
};

const expertTasks = async (me, today) => [
  task('consultations-today', 'Lịch tư vấn hôm nay', await Consultation.count({ where: { expert_id: me, appointment_date: today, status: 'CONFIRMED' } }), '/expert-workspace', 'consultations'),
];

const getMyTasks = async (req, res) => {
  try {
    const { id, role } = req.user;
    const today = dayjs().format('YYYY-MM-DD');
    const byRole = {
      ADMIN: () => managerTasks(id, role), GEN_MANAGER: () => managerTasks(id, role), DOCTOR: () => doctorTasks(id, today),
      CONSULTANT: () => consultantTasks(), TECHNICIAN: () => technicianTasks(id, today), EXPERT: () => expertTasks(id, today),
    };
    res.status(200).json({ data: byRole[role] ? await byRole[role]() : [] });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { getMyTasks };
