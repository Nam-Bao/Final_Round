// Gửi email cho khách: chống gửi trùng (EmailLog.key duy nhất), bỏ qua email tạm / khách tắt nhắc lịch,
// gửi lỗi thì thử lại tối đa 3 lần. Lỗi gửi KHÔNG làm hỏng nghiệp vụ (đặt lịch, đặt đơn vẫn thành công).
const axios = require('axios');
const cron = require('node-cron');
const { Op, UniqueConstraintError } = require('sequelize');
const { EmailLog, User, Profile, DoctorProfile, PatientProfile } = require('../models');
const { TEMPLATES, render } = require('../utils/mailTemplates');
const mailer = require('../utils/mailer');

const TZ = 'Asia/Ho_Chi_Minh';
const MAX_ATTEMPTS = 3;
const GATEWAY = () => process.env.GATEWAY_URL || 'http://localhost:4000';
const CLIENT_URL = () => (process.env.CLIENT_URL || 'http://localhost:3001').replace(/\/$/, '');
// Email tạm của hồ sơ khách tạo tại quầy (chưa đăng ký tài khoản) => không gửi
const UNDELIVERABLE = /@walkin\.glowskin\.local$/i;

// Thông tin phòng khám ở chân email: lấy từ "Thông tin phòng khám" (service-media), ô trống dùng mặc định như website
let clinicCache = { at: 0, value: null };
const clinicInfo = async () => {
  if (clinicCache.value && Date.now() - clinicCache.at < 10 * 60 * 1000) return clinicCache.value;
  const info = await axios.get(`${GATEWAY()}/api/media/pages/clinic-info`, { timeout: 4000 }).then((r) => r.data.data || {}).catch(() => ({}));
  const value = { ...info, hotline: info.hotline || '0869694064', address: info.address || process.env.CLINIC_ADDRESS || '', working_hours: info.working_hours || '08:00 - 17:00 (Hàng ngày)' };
  clinicCache = { at: Date.now(), value };
  return value;
};

// Tên bác sĩ / người được khám nhắc trong email (dữ liệu nằm ở identity nên service gọi chỉ cần gửi mã)
const resolveNames = async (data) => {
  const doctorIds = [data.doctor_id].filter(Boolean);
  const patientIds = [data.patient_profile_id].filter(Boolean);
  const [docs, patients] = await Promise.all([
    doctorIds.length ? User.findAll({ where: { id: doctorIds }, include: [{ model: Profile, attributes: ['full_name'] }, { model: DoctorProfile, attributes: ['title'] }] }) : [],
    patientIds.length ? PatientProfile.findAll({ where: { id: patientIds }, attributes: ['id', 'full_name', 'relationship'] }) : [],
  ]);
  return {
    people: Object.fromEntries(docs.map((u) => [u.id, { name: u.Profile?.full_name, title: u.DoctorProfile?.title }])),
    patients: Object.fromEntries(patients.map((x) => [x.id, { name: x.full_name, relationship: x.relationship }])),
  };
};

const redact = (tpl, data) => Object.fromEntries(Object.entries(data || {}).filter(([k]) => !(tpl.sensitive || []).includes(k)));

// Dựng + gửi 1 email đã có dòng nhật ký. data: dữ liệu đầy đủ (kể cả phần nhạy cảm như OTP)
const deliver = async (log, user, data) => {
  const tpl = TEMPLATES[log.template];
  try {
    const [clinic, names] = await Promise.all([clinicInfo(), resolveNames(data)]);
    const mail = render(tpl, { name: user?.Profile?.full_name, data, clinic, ...names, link: (p) => `${CLIENT_URL()}${p}` });
    await log.update({ subject: mail.subject.slice(0, 300), attempts: log.attempts + 1 });
    await mailer.send({ to: log.to_email, subject: mail.subject, html: mail.html, text: mail.text, key: log.key });
    await log.update({ status: 'SENT', sent_at: new Date(), last_error: null });
  } catch (error) {
    await log.update({ status: 'FAILED', last_error: String(error.message || error).slice(0, 500) });
    console.warn(`[EMAIL] Gửi ${log.template} cho ${log.to_email} lỗi:`, error.message);
  }
  return log.status;
};

