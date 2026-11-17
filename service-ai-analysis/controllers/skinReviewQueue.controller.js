// Xác nhận soi da làm sau: giao lượt soi cho bác sĩ khi hoàn tất khám mà chưa xác nhận, trang danh sách để bác sĩ nhập sau,
// số việc đang chờ (chuông), thống kê dữ liệu huấn luyện, khách rút lại đồng ý / được nhắc khi bác sĩ đã xem lại.
const axios = require('axios');
const { AiAnalysis } = require('../models');
const training = require('../services/training');
const { notify } = require('../utils/notify');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const DUE_HOURS = Number(process.env.SCAN_REVIEW_DUE_HOURS || 48); // hạn xác nhận sau khi khám
const MANAGERS = ['GEN_MANAGER', 'ADMIN'];
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const fail = (res, e) => res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Lỗi server', error: e.status ? undefined : e.message });
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pendingQ = { 'review.status': { $nin: ['CONFIRMED', 'SUPERSEDED'] } }; // SUPERSEDED: lượt web đã có ảnh tại phòng khám thay

// Tên / số điện thoại / quan hệ của hồ sơ người được soi (identity), lưu kèm để tìm kiếm
const fetchSubject = async (a, authorization) => {
  if (!a.patient_profile_id || !a.customer_id || a.customer_id === 'GUEST_ANALYSIS') return null;
  const r = await axios.get(`${GATEWAY}/api/identity/profile/patients/user/${a.customer_id}`, { headers: { Authorization: authorization }, timeout: 8000 }).catch(() => null);
  const p = (r?.data?.data || []).find((x) => x.id === a.patient_profile_id);
  return p ? { name: p.full_name, phone: p.phone || '', relationship: p.relationship || '' } : null;
};
exports.fetchSubject = fetchSubject;

