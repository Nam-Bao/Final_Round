// Xoá lượt soi da: khách bấm xoá, hoặc hết hạn lưu (SCAN_RETENTION_DAYS, mặc định 730 ngày = 2 năm).
// - Xoá ảnh trên Cloudinary (nhờ service-media, token hệ thống) và mọi dữ liệu của lượt soi: ảnh, kết quả AI, xác nhận của bác sĩ,
//   thông tin người được soi. Bản dùng để cải thiện AI cũng bị gỡ: ảnh khuôn mặt (kể cả đã làm mờ mắt) vẫn là dữ liệu cá nhân.
// - Chỉ giữ "bia mộ" tối thiểu: customer_id + client_ip + thời điểm tạo (để hạn mức soi trong ngày vẫn đúng, xoá đi soi lại không được thêm lượt)
//   và tên file đã xuất vào bộ dữ liệu (để scripts/export_training.js liệt kê trong removed.json cho người giữ bộ dữ liệu xoá).
// - Bệnh án của buổi khám (service-booking) không bị ảnh hưởng.
const jwt = require('jsonwebtoken');
const { AiAnalysis } = require('../models');

const MEDIA_URL = process.env.MEDIA_URL || 'http://localhost:4005';
const RETENTION_DAYS = Number(process.env.SCAN_RETENTION_DAYS || 730);
const TOMBSTONE_DAYS = 30; // bia mộ không còn file đã xuất thì xoá hẳn sau 30 ngày

const urlsOf = (a) => [...new Set([a.image_url, ...(a.images || []).map((im) => im.url)].filter(Boolean))];

const deleteImages = async (urls) => {
  if (!urls.length) return;
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const res = await fetch(`${MEDIA_URL}/upload/skin/delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ urls }), signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw Object.assign(new Error('Không xoá được ảnh, vui lòng thử lại sau'), { status: 502 });
};

// Xoá 1 lượt soi (doc là document mongoose). reason: 'customer' | 'retention'
const scrub = async (doc, reason) => {
  // Ảnh chụp tại phòng khám thuộc hồ sơ khám (booking giữ URL) => chỉ xoá phần AI, không xoá ảnh trên Cloudinary
  if (doc.source !== 'clinic') await deleteImages(urlsOf(doc)); // xoá ảnh trước: lỗi thì giữ nguyên dữ liệu để thử lại
  const exported = doc.training?.export_file;
  await AiAnalysis.collection.updateOne({ _id: doc._id }, {
    $set: {
      status: 'deleted', deleted_at: new Date(), delete_reason: reason, 'consent.allow_training': false,
      ...(exported ? { training: { status: 'REMOVED', reason: reason === 'customer' ? 'Khách đã xoá lượt soi' : 'Hết hạn lưu', export_file: exported, updated_at: new Date() } } : {}),
    },
    $unset: {
      image_url: '', images: '', parsed_metrics: '', corrected_metrics: '', review: '', review_history: '', subject: '',
      patient_profile_id: '', assignment: '', customer_seen_at: '', error_message: '', ...(exported ? {} : { training: '' }),
    },
  });
};

// Chạy mỗi ngày: xoá lượt soi quá hạn lưu; dọn bia mộ cũ không còn cần
const runRetention = async () => {
  const before = new Date(Date.now() - RETENTION_DAYS * 86400000);
  const old = await AiAnalysis.find({ status: { $in: ['success', 'failed'] }, createdAt: { $lt: before } }).limit(500);
  let n = 0;
  for (const a of old) {
    try { await scrub(a, 'retention'); n++; } catch (e) { console.error('[Lưu trữ] chưa xoá được lượt soi quá hạn, thử lại lần sau:', e.message); break; }
  }
  const r = await AiAnalysis.deleteMany({ status: 'deleted', deleted_at: { $lt: new Date(Date.now() - TOMBSTONE_DAYS * 86400000) }, 'training.export_file': { $in: [null, ''] } });
  if (n || r.deletedCount) console.log(`[Lưu trữ] đã xoá ${n} lượt soi quá ${RETENTION_DAYS} ngày, dọn ${r.deletedCount} bản ghi đã xoá`);
};
const startRetentionJob = () => {
  const tick = () => runRetention().catch((e) => console.error('[Lưu trữ]', e.message));
  setTimeout(tick, 60 * 1000); // 1 phút sau khi khởi động, rồi mỗi 24 giờ
  setInterval(tick, 24 * 3600 * 1000).unref();
};

module.exports = { scrub, runRetention, startRetentionJob, RETENTION_DAYS };
