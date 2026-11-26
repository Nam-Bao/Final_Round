// Sổ y bạ đầy đủ của 1 hồ sơ người khám: gom dữ liệu đang nằm rải ở các service thành 1 dòng thời gian.
// Dùng cho màn "Tra cứu Sổ y bạ" của bác sĩ và làm đầu vào cho AI tóm tắt hồ sơ (service-ai-analysis).
//   - Lần khám (lịch khám đã khám xong): lý do khám, triệu chứng, chẩn đoán, ghi chú, đơn bác sĩ kê (kèm cách dùng),
//     mục khách mua khi chốt hóa đơn, hẹn tái khám, lý do bác sĩ vẫn kê khi có cảnh báo, cảnh báo AI rà soát
//   - Buổi dịch vụ / buổi liệu trình đã làm (ghi chú KTV, ảnh sau buổi), gói liệu trình (còn bao nhiêu buổi)
//   - Sàng lọc an toàn (lần khám gần nhất + khai khi mua tại quầy), lượt soi da AI (kết quả bác sĩ đã xác nhận)
//   - Hồ sơ "Bản thân": thêm tư vấn chuyên gia và đơn mỹ phẩm (kèm yêu cầu trả hàng) của tài khoản
// Quyền: quản lý / admin; bác sĩ chỉ xem hồ sơ đã từng có lịch khám với mình.
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  Appointment, PatientSafety, SafetyOverride, AiReviewLog, TreatmentSession, ServiceSession, CustomerPackage, TreatmentPackage,
  SpaService, Consultation,
} = require('../models');
const { FLAGS } = require('../utils/safetyRules');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const sysToken = () => jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '2m' });
const DONE = ['WAITING_FOR_SALE', 'COMPLETED'];
const flagLabels = (flags) => (flags || []).map((f) => FLAGS[f] || f);
const CONSULT_FIELD = { DERMATOLOGY: 'Da liễu', NUTRITION: 'Dinh dưỡng', COSMETICS: 'Mỹ phẩm' };
const ORDER_STATUS = {
  UNPAID: 'Chờ thanh toán', PAID: 'Đã thanh toán, chờ duyệt', CONFIRMED: 'Đã duyệt', PROCESSING: 'Đang đóng gói', SHIPPING: 'Đang giao',
  COMPLETED: 'Đã nhận', CANCELLED: 'Đã hủy', REFUND_PENDING: 'Chờ hoàn tiền', RETURN_REQUESTED: 'Đang yêu cầu hoàn trả',
};

