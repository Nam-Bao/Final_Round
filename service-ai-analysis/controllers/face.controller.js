// Ảnh gốc khuôn mặt nhân viên + xác thực ảnh chấm công.
// 1. Nhân viên đồng ý xử lý dữ liệu khuôn mặt, chụp 3 ảnh (tải lên service-media ở chế độ riêng tư) => POST /faces/enroll
//    => server kiểm tra từng ảnh có đúng 1 khuôn mặt đủ lớn, 3 ảnh cùng 1 người => chờ quản lý duyệt.
// 2. Quản lý xem ảnh (link tải có hạn) và duyệt / yêu cầu chụp lại. Duyệt xong mới dùng để so.
// 3. Booking gửi ảnh chấm công (token hệ thống) => POST /faces/verify => MATCH / REVIEW / NO_MATCH / NO_FACE / MULTI_FACE / NO_REFERENCE.
// 4. Nghỉ việc / rút đồng ý => xoá ảnh + vector.
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { StaffFace } = require('../models');
const faceId = require('../services/faceId');
const { notify } = require('../utils/notify');

const MEDIA_URL = () => process.env.MEDIA_URL || 'http://localhost:4005';
const PHOTOS = 3;
const sysToken = () => jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
const isFaceId = (id) => typeof id === 'string' && /^O2O_Faces\/[\w-]{1,120}$/.test(id);
const fail = (res, e) => res.status(e.status || 500).json({ success: false, code: e.code, message: e.status ? e.message : 'Lỗi server', error: e.status ? undefined : e.message });
const bad = (status, message, code) => Object.assign(new Error(message), { status, code });
const ERR_TEXT = { NO_FACE: 'không thấy khuôn mặt', MULTI_FACE: 'có nhiều khuôn mặt', TOO_SMALL: 'khuôn mặt quá nhỏ, đưa mặt lại gần hơn' };

// Link tải có hạn của ảnh riêng tư (service-media ký)
const signUrls = async (ids) => {
  if (!ids.length) return {};
  const r = await axios.post(`${MEDIA_URL()}/upload/face/sign`, { public_ids: ids, ttl: 600 }, { headers: { Authorization: `Bearer ${sysToken()}` }, timeout: 10000 });
  return r.data.urls || {};
};
const deletePhotos = (ids) => (ids?.length
  ? axios.post(`${MEDIA_URL()}/upload/face/delete`, { public_ids: ids }, { headers: { Authorization: `Bearer ${sysToken()}` }, timeout: 15000 })
    .catch((e) => console.error('[Khuôn mặt] chưa xoá được ảnh:', e.message))
  : Promise.resolve());
const download = async (url) => Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 10 * 1024 * 1024 })).data);

const stateOf = (doc) => ({
  status: doc?.pending ? 'PENDING' : doc?.active ? 'APPROVED' : doc?.rejected_note ? 'REJECTED' : 'NONE',
  has_active: !!doc?.active, active_since: doc?.active?.reviewed_at || null,
  pending_since: doc?.pending?.submitted_at || null, rejected_note: doc?.pending ? null : doc?.rejected_note || null,
});

// [NHÂN VIÊN] GET /faces/me
exports.myFace = async (req, res) => {
  try { res.json({ success: true, data: stateOf(await StaffFace.findOne({ user_id: req.user.id }).lean()) }); } catch (e) { fail(res, e); }
};

// [NHÂN VIÊN] POST /faces/enroll { public_ids: [3 ảnh], consent: true }
exports.enroll = async (req, res) => {
  try {
    if (req.body?.consent !== true) throw bad(400, 'Cần đồng ý cho xử lý dữ liệu khuôn mặt để chấm công');
    const ids = [...new Set(Array.isArray(req.body?.public_ids) ? req.body.public_ids : [])].filter(isFaceId);
    if (ids.length !== PHOTOS) throw bad(400, `Cần đủ ${PHOTOS} ảnh khuôn mặt`);
    const urls = await signUrls(ids);
    const descriptors = [];
    for (const [i, id] of ids.entries()) {
      const f = await faceId.singleFace(await download(urls[id]));
      if (f.error) { await deletePhotos(ids); throw bad(400, `Ảnh ${i + 1}: ${ERR_TEXT[f.error]}. Vui lòng chụp lại`, f.error); }
      descriptors.push(f.descriptor);
    }
    const c = faceId.consistency(descriptors);
    if (!c.ok) { await deletePhotos(ids); throw bad(400, '3 ảnh không giống cùng một người (ánh sáng / góc chụp quá khác nhau). Vui lòng chụp lại', 'INCONSISTENT'); }
    const doc = await StaffFace.findOne({ user_id: req.user.id }) || new StaffFace({ user_id: req.user.id });
    if (doc.pending) await deletePhotos(doc.pending.photos); // gửi lại khi đang chờ duyệt: bỏ bộ cũ
    doc.pending = { photos: ids, descriptors, consistency: c.worst, submitted_at: new Date(), consent_at: new Date() };
    doc.rejected_note = undefined; doc.rejected_at = undefined;
    await doc.save();
    notify('attendance');
    res.json({ success: true, message: 'Đã gửi ảnh gốc khuôn mặt, chờ quản lý duyệt', data: stateOf(doc) });
  } catch (e) { fail(res, e); }
};