// Xếp email vào nhật ký và gửi. Trả { status, duplicate? }
// template: tên mẫu (utils/mailTemplates.js); key: khóa chống trùng; user_id: người nhận
const queueEmail = async ({ template, user_id, key, data = {} }) => {
  const tpl = TEMPLATES[template];
  if (!tpl) throw Object.assign(new Error('Mẫu email không tồn tại'), { status: 400 });
  if (!key || String(key).length > 200) throw Object.assign(new Error('Thiếu khóa email'), { status: 400 });
  const existing = await EmailLog.findOne({ where: { key } });
  if (existing) return { status: existing.status, duplicate: true };

  const user = user_id ? await User.findByPk(user_id, { include: [{ model: Profile, attributes: ['full_name'] }] }) : null;
  const skip = !user || !user.email ? 'Không tìm thấy email người nhận'
    : UNDELIVERABLE.test(user.email) ? 'Email tạm (khách tạo tại quầy, chưa đăng ký)'
      : user.status !== 'ACTIVE' ? 'Tài khoản không hoạt động'
        : tpl.kind === 'reminder' && user.email_reminders === false ? 'Khách tắt email nhắc lịch' : null;
  let log;
  try {
    log = await EmailLog.create({
      key, template, user_id: user?.id || null, to_email: user?.email || null, data: redact(tpl, data),
      status: skip ? 'SKIPPED' : 'QUEUED', skip_reason: skip,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) return { status: 'QUEUED', duplicate: true }; // 2 lần gọi cùng lúc
    throw error;
  }
  if (skip) return { status: 'SKIPPED', reason: skip };
  return { status: await deliver(log, user, data) };
};

// Gửi lại email lỗi (mẫu có dữ liệu nhạy cảm như OTP không gửi lại được vì không lưu mã)
const resend = async (log) => {
  const tpl = TEMPLATES[log.template];
  if (!tpl || (tpl.sensitive || []).length) throw Object.assign(new Error('Email này không gửi lại được (mã OTP không được lưu), khách cần yêu cầu mã mới'), { status: 409 });
  const user = await User.findByPk(log.user_id, { include: [{ model: Profile, attributes: ['full_name'] }] });
  if (!user) throw Object.assign(new Error('Không còn tài khoản người nhận'), { status: 409 });
  await log.update({ status: 'QUEUED', to_email: user.email });
  return deliver(log, user, log.data || {});
};

const retryFailed = async () => {
  const rows = await EmailLog.findAll({ where: { status: 'FAILED', attempts: { [Op.lt]: MAX_ATTEMPTS }, createdAt: { [Op.gt]: new Date(Date.now() - 24 * 3600 * 1000) } }, limit: 50 });
  for (const log of rows) {
    if ((TEMPLATES[log.template]?.sensitive || []).length) continue;
    await resend(log).catch(() => {});
  }
};

// Dọn mã OTP / phiên đặt lại mật khẩu đã hết hạn (mã chỉ sống 15 phút, đây là dọn rác định kỳ)
const cleanupOtp = async () => {
  const [n] = await User.update(
    { reset_password_token: null, reset_password_expires: null, reset_password_attempts: 0 },
    { where: { reset_password_expires: { [Op.lt]: new Date() } } },
  );
  if (n) console.log(`🧹 [OTP] Đã dọn ${n} mã đặt lại mật khẩu hết hạn`);
};

const startJobs = () => {
  console.log(`📧 Email: chế độ ${mailer.mode() === 'smtp' ? 'SMTP (gửi thật)' : 'log (ghi ra thư mục mail-outbox, không gửi thật)'}`);
  cleanupOtp().catch(() => {});
  cron.schedule('*/10 * * * *', () => retryFailed().catch((e) => console.warn('[EMAIL] Lỗi gửi lại:', e.message)), { timezone: TZ, noOverlap: true, name: 'email-retry' });
  cron.schedule('0 3 * * *', () => cleanupOtp().catch((e) => console.warn('[OTP] Lỗi dọn mã:', e.message)), { timezone: TZ, noOverlap: true, name: 'otp-cleanup' });
};

module.exports = { queueEmail, resend, retryFailed, cleanupOtp, startJobs, TEMPLATES };