const buildRecord = async (profileId, authorization) => {
  const headers = { Authorization: authorization };
  const appointments = await Appointment.findAll({ where: { patient_profile_id: profileId }, order: [['appointment_date', 'DESC'], ['appointment_time', 'DESC']], raw: true });
  const customerId = appointments[0]?.customer_id
    || (await TreatmentSession.findOne({ where: { patient_profile_id: profileId }, include: [{ model: CustomerPackage }], raw: true, nest: true }))?.CustomerPackage?.customer_id
    || (await ServiceSession.findOne({ where: { patient_profile_id: profileId }, attributes: ['customer_id'], raw: true }))?.customer_id;
  const examIds = appointments.filter((a) => DONE.includes(a.status)).map((a) => a.id);

  const [profiles, products, people, safety, overrides, aiLogs, tSessions, sSessions, services, analyses] = await Promise.all([
    customerId ? axios.get(`${GATEWAY}/api/identity/profile/patients/user/${customerId}`, { headers, timeout: 8000 }).then((r) => r.data.data || []).catch(() => []) : [],
    axios.get(`${GATEWAY}/api/commerce/products`, { timeout: 8000 }).then((r) => r.data.data || []).catch(() => []),
    Promise.all([
      axios.get(`${GATEWAY}/api/identity/users/doctors/public`, { timeout: 8000 }).then((r) => r.data.data || []).catch(() => []),
      axios.get(`${GATEWAY}/api/identity/users/experts/public`, { timeout: 8000 }).then((r) => r.data.data || []).catch(() => []),
    ]).then(([d, e]) => [...d, ...e]),
    PatientSafety.findByPk(profileId, { raw: true }),
    examIds.length ? SafetyOverride.findAll({ where: { appointment_id: examIds }, raw: true }) : [],
    examIds.length ? AiReviewLog.findAll({ where: { appointment_id: examIds }, order: [['createdAt', 'DESC']], raw: true }) : [],
    TreatmentSession.findAll({ where: { patient_profile_id: profileId, status: 'COMPLETED' }, include: [{ model: CustomerPackage, include: [{ model: TreatmentPackage, attributes: ['name'] }] }], raw: true, nest: true }),
    ServiceSession.findAll({ where: { patient_profile_id: profileId, status: 'COMPLETED' }, include: [{ model: SpaService, attributes: ['name'] }], raw: true, nest: true }),
    SpaService.findAll({ attributes: ['id', 'name'], raw: true }),
    axios.get(`${GATEWAY}/api/ai/analyses/profile/${profileId}`, { headers, timeout: 10000 }).then((r) => r.data.data || []).catch(() => []),
  ]);
  const profile = profiles.find((p) => p.id === profileId) || null;
  const isSelf = !profile || profile.relationship === 'Bản thân';
  const productName = (id) => products.find((p) => p.id === id)?.name || 'Sản phẩm';
  const personName = (id) => { const p = people.find((x) => x.id === id); return p ? `${p.title ? `${p.title} ` : ''}${p.full_name}` : null; };
  const serviceName = (id) => services.find((s) => s.id === id)?.name || 'Dịch vụ';
  const packageIds = [...new Set(appointments.flatMap((a) => [...(a.prescribed_packages || []), ...(a.doctor_prescription?.packages || [])]))];
  const packageRows = packageIds.length ? await TreatmentPackage.findAll({ where: { id: packageIds }, attributes: ['id', 'name'], raw: true }) : [];
  const packageName = (id) => packageRows.find((p) => p.id === id)?.name || 'Gói liệu trình';
  const meds = (list) => (list || []).map((m) => (typeof m === 'string' ? { product_id: m, quantity: 1 } : m))
    .map((m) => ({ name: productName(m.product_id), quantity: m.quantity || 1, usage: m.usage || null }));

  // Tư vấn chuyên gia + đơn mỹ phẩm thuộc tài khoản: chỉ gắn vào hồ sơ "Bản thân"
  const [consults, orders] = isSelf && customerId ? await Promise.all([
    Consultation.findAll({ where: { customer_id: customerId, status: { [Op.in]: ['COMPLETED', 'NO_SHOW', 'EXPERT_ABSENT'] } }, order: [['appointment_date', 'DESC']], raw: true }),
    axios.get(`${GATEWAY}/api/commerce/orders/internal/customer/${customerId}`, { headers: { Authorization: `Bearer ${sysToken()}` }, timeout: 8000 }).then((r) => r.data.data || []).catch(() => []),
  ]) : [[], []];

  const events = [];
  for (const a of appointments.filter((x) => DONE.includes(x.status))) {
    const rx = a.doctor_prescription || {};
    events.push({
      id: `kham-${a.id}`, type: 'EXAM', date: a.exam_started_at || `${a.appointment_date}T${a.appointment_time}`,
      title: `Khám ${a.type === 'FOLLOW_UP' ? '(tái khám)' : ''}`.trim(),
      doctor: personName(a.doctor_id), reason: a.pre_notes || null, symptoms: a.symptoms || null, diagnosis: a.diagnosis || null,
      notes: a.doctor_notes || null, follow_up_date: a.follow_up_date || null, images: a.pre_exam_images || [],
      prescribed: {
        medicines: meds(rx.medicines || a.prescribed_medicines),
        services: (rx.services || a.prescribed_services || []).map(serviceName),
        packages: (rx.packages || a.prescribed_packages || []).map(packageName),
      },
      // Mục khách thực mua khi chốt hóa đơn (có thể khác đơn bác sĩ kê)
      purchased: rx.medicines ? { medicines: meds(a.prescribed_medicines), services: (a.prescribed_services || []).map(serviceName), packages: (a.prescribed_packages || []).map(packageName) } : null,
      overrides: overrides.filter((o) => o.appointment_id === a.id).map((o) => ({ reason: o.reason, warnings: (o.warnings || []).map((w) => `${w.severity_label || w.severity}: ${w.item || ''} ${w.message || ''}`.trim()) })),
      ai_review: (aiLogs.find((l) => l.appointment_id === a.id)?.warnings || []).map((w) => `${w.severity_label || w.severity}: ${w.item} - ${w.message}`),
    });
  }
  for (const s of tSessions) {
    events.push({ id: `buoi-${s.id}`, type: 'TREATMENT', date: s.session_date, title: `Buổi ${s.session_number} gói ${s.CustomerPackage?.TreatmentPackage?.name || ''}`.trim(), note: s.technician_note || null, images: s.post_treatment_images || [] });
  }
  for (const s of sSessions) {
    events.push({ id: `dv-${s.id}`, type: 'SERVICE', date: s.session_date, title: `Dịch vụ ${s.SpaService?.name || ''}`.trim(), note: s.technician_note || null, images: s.post_treatment_images || [] });
  }
  for (const x of analyses) {
    const reviewed = x.review?.status === 'CONFIRMED' && x.corrected;
    const r = reviewed ? x.corrected : x.ai || {};
    events.push({
      id: `soida-${x.id}`, type: 'SKIN', date: x.created_at, title: `Soi da AI (${x.source === 'clinic' ? 'tại phòng khám' : 'khách tự soi'})`,
      reviewed: !!reviewed, severity: r.severity || null, inflammatory_count: r.inflammatory_count ?? null,
      groups: Array.isArray(r.groups) ? r.groups.filter((g) => g.present).map((g) => g.name || g.group) : Object.entries(r.groups || {}).filter(([, v]) => v).map(([k]) => k),
      note: x.review?.note || null,
    });
  }
  for (const c of consults) {
    events.push({
      id: `tuvan-${c.id}`, type: 'CONSULT', date: `${c.appointment_date}T${c.appointment_time || '00:00'}`, title: `Tư vấn chuyên gia ${CONSULT_FIELD[c.consult_field] || ''}`.trim(),
      expert: personName(c.expert_id), status: c.status, question: c.question || null,
      result: c.result ? { assessment: c.result.assessment, advice: c.result.advice, products: (c.result.products || []).map((p) => p.name) } : null,
      recommend_exam: !!c.recommend_exam,
    });
  }
  for (const o of orders) {
    events.push({
      id: `don-${o.id}`, type: 'ORDER', date: o.created_at, title: `Đơn mỹ phẩm ${o.channel === 'COUNTER' ? 'tại quầy' : 'online'}`,
      status: ORDER_STATUS[o.status] || o.status, items: o.items, returns: o.returns,
    });
  }
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Gói liệu trình của các buổi đã làm
  const pkgIds = [...new Set(tSessions.map((s) => s.customer_package_id))];
  const packages = pkgIds.length ? (await CustomerPackage.findAll({ where: { id: pkgIds }, include: [{ model: TreatmentPackage, attributes: ['name'] }], raw: true, nest: true }))
    .map((p) => ({ name: p.TreatmentPackage?.name, total: p.total_sessions, remaining: p.remaining_sessions, status: p.status })) : [];
  const upcoming = appointments.find((a) => !DONE.includes(a.status) && !['CANCELLED', 'NO_SHOW'].includes(a.status));
  return {
    profile: profile ? { id: profile.id, full_name: profile.full_name, relationship: profile.relationship, gender: profile.gender, dob: profile.dob || profile.date_of_birth || null } : { id: profileId },
    customer_id: customerId || null,
    safety: {
      flags: flagLabels(safety?.flags), allergies: safety?.allergies || null, screened_at: safety?.screened_at || null,
      counter: safety?.counter_reported_at ? { flags: flagLabels(safety.counter_flags), allergies: safety.counter_allergies || null, at: safety.counter_reported_at } : null,
    },
    ai_summary_consent: safety?.ai_summary_consent ? { at: safety.ai_summary_consent_at } : null,
    packages,
    current_visit: upcoming ? { date: upcoming.appointment_date, time: upcoming.appointment_time, reason: upcoming.pre_notes || null, status: upcoming.status } : null,
    events,
  };
};

// [BÁC SĨ / QUẢN LÝ] GET /patient-record/:profileId
const getPatientRecord = async (req, res) => {
  try {
    const profileId = req.params.profileId;
    if (!isUuid(profileId)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    if (req.user.role === 'DOCTOR') {
      const mine = await Appointment.count({ where: { patient_profile_id: profileId, doctor_id: req.user.id } });
      if (!mine) return res.status(403).json({ message: 'Bạn chưa có lịch khám với hồ sơ này' });
    }
    res.status(200).json({ data: await buildRecord(profileId, req.headers.authorization) });
  } catch (error) { res.status(500).json({ message: 'Không tải được sổ y bạ', error: error.message }); }
};

module.exports = { getPatientRecord, buildRecord };