// [NHÂN VIÊN] DELETE /faces/me — rút lại đồng ý: xoá ảnh + vector (chấm công sau đó do quản lý xem ảnh như trước)
exports.revokeMine = async (req, res) => {
  try {
    const doc = await StaffFace.findOne({ user_id: req.user.id });
    if (doc) { await deletePhotos([...(doc.active?.photos || []), ...(doc.pending?.photos || [])]); await doc.deleteOne(); }
    res.json({ success: true, message: 'Đã xoá ảnh gốc khuôn mặt của bạn' });
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] GET /faces?status=pending|all — danh sách kèm link xem ảnh có hạn (10 phút)
exports.list = async (req, res) => {
  try {
    const q = req.query.status === 'all' ? {} : { pending: { $exists: true, $ne: null } };
    const rows = await StaffFace.find(q).sort({ updatedAt: -1 }).limit(200).lean();
    const ids = rows.flatMap((d) => [...(d.pending?.photos || []), ...(d.active?.photos || [])]);
    const urls = await signUrls(ids).catch(() => ({}));
    res.json({
      success: true,
      data: rows.map((d) => ({
        user_id: d.user_id, ...stateOf(d),
        pending: d.pending ? { photos: d.pending.photos.map((id) => urls[id]).filter(Boolean), submitted_at: d.pending.submitted_at, consistency: d.pending.consistency, similarity_to_active: d.active ? Math.round(Math.min(...d.pending.descriptors.map((x) => Math.min(...d.active.descriptors.map((y) => faceId.distance(x, y))))) * 1000) / 1000 : null } : null,
        active: d.active ? { photos: d.active.photos.map((id) => urls[id]).filter(Boolean), reviewed_at: d.active.reviewed_at } : null,
      })),
    });
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] POST /faces/:userId/review { approve, note } — duyệt: bộ chờ duyệt thành ảnh gốc (bỏ bộ cũ); từ chối: xoá bộ chờ duyệt
exports.review = async (req, res) => {
  try {
    const doc = await StaffFace.findOne({ user_id: req.params.userId });
    if (!doc?.pending) throw bad(404, 'Không có ảnh chờ duyệt');
    if (doc.user_id === req.user.id) throw bad(400, 'Không được tự duyệt ảnh của mình');
    if (req.body?.approve === true) {
      const old = doc.active?.photos || [];
      doc.active = { ...doc.pending.toObject(), reviewed_by: req.user.id, reviewed_at: new Date() };
      doc.pending = undefined;
      await doc.save();
      await deletePhotos(old);
      res.json({ success: true, message: 'Đã duyệt ảnh gốc khuôn mặt' });
    } else {
      const note = String(req.body?.note || '').trim();
      if (note.length < 5) throw bad(400, 'Ghi lý do yêu cầu chụp lại (ít nhất 5 ký tự)');
      const ids = doc.pending.photos;
      doc.pending = undefined; doc.rejected_note = note.slice(0, 300); doc.rejected_at = new Date();
      await doc.save();
      await deletePhotos(ids);
      res.json({ success: true, message: 'Đã yêu cầu nhân viên chụp lại' });
    }
    notify('attendance');
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] DELETE /faces/:userId — nhân viên nghỉ việc: xoá dữ liệu khuôn mặt
exports.remove = async (req, res) => {
  try {
    const doc = await StaffFace.findOne({ user_id: req.params.userId });
    if (doc) { await deletePhotos([...(doc.active?.photos || []), ...(doc.pending?.photos || [])]); await doc.deleteOne(); }
    res.json({ success: true, message: 'Đã xoá dữ liệu khuôn mặt' });
  } catch (e) { fail(res, e); }
};

// [QUẢN LÝ] GET /faces/:userId/reference — link xem ảnh gốc (đặt cạnh ảnh chấm công khi xác nhận)
exports.reference = async (req, res) => {
  try {
    const doc = await StaffFace.findOne({ user_id: req.params.userId }).lean();
    const urls = await signUrls(doc?.active?.photos || []);
    res.json({ success: true, data: { photos: (doc?.active?.photos || []).map((id) => urls[id]).filter(Boolean), reviewed_at: doc?.active?.reviewed_at || null } });
  } catch (e) { fail(res, e); }
};

// [HỆ THỐNG] POST /faces/verify { user_id, photo_url } — booking gọi khi nhân viên chấm công
exports.verify = async (req, res) => {
  try {
    const { user_id: userId, photo_url: url } = req.body || {};
    if (!userId || !/^https:\/\/res\.cloudinary\.com\//.test(String(url || ''))) throw bad(400, 'Thiếu thông tin');
    const doc = await StaffFace.findOne({ user_id: String(userId) }).lean();
    if (!doc?.active?.descriptors?.length) return res.json({ success: true, data: { status: 'NO_REFERENCE' } });
    const result = await faceId.compare(await download(url), doc.active.descriptors);
    if (result.status !== 'MATCH') notify('attendance');
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('[So khuôn mặt chấm công]', e.message);
    res.json({ success: true, data: { status: 'ERROR' } });
  }
};

exports.pendingCount = () => StaffFace.countDocuments({ pending: { $exists: true, $ne: null } });
