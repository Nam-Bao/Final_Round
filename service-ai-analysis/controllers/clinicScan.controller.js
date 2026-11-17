// Sàng lọc da AI cho ảnh CSKH chụp tại phòng khám.
// - Booking gọi bằng token hệ thống (sau khi CSKH lưu hồ sơ trước khám với khách đồng ý phân tích AI, hoặc bác sĩ bấm "Quét lại"),
//   booking đã kiểm tra lịch hẹn / bác sĩ / sự đồng ý.
// - 1 lịch hẹn = 1 lượt soi tại phòng khám. Quét lại: thay kết quả nếu bác sĩ chưa xác nhận; đã xác nhận thì cần force.
// - Không gọi Gemini (bác sĩ tư vấn trực tiếp), không trừ hạn mức soi web của khách; giới hạn riêng CLINIC_SCAN_DAILY_CAP lượt / ngày.
// - Giao luôn cho bác sĩ khám (hạn xác nhận như lượt web).
// - Lượt soi web chưa xác nhận của cùng hồ sơ trong 14 ngày trước => SUPERSEDED: rút khỏi danh sách chờ của bác sĩ,
//   khách vẫn thấy lượt web như cũ trong lịch sử.
const { AiAnalysis } = require('../models');
const ai = require('./aiAnalysis.controller');
const training = require('../services/training');
const { notify } = require('../utils/notify');

const DUE_HOURS = Number(process.env.SCAN_REVIEW_DUE_HOURS || 48);
const DAILY_CAP = Number(process.env.CLINIC_SCAN_DAILY_CAP || 60);
const SUPERSEDE_DAYS = 14;
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const bad = (res, status, message, code) => res.status(status).json({ success: false, code, message });

// [HỆ THỐNG] POST /analyses/clinic { appointment_id, patient_profile_id, customer_id, doctor_id, captured_by, consent: { at, by }, images: [{ url, angle }], force }
exports.scanClinic = async (req, res) => {
  const b = req.body || {};
  if (!isUuid(b.appointment_id) || !isUuid(b.patient_profile_id) || !b.customer_id) return bad(res, 400, 'Thiếu thông tin lịch hẹn');
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 3).map((im) => ({ url: String(im?.url || ''), angle: ai.ANGLES[im?.angle] ? im.angle : 'front' }));
  if (!images.length || images.some((im) => !ai.isAllowedUrl(im.url))) return bad(res, 400, 'Ảnh không hợp lệ');
  if (!b.consent?.at) return bad(res, 409, 'Khách chưa đồng ý cho phân tích ảnh bằng AI', 'NO_AI_CONSENT');

  const existing = await AiAnalysis.findOne({ appointment_id: b.appointment_id, source: 'clinic', status: 'success' });
  if (existing?.review?.status === 'CONFIRMED' && b.force !== true) {
    return bad(res, 409, 'Lượt soi tại phòng khám của buổi khám này đã được xác nhận. Quét lại sẽ tạo kết quả mới cần xác nhận lại.', 'ALREADY_CONFIRMED');
  }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (!existing && await AiAnalysis.countDocuments({ source: 'clinic', createdAt: { $gte: start } }) >= DAILY_CAP) {
    return bad(res, 429, `Đã dùng hết ${DAILY_CAP} lượt quét AI tại phòng khám hôm nay`, 'CLINIC_CAP');
  }

  try {
    const sent = images.map((im) => ai.optimizeUrl(im.url));
    const qualities = await ai.measureQualities(sent); // không chặn: ảnh tại quầy, bác sĩ tự đánh giá; lưu để biết ảnh nào kém
    const det = await ai.detectSession(sent);
    const now = new Date();
    const record = {
      ...ai.sessionRecord(images, det, qualities, null), // không gọi Gemini
      source: 'clinic', appointment_id: b.appointment_id, captured_by: b.captured_by || null,
      customer_id: String(b.customer_id), patient_profile_id: b.patient_profile_id,
      provider: 'Roboflow', status: 'success',
      assignment: { doctor_id: b.doctor_id || null, appointment_id: b.appointment_id, assigned_at: now, due_at: new Date(now.getTime() + DUE_HOURS * 3600000), assigned_by: 'system' },
    };
    let doc;
    if (existing) {
      if (existing.review?.status === 'CONFIRMED') existing.review_history.push({ at: now, by: 'rescan', review: existing.review.toObject(), corrected_metrics: existing.corrected_metrics });
      Object.assign(existing, record, { review: { status: 'PENDING' }, corrected_metrics: null, customer_seen_at: null });
      existing.markModified('parsed_metrics');
      existing.training = undefined;
      doc = await existing.save();
    } else {
      doc = await AiAnalysis.create({
        ...record,
        // Đồng ý phân tích AI do CSKH ghi nhận; dùng ảnh cải thiện AI: bác sĩ hỏi khách sau (mặc định không)
        consent: { version: 'counter', accepted_at: new Date(b.consent.at), source: 'counter', recorded_by: b.consent.by || null, allow_training: false },
      });
    }
    // Lượt web chưa xác nhận gần buổi khám: bác sĩ đã đánh giá bằng ảnh tại phòng khám => rút khỏi danh sách chờ
    const since = new Date(now.getTime() - SUPERSEDE_DAYS * 86400000);
    const sup = await AiAnalysis.updateMany(
      { patient_profile_id: b.patient_profile_id, status: 'success', source: { $ne: 'clinic' }, createdAt: { $gte: since }, 'review.status': { $nin: ['CONFIRMED', 'SUPERSEDED'] } },
      { $set: { 'review.status': 'SUPERSEDED', 'review.superseded_by': String(doc._id) } },
    );
    notify('skin-reviews');
    res.status(200).json({ success: true, data: { id: doc._id, superseded: sup.modifiedCount, severity: doc.parsed_metrics?.severity } });
  } catch (e) {
    console.error('[Quét tại phòng khám]', e.response?.data?.message || e.message);
    res.status(502).json({ success: false, message: 'Không quét được ảnh bằng AI, vui lòng thử lại' });
  }
};

