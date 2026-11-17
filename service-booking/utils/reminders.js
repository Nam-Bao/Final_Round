// Việc định kỳ chạy theo giờ Việt Nam (node-cron):
// - Email nhắc khách: lịch khám (24 giờ + 2 giờ trước), tư vấn chuyên gia (24 giờ + 1 giờ trước),
//   tái khám (3 ngày trước ngày bác sĩ hẹn, 8h sáng), gói liệu trình bỏ dở (không đến 14 ngày, 9h sáng, tối đa 2 lần).
// - Lịch khám quá giờ mà khách chưa đến: chỉ báo CSKH (chuông + danh sách), KHÔNG tự ghi "không đến" vì khách sẽ mất cọc.
// Chống gửi trùng: key email ở service-identity (EmailLog) + bộ nhớ tạm ở đây để khỏi gọi lại mỗi lần quét.
const cron = require('node-cron');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { Appointment, Consultation, CustomerPackage, TreatmentPackage, TreatmentSession } = require('../models');
const { isOnlineAppointment } = require('../controllers/video.controller');
const { sendEmail } = require('./mail');
const { notify } = require('./notify');
const { TIMING } = require('./timing');

const TZ = 'Asia/Ho_Chi_Minh';
const sent = new Set();
const once = (template, userId, key, data) => {
  if (sent.has(key)) return null;
  sent.add(key);
  if (sent.size > 20000) sent.clear();
  return sendEmail(template, userId, key, data);
};
const startOf = (date, time) => dayjs(`${date} ${String(time).slice(0, 5)}`);
// Mốc nhắc: còn <= hours giờ tới giờ hẹn, chưa qua giờ hẹn, và lịch đặt trước mốc đó (đặt sát giờ thì đã có email xác nhận, không nhắc trùng)
const due = (start, createdAt, hours, laterHours = 0) => {
  const left = start.diff(dayjs(), 'minute');
  return left > laterHours * 60 && left <= hours * 60 && dayjs(createdAt).isBefore(start.subtract(hours, 'hour'));
};
const UPCOMING = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'WAITING', 'CHECK_IN'];

// Lịch khám: 24 giờ trước (tới khi còn 2 giờ) và 2 giờ trước
const remindAppointments = async () => {
  const today = dayjs().format('YYYY-MM-DD');
  const rows = await Appointment.findAll({
    where: { status: { [Op.in]: ['CONFIRMED', 'WAITING'] }, appointment_date: { [Op.between]: [today, dayjs().add(1, 'day').format('YYYY-MM-DD')] }, [Op.or]: [{ source: null }, { source: { [Op.ne]: 'WALK_IN' } }] },
  });
  for (const a of rows) {
    const start = startOf(a.appointment_date, a.appointment_time);
    const time = start.format('HH:mm');
    const data = { appointment_id: a.id, date: a.appointment_date, time, online: isOnlineAppointment(a), doctor_id: a.doctor_id, patient_profile_id: a.patient_profile_id };
    if (due(start, a.createdAt, 24, 2)) once('REMIND_APPOINTMENT', a.customer_id, `REMIND_APT_24H:${a.id}:${a.appointment_date}T${time}`, { ...data, hours: 24 });
    if (due(start, a.createdAt, 2)) once('REMIND_APPOINTMENT', a.customer_id, `REMIND_APT_2H:${a.id}:${a.appointment_date}T${time}`, { ...data, hours: 2 });
  }
};

// Tư vấn chuyên gia: 24 giờ trước (tới khi còn 1 giờ) và 1 giờ trước
const remindConsultations = async () => {
  const today = dayjs().format('YYYY-MM-DD');
  const rows = await Consultation.findAll({ where: { status: 'CONFIRMED', appointment_date: { [Op.between]: [today, dayjs().add(1, 'day').format('YYYY-MM-DD')] } } });
  for (const c of rows) {
    const start = startOf(c.appointment_date, c.appointment_time);
    const time = start.format('HH:mm');
    const data = { consultation_id: c.id, expert_name: c.expert_name, date: c.appointment_date, time };
    if (due(start, c.paid_at || c.createdAt, 24, 1)) once('REMIND_CONSULT', c.customer_id, `REMIND_CONSULT_24H:${c.id}:${c.appointment_date}T${time}`, { ...data, hours: 24 });
    if (due(start, c.paid_at || c.createdAt, 1)) once('REMIND_CONSULT', c.customer_id, `REMIND_CONSULT_1H:${c.id}:${c.appointment_date}T${time}`, { ...data, hours: 1 });
  }
};

