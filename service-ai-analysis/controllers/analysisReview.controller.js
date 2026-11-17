// Lịch sử soi da theo hồ sơ người khám + bác sĩ xác nhận / hiệu chỉnh kết quả AI
const axios = require('axios');
const { AiAnalysis } = require('../models');
const review = require('../services/analysisReview');
const { progressOf } = require('../services/progress');
const queue = require('./skinReviewQueue.controller');
const { notify } = require('../utils/notify');
const { sendEmail } = require('../utils/mail');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const fail = (res, e) => res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Lỗi server', error: e.status ? undefined : e.message });

// Hồ sơ người khám có thuộc tài khoản khách này không (identity)
const profileBelongs = async (profileId, customerId, authorization, isCustomer) => {
  if (!isUuid(profileId)) return false;
  const url = isCustomer
    ? `${GATEWAY}/api/identity/profile/patients`
    : `${GATEWAY}/api/identity/profile/patients/user/${customerId}`;
  const r = await axios.get(url, { headers: { Authorization: authorization } }).catch(() => null);
  return (r?.data?.data || []).some((p) => p.id === profileId);
};

const ANGLE_VI = { front: 'Chính diện', left: 'Má trái', right: 'Má phải' };
// Ảnh của lượt soi (bản ghi cũ chỉ có image_url + parsed_metrics.image_size)
const imagesOf = (a) => (a.images?.length ? a.images : [{ url: a.image_url, angle: 'front', image_size: a.parsed_metrics?.image_size }])
  .map((im) => ({ url: im.url, angle: im.angle, angle_name: ANGLE_VI[im.angle] || 'Chính diện', image_size: im.image_size, inflammatory_count: im.inflammatory_count }));

// Dữ liệu 1 lượt soi cho nhân viên: kết quả gốc AI (có độ tin cậy, số thứ tự vùng) + xác nhận + bản hiệu chỉnh
const staffView = (a) => ({
  id: a._id, created_at: a.createdAt, image_url: a.image_url, images: imagesOf(a), patient_profile_id: a.patient_profile_id,
  allow_training: !!a.consent?.allow_training,
  ai: { ...a.parsed_metrics, issues: (a.parsed_metrics?.issues || []).map((it, i) => ({ ...it, image_index: it.image_index || 0, index: i + 1 })), ai_summary: undefined },
  ai_summary: a.parsed_metrics?.ai_summary || null,
  review: ['CONFIRMED', 'SUPERSEDED'].includes(a.review?.status) ? a.review : { status: 'PENDING' },
  source: a.source || 'web', appointment_id: a.appointment_id || null,
  training_consent: { allow: !!a.consent?.allow_training, answer: a.consent?.training_answer || null, source: a.consent?.source || 'web', withdrawn_at: a.consent?.withdrawn_at || null },
  assignment: a.assignment?.doctor_id ? a.assignment : null,
  corrected: a.corrected_metrics || null,
});

// [NHÂN VIÊN] GET /analyses/profile/:profileId — toàn bộ lượt soi của 1 hồ sơ người khám (mới nhất trước)
exports.listByProfile = async (req, res) => {
  try {
    if (!isUuid(req.params.profileId)) return res.status(400).json({ success: false, message: 'Hồ sơ không hợp lệ' });
    const rows = await AiAnalysis.find({ patient_profile_id: req.params.profileId, status: 'success' }).sort({ createdAt: -1 }).limit(100).lean();
    const data = rows.map(staffView);
    const progress = progressOf(data.map((x) => ({ id: x.id, created_at: x.created_at, reviewed: x.review.status === 'CONFIRMED', result: x.review.status === 'CONFIRMED' && x.corrected ? x.corrected : x.ai })));
    res.status(200).json({ success: true, data, progress, class_options: review.CLASS_OPTIONS, severities: review.SEVERITIES });
  } catch (e) { fail(res, e); }
};

// [NHÂN VIÊN] GET /analyses/profile/:profileId/pending — lượt soi mới nhất đã được bác sĩ xác nhận chưa (booking kiểm tra khi hoàn tất khám)
exports.latestPending = async (req, res) => {
  try {
    if (!isUuid(req.params.profileId)) return res.status(400).json({ success: false, message: 'Hồ sơ không hợp lệ' });
    const latest = await AiAnalysis.findOne({ patient_profile_id: req.params.profileId, status: 'success' }).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: { latest_id: latest?._id || null, created_at: latest?.createdAt || null, pending: !!latest && !['CONFIRMED', 'SUPERSEDED'].includes(latest.review?.status) } });
  } catch (e) { fail(res, e); }
};