// [BÁC SĨ / QUẢN LÝ] PUT /analyses/:id/training-consent { answer: 'YES' | 'NO' } — bác sĩ hỏi khách (lượt soi tại phòng khám)
// có cho dùng ảnh (làm mờ mắt, bỏ thông tin định danh) để cải thiện AI không
exports.recordTrainingConsent = async (req, res) => {
  try {
    const a = await AiAnalysis.findById(req.params.id).catch(() => null);
    if (!a || a.status !== 'success') return bad(res, 404, 'Không tìm thấy lượt soi');
    if (a.source !== 'clinic') return bad(res, 400, 'Lượt soi trên web: khách tự chọn khi soi, bác sĩ không đổi thay khách');
    if (!['YES', 'NO'].includes(req.body?.answer)) return bad(res, 400, 'Chọn khách đồng ý hoặc không đồng ý');
    if (a.consent?.withdrawn_at && req.body.answer === 'YES') return bad(res, 409, 'Khách đã rút lại đồng ý trên website');
    a.consent.training_answer = req.body.answer;
    a.consent.allow_training = req.body.answer === 'YES';
    a.consent.training_recorded_by = req.user.id;
    a.consent.training_recorded_at = new Date();
    if (a.review?.status === 'CONFIRMED') {
      const t = training.eligibility(a.toObject());
      a.training = { ...(a.training?.toObject?.() || a.training || {}), status: t.status, reason: t.reason, updated_at: new Date() };
    }
    await a.save();
    res.status(200).json({ success: true, message: req.body.answer === 'YES' ? 'Đã ghi nhận khách đồng ý dùng ảnh để cải thiện AI' : 'Đã ghi nhận khách không đồng ý', data: { consent: a.consent, training: a.training } });
  } catch (e) { res.status(500).json({ success: false, message: 'Lỗi server', error: e.message }); }
};