// Tái khám: 3 ngày trước ngày bác sĩ hẹn. Khách đã đặt lịch khám sắp tới thì không nhắc.
const FOLLOW_UP_DAYS_BEFORE = 3;
const remindFollowUps = async () => {
  const target = dayjs().add(FOLLOW_UP_DAYS_BEFORE, 'day').format('YYYY-MM-DD');
  const rows = await Appointment.findAll({ where: { follow_up_date: target, status: { [Op.in]: ['WAITING_FOR_SALE', 'COMPLETED'] } } });
  for (const a of rows) {
    const booked = await Appointment.count({ where: { customer_id: a.customer_id, status: { [Op.in]: UPCOMING }, appointment_date: { [Op.gte]: dayjs().format('YYYY-MM-DD') } } });
    if (booked) continue;
    once('REMIND_FOLLOW_UP', a.customer_id, `REMIND_FOLLOW_UP:${a.id}:${target}`, { follow_up_date: target, doctor_id: a.doctor_id, patient_profile_id: a.patient_profile_id });
  }
};

// Gói liệu trình còn buổi mà khách không đến >= 14 ngày (và chưa có buổi hẹn sắp tới): nhắc lần 1; >= 28 ngày: nhắc lần 2, rồi thôi
const PACKAGE_IDLE_DAYS = 14;
const remindPackages = async () => {
  const pkgs = await CustomerPackage.findAll({ where: { status: 'ACTIVE', remaining_sessions: { [Op.gt]: 0 } } });
  if (!pkgs.length) return;
  const [sessions, catalog] = await Promise.all([
    TreatmentSession.findAll({ where: { customer_package_id: { [Op.in]: pkgs.map((p) => p.id) } }, attributes: ['customer_package_id', 'session_date', 'status'], raw: true }),
    TreatmentPackage.findAll({ where: { id: { [Op.in]: [...new Set(pkgs.map((p) => p.package_id))] } }, attributes: ['id', 'name'], raw: true }),
  ]);
  const today = dayjs().format('YYYY-MM-DD');
  for (const p of pkgs) {
    const mine = sessions.filter((s) => s.customer_package_id === p.id);
    if (mine.some((s) => s.status !== 'COMPLETED' && s.session_date >= today)) continue; // đã có buổi hẹn / đang chờ làm
    const last = mine.filter((s) => s.status === 'COMPLETED').map((s) => s.session_date).sort().pop() || dayjs(p.createdAt).format('YYYY-MM-DD');
    const idle = dayjs(today).diff(dayjs(last), 'day');
    if (idle < PACKAGE_IDLE_DAYS) continue;
    const nth = idle >= PACKAGE_IDLE_DAYS * 2 ? 2 : 1;
    once('REMIND_PACKAGE', p.customer_id, `REMIND_PACKAGE:${p.id}:${last}:${nth}`, {
      package_name: catalog.find((c) => c.id === p.package_id)?.name || 'liệu trình', remaining: p.remaining_sessions, last_date: last, nth,
    });
  }
};

// Lịch khám tại phòng khám quá giờ hẹn + thời gian chờ (NO_SHOW_GRACE_MINUTES) mà khách chưa đến quầy (chưa tiếp nhận)
const overdueArrivals = async () => {
  const rows = await Appointment.findAll({
    where: { status: { [Op.in]: ['PENDING', 'CONFIRMED'] }, appointment_date: { [Op.lte]: dayjs().format('YYYY-MM-DD') }, [Op.or]: [{ source: null }, { source: { [Op.ne]: 'WALK_IN' } }] },
    order: [['appointment_date', 'ASC'], ['appointment_time', 'ASC']],
  });
  const limit = dayjs().subtract(TIMING.noShowGraceMinutes, 'minute');
  return rows.filter((a) => !isOnlineAppointment(a) && startOf(a.appointment_date, a.appointment_time).isBefore(limit));
};

// Số lịch quá giờ đổi theo thời gian (không có ai sửa dữ liệu) => tự báo để chuông CSKH cập nhật
let lastOverdue = null;
const watchOverdue = async () => {
  const key = (await overdueArrivals()).map((a) => a.id).join(',');
  if (lastOverdue !== null && key !== lastOverdue) notify('appointments');
  lastOverdue = key;
};

const safe = (name, fn) => () => fn().catch((e) => console.warn(`[CRON] ${name} lỗi:`, e.message));
const start = () => {
  const opt = (name) => ({ timezone: TZ, noOverlap: true, name });
  cron.schedule('*/10 * * * *', safe('nhắc lịch khám / tư vấn', async () => { await remindAppointments(); await remindConsultations(); }), opt('remind-upcoming'));
  cron.schedule('0 8 * * *', safe('nhắc tái khám', remindFollowUps), opt('remind-follow-up'));
  cron.schedule('0 9 * * *', safe('nhắc gói liệu trình', remindPackages), opt('remind-package'));
  cron.schedule('*/5 * * * *', safe('lịch quá giờ chưa đến', watchOverdue), opt('overdue-arrivals'));
  safe('lịch quá giờ chưa đến', watchOverdue)();
  console.log('⏰ Đã bật lịch chạy: nhắc lịch khám / tư vấn (10 phút), tái khám (8h), gói liệu trình (9h), lịch quá giờ chưa đến (5 phút)');
};

module.exports = { start, remindAppointments, remindConsultations, remindFollowUps, remindPackages, overdueArrivals };