// [BÁC SĨ] PUT /analyses/:id/review { boxes, added_boxes, missed, groups, severity, note, opened_at, appointment_id }
exports.saveReview = async (req, res) => {
  try {
    const a = await AiAnalysis.findById(req.params.id).catch(() => null);
    if (!a || a.status !== 'success') return res.status(404).json({ success: false, message: 'Không tìm thấy lượt soi' });
    const wasConfirmed = a.review?.status === 'CONFIRMED';
    // Sửa kết quả đã xác nhận: chỉ bác sĩ đã xác nhận hoặc quản lý
    if (wasConfirmed && req.user.role === 'DOCTOR' && a.review.reviewed_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Chỉ bác sĩ đã xác nhận lượt soi này hoặc quản lý mới được sửa' });
    }
    const metrics = a.parsed_metrics?.toObject ? a.parsed_metrics.toObject() : a.parsed_metrics;
    const images = imagesOf(a);
    const r = review.validate(metrics, req.body, images);
    const openedAt = new Date(req.body.opened_at);
    const durationMs = Number.isNaN(openedAt.getTime()) ? null : Math.max(0, Date.now() - openedAt.getTime());
    if (wasConfirmed) { // giữ bản trước khi sửa
      a.review_history.push({ at: new Date(), by: req.user.id, review: a.review.toObject ? a.review.toObject() : a.review, corrected_metrics: a.corrected_metrics });
    }
    a.review = {
      // reviewed_by: bác sĩ xác nhận đầu tiên (giữ nguyên khi quản lý sửa để bác sĩ vẫn sửa tiếp được); last_edited_by: người sửa gần nhất
      ...r, status: 'CONFIRMED', reviewed_by: wasConfirmed ? a.review.reviewed_by : req.user.id, last_edited_by: req.user.id, reviewed_at: new Date(),
      appointment_id: isUuid(req.body.appointment_id) ? req.body.appointment_id : a.review?.appointment_id || a.assignment?.appointment_id || null,
      duration_ms: durationMs, low_effort: durationMs !== null && review.isLowEffort(r, durationMs),
    };
    a.corrected_metrics = review.corrected(metrics, r, images);
    a.markModified('corrected_metrics');
    if (!a.subject?.name) a.subject = (await queue.fetchSubject(a, req.headers.authorization)) || a.subject; // để tìm kiếm ở trang danh sách
    queue.applyTraining(a);  // xếp loại dữ liệu huấn luyện (đủ nhãn => chờ xuất)
    a.customer_seen_at = null; // nhắc khách: bác sĩ đã xem lại / cập nhật kết quả
    await a.save();
    notify('skin-reviews');
    // Lần xác nhận đầu: email báo khách vào xem (không gửi kết quả trong email). Sửa lại sau đó không gửi thêm.
    if (!wasConfirmed) sendEmail('SKIN_REVIEWED', a.customer_id, `SKIN_REVIEWED:${a._id}`, { analysis_id: String(a._id) });
    res.status(200).json({ success: true, message: 'Đã lưu xác nhận kết quả soi da', data: staffView(a.toObject()) });
  } catch (e) { fail(res, e); }
};

// [KHÁCH] GET /analyses/mine?profile_id= — lịch sử soi da: lượt đã được bác sĩ xác nhận thì trả bản hiệu chỉnh
// profile_id=none: các lượt soi chưa gắn hồ sơ (soi trước khi có chọn hồ sơ). Có profile_id thì kèm tiến triển của người đó.
exports.listMine = async (req, res) => {
  try {
    // Lượt soi tại phòng khám: khách chỉ thấy sau khi bác sĩ xác nhận
    const q = { customer_id: req.user.id, status: 'success', $or: [{ source: { $ne: 'clinic' } }, { 'review.status': 'CONFIRMED' }] };
    const pid = req.query.profile_id ? String(req.query.profile_id) : null;
    if (pid === 'none') q.patient_profile_id = { $in: [null, ''] };
    else if (pid) q.patient_profile_id = pid;
    const rows = await AiAnalysis.find(q).sort({ createdAt: -1 }).limit(100).lean();
    const data = rows.map((a) => {
        const confirmed = a.review?.status === 'CONFIRMED' && a.corrected_metrics;
        return {
          id: a._id, created_at: a.createdAt, image_url: a.image_url, images: imagesOf(a), patient_profile_id: a.patient_profile_id, source: a.source || 'web',
          reviewed: !!confirmed, reviewed_at: confirmed ? a.review.reviewed_at : null,
          unseen: !!confirmed && (!a.customer_seen_at || new Date(a.customer_seen_at) < new Date(a.review.reviewed_at)),
          allow_training: !!a.consent?.allow_training, consent_withdrawn_at: a.consent?.withdrawn_at || null,
          result: confirmed ? { ...a.corrected_metrics, ai_summary: a.parsed_metrics?.ai_summary } : a.parsed_metrics,
        };
      });
    res.status(200).json({ success: true, data, progress: pid ? progressOf(data) : null });
  } catch (e) { fail(res, e); }
};

exports.profileBelongs = profileBelongs;
exports.staffView = staffView;