// [BÁC SĨ] POST /analyses/profile/:profileId/assign { appointment_id } — booking gọi khi hoàn tất khám:
// lượt soi mới nhất của hồ sơ chưa xác nhận => giao cho bác sĩ này, hạn DUE_HOURS giờ. Gọi nhiều lần không sao.
exports.assignLatest = async (req, res) => {
  try {
    if (!isUuid(req.params.profileId)) return res.status(400).json({ success: false, message: 'Hồ sơ không hợp lệ' });
    const a = await AiAnalysis.findOne({ patient_profile_id: req.params.profileId, status: 'success' }).sort({ createdAt: -1 });
    if (!a || ['CONFIRMED', 'SUPERSEDED'].includes(a.review?.status)) return res.status(200).json({ success: true, data: { assigned: false } });
    if (a.assignment?.doctor_id && a.assignment.doctor_id !== req.user.id) {
      return res.status(200).json({ success: true, data: { assigned: false, doctor_id: a.assignment.doctor_id } }); // đã giao cho bác sĩ khác
    }
    const now = new Date();
    a.assignment = {
      doctor_id: req.user.id, appointment_id: isUuid(req.body.appointment_id) ? req.body.appointment_id : a.assignment?.appointment_id || null,
      assigned_at: a.assignment?.assigned_at || now, due_at: a.assignment?.due_at || new Date(now.getTime() + DUE_HOURS * 3600000), assigned_by: req.user.id,
    };
    if (!a.subject?.name) a.subject = (await fetchSubject(a, req.headers.authorization)) || a.subject;
    await a.save();
    notify('skin-reviews');
    res.status(200).json({ success: true, data: { assigned: true, id: a._id, due_at: a.assignment.due_at } });
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] PUT /analyses/:id/assign-to { doctor_id } — giao lại cho bác sĩ khác (bác sĩ nghỉ, quá hạn...)
exports.reassign = async (req, res) => {
  try {
    if (!isUuid(req.body.doctor_id)) return res.status(400).json({ success: false, message: 'Chọn bác sĩ' });
    const a = await AiAnalysis.findById(req.params.id).catch(() => null);
    if (!a || a.status !== 'success') return res.status(404).json({ success: false, message: 'Không tìm thấy lượt soi' });
    if (a.review?.status === 'CONFIRMED') return res.status(400).json({ success: false, message: 'Lượt soi đã được xác nhận' });
    const now = new Date();
    a.assignment = { ...(a.assignment?.toObject?.() || a.assignment || {}), doctor_id: req.body.doctor_id, assigned_at: a.assignment?.assigned_at || now, due_at: new Date(now.getTime() + DUE_HOURS * 3600000), assigned_by: req.user.id };
    await a.save();
    notify('skin-reviews');
    res.status(200).json({ success: true, message: 'Đã giao lại cho bác sĩ', data: { due_at: a.assignment.due_at } });
  } catch (e) { fail(res, e); }
};

// Phạm vi trang danh sách: bác sĩ thấy lượt được giao cho mình hoặc do mình xác nhận; quản lý thấy mọi lượt đã giao / đã xác nhận.
// (Lượt soi của khách chưa từng đến khám không nằm trong danh sách.)
const scopeOf = (user) => (MANAGERS.includes(user.role)
  ? { $or: [{ 'assignment.doctor_id': { $nin: [null, ''] } }, { 'review.status': 'CONFIRMED' }] }
  : { $or: [{ 'assignment.doctor_id': user.id }, { 'review.reviewed_by': user.id }] });

// [BÁC SĨ / QUẢN LÝ] GET /reviews?status=pending|overdue|confirmed|low_effort|all&from&to&date_field=scan|exam&q&doctor_id&page&page_size
exports.listReviews = async (req, res) => {
  try {
    const now = new Date();
    const and = [{ status: 'success' }, scopeOf(req.user)];
    const { from, to, q } = req.query;
    if (from || to) {
      const range = {};
      if (from) range.$gte = new Date(`${from}T00:00:00+07:00`);
      if (to) range.$lte = new Date(`${to}T23:59:59.999+07:00`);
      and.push(req.query.date_field === 'exam' ? { $or: [{ 'assignment.assigned_at': range }, { 'assignment.assigned_at': null, 'review.reviewed_at': range }] } : { createdAt: range });
    }
    if (q && String(q).trim()) {
      const re = new RegExp(escapeRe(String(q).trim().slice(0, 50)), 'i');
      and.push({ $or: [{ 'subject.name': re }, { 'subject.phone': re }] });
    }
    if (['web', 'clinic'].includes(req.query.source)) and.push({ source: req.query.source === 'web' ? { $ne: 'clinic' } : 'clinic' });
    if (MANAGERS.includes(req.user.role) && isUuid(req.query.doctor_id)) {
      and.push({ $or: [{ 'assignment.doctor_id': req.query.doctor_id }, { 'review.reviewed_by': req.query.doctor_id }] });
    }
    const base = { $and: and };
    const byStatus = {
      pending: { ...pendingQ, 'assignment.doctor_id': { $nin: [null, ''] } },
      overdue: { ...pendingQ, 'assignment.due_at': { $lt: now } },
      confirmed: { 'review.status': 'CONFIRMED' },
      low_effort: { 'review.status': 'CONFIRMED', 'review.low_effort': true },
    };
    const status = byStatus[req.query.status] ? req.query.status : 'all';
    const query = status === 'all' ? base : { $and: [...and, byStatus[status]] };
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(50, Math.max(5, Number(req.query.page_size) || 15));
    const sort = ['pending', 'overdue'].includes(status) ? { 'assignment.due_at': 1, createdAt: 1 } : { createdAt: -1 };
    const [rows, total, counts] = await Promise.all([
      AiAnalysis.find(query).sort(sort).skip((page - 1) * size).limit(size).lean(),
      AiAnalysis.countDocuments(query),
      Promise.all(['pending', 'overdue', 'confirmed'].map((k) => AiAnalysis.countDocuments({ $and: [...and, byStatus[k]] }))),
    ]);
    // Lượt soi cũ (trước khi có lưu kèm tên): bổ sung tên / SĐT từ identity một lần rồi lưu lại
    await Promise.all(rows.filter((a) => !a.subject?.name && a.patient_profile_id).map(async (a) => {
      const subject = await fetchSubject(a, req.headers.authorization);
      if (subject) { a.subject = subject; await AiAnalysis.updateOne({ _id: a._id }, { $set: { subject } }); }
    }));
    const { staffView } = require('./analysisReview.controller');
    res.status(200).json({
      success: true,
      data: rows.map((a) => ({
        ...staffView(a),
        customer_id: a.customer_id,
        subject: a.subject || null,
        assignment: a.assignment || null,
        overdue: !['CONFIRMED', 'SUPERSEDED'].includes(a.review?.status) && !!a.assignment?.due_at && new Date(a.assignment.due_at) < now,
        edits: (a.review_history || []).length,
        training: a.training || null,
      })),
      total, page, page_size: size,
      counts: { pending: counts[0], overdue: counts[1], confirmed: counts[2] },
      class_options: require('../services/analysisReview').CLASS_OPTIONS,
      severities: require('../services/analysisReview').SEVERITIES,
    });
  } catch (e) { fail(res, e); }
};

// GET /tasks/mine — số việc trên chuông / menu trang quản trị
exports.tasksMine = async (req, res) => {
  try {
    const task = (key, label, count) => ({ key, label, count, path: '/skin-reviews', topic: 'skin-reviews' });
    const data = [];
    if (req.user.role === 'DOCTOR') {
      data.push(task('skin-reviews', 'Lượt soi da cần bạn xác nhận', await AiAnalysis.countDocuments({ status: 'success', 'assignment.doctor_id': req.user.id, ...pendingQ })));
    }
    if (MANAGERS.includes(req.user.role)) {
      data.push(task('skin-reviews-overdue', 'Lượt soi da quá hạn xác nhận', await AiAnalysis.countDocuments({ status: 'success', ...pendingQ, 'assignment.due_at': { $lt: new Date() } })));
      data.push({ key: 'faces-pending', label: 'Ảnh gốc khuôn mặt nhân viên chờ duyệt', count: await require('./face.controller').pendingCount(), path: '/attendance-management', topic: 'attendance' });
    }
    res.status(200).json({ data });
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] GET /training/stats — dữ liệu huấn luyện: số lượt đủ nhãn / đã xuất / không dùng được (theo lý do)
exports.trainingStats = async (req, res) => {
  try {
    const rows = await AiAnalysis.aggregate([
      { $match: { status: { $in: ['success', 'deleted'] }, 'training.status': { $exists: true } } }, // kể cả lượt khách đã xoá (đã gỡ khỏi dữ liệu)
      { $group: { _id: { status: '$training.status', reason: '$training.reason' }, count: { $sum: 1 } } },
    ]);
    const by = (s) => rows.filter((r) => r._id.status === s).reduce((n, r) => n + r.count, 0);
    const reasons = {};
    rows.filter((r) => r._id.status === 'NOT_ELIGIBLE').forEach((r) => {
      const key = String(r._id.reason || '').replace(/ \(.*\)$/, ''); // gộp "Thiếu nhãn (...)"
      reasons[key] = (reasons[key] || 0) + r.count;
    });
    res.status(200).json({ success: true, data: { queued: by('QUEUED'), exported: by('EXPORTED'), removed: by('REMOVED'), not_eligible: by('NOT_ELIGIBLE'), reasons } });
  } catch (e) { fail(res, e); }
};

// [KHÁCH] PUT /analyses/consent/withdraw { id? } — rút lại đồng ý dùng ảnh để huấn luyện (1 lượt hoặc tất cả)
exports.withdrawConsent = async (req, res) => {
  try {
    const q = { customer_id: req.user.id, 'consent.allow_training': true };
    if (req.body?.id) q._id = req.body.id;
    const rows = await AiAnalysis.find(q).catch(() => []);
    const now = new Date();
    for (const a of rows) {
      a.consent.allow_training = false;
      a.consent.withdrawn_at = now;
      a.training = { ...(a.training?.toObject?.() || a.training || {}), status: 'REMOVED', reason: 'Khách đã rút lại đồng ý', updated_at: now };
      await a.save();
    }
    res.status(200).json({ success: true, message: rows.length ? `Đã rút lại đồng ý cho ${rows.length} lượt soi. Ảnh sẽ không được dùng để cải thiện AI.` : 'Không có lượt soi nào đang cho phép dùng ảnh', data: { count: rows.length } });
  } catch (e) { fail(res, e); }
};

// [KHÁCH] GET /analyses/mine/unseen — số lượt soi bác sĩ đã xem lại mà khách chưa xem
const unseenQ = (userId) => ({
  customer_id: userId, status: 'success', 'review.status': 'CONFIRMED',
  $or: [{ customer_seen_at: null }, { $expr: { $lt: ['$customer_seen_at', '$review.reviewed_at'] } }],
});
exports.unseenCount = async (req, res) => {
  try { res.status(200).json({ success: true, data: { count: await AiAnalysis.countDocuments(unseenQ(req.user.id)) } }); } catch (e) { fail(res, e); }
};
// [KHÁCH] POST /analyses/mine/seen — đã mở trang lịch sử soi da
exports.markSeen = async (req, res) => {
  try {
    await AiAnalysis.updateMany(unseenQ(req.user.id), { $set: { customer_seen_at: new Date() } });
    res.status(200).json({ success: true });
  } catch (e) { fail(res, e); }
};

// [KHÁCH] DELETE /analyses/:id — xoá lượt soi của mình: ảnh, kết quả, xác nhận của bác sĩ và bản dùng cải thiện AI (nếu có)
exports.deleteMine = async (req, res) => {
  try {
    const a = await AiAnalysis.findOne({ _id: req.params.id, customer_id: req.user.id, status: { $in: ['success', 'failed'] } }).catch(() => null);
    if (!a) return res.status(404).json({ success: false, message: 'Không tìm thấy lượt soi' });
    await require('../services/scanDeletion').scrub(a, 'customer');
    notify('skin-reviews');
    res.status(200).json({ success: true, message: a.source === 'clinic' ? 'Đã xoá kết quả AI của lượt soi. Ảnh chụp tại phòng khám vẫn được lưu trong hồ sơ khám.' : 'Đã xoá lượt soi và ảnh khỏi hệ thống' });
  } catch (e) { fail(res, e); }
};

// Xếp loại dữ liệu huấn luyện sau mỗi lần lưu xác nhận (gọi từ saveReview)
exports.applyTraining = (a) => {
  const t = training.eligibility(a.toObject ? a.toObject() : a);
  const prev = a.training?.toObject?.() || a.training || {};
  // Đã xuất mà bác sĩ sửa lại => xếp hàng xuất lại (bộ dữ liệu mới thay bản cũ)
  a.training = { ...prev, status: t.status, reason: t.reason, updated_at: new Date() };
};
