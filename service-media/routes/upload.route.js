const express = require('express');
const multer = require('multer');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { verifyToken, optionalAuth, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.middleware.js');

const router = express.Router();

// 1. Kiểm tra xem file .env có được load thành công không
console.log("Cloudinary Name:", process.env.CLOUDINARY_CLOUD_NAME ? "Đã load" : "Lỗi: Chưa load được .env");

// Cấu hình thông tin Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'O2O_Assets', 
    allowedFormats: ['jpg', 'png', 'jpeg', 'webp'],
  },
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }); // tối đa 5MB/ảnh

// Giới hạn số ảnh tải lên mỗi giờ để tránh lạm dụng dung lượng Cloudinary
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 15, userMax: 100,
  message: 'Bạn đã tải lên quá nhiều ảnh, vui lòng thử lại sau ít phút'
});

// Nhận 1 ảnh (field "image"), trả { url }
const handleImageUpload = (req, res) => {
  // Bọc hàm upload lại để bắt lỗi chi tiết từ Multer & Cloudinary
  const uploadImage = upload.single('image');

  uploadImage(req, res, function (err) {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Ảnh quá lớn, tối đa 5MB' });
    }
    if (err) {
      console.error("Lỗi từ Cloudinary/Multer:", err);
      // Trả về lỗi 500 kèm chi tiết lỗi thật sự để debug
      return res.status(500).json({ message: 'Lỗi cấu hình Cloudinary hoặc file', error: err.message });
    }

    // Nếu qua được bước trên mà vẫn không có req.file -> Do frontend gửi sai key
    if (!req.file) {
      console.error("Lỗi: req.file bị undefined");
      return res.status(400).json({ message: 'Không tìm thấy file ảnh từ Frontend gửi lên' });
    }
    
    // Thành công
    res.status(200).json({ url: req.file.path }); 
  });
};

// Video cho bài viết / banner: chỉ quản lý và bác sĩ, tối đa 50MB (video dài nên đăng YouTube rồi dán link)
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'O2O_Videos', resource_type: 'video', allowedFormats: ['mp4', 'webm', 'mov'] },
});
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 50 * 1024 * 1024 } });
const videoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 0, userMax: 20,
  message: 'Bạn đã tải lên quá nhiều video, vui lòng thử lại sau'
});

router.post('/video', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'DOCTOR'), videoLimiter, (req, res) => {
  uploadVideo.single('video')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Video quá lớn, tối đa 50MB' });
    if (err) {
      console.error('Lỗi tải video lên Cloudinary:', err);
      return res.status(500).json({ message: 'Không tải được video (chỉ nhận mp4, webm, mov)', error: err.message });
    }
    if (!req.file) return res.status(400).json({ message: 'Không tìm thấy file video' });
    res.status(200).json({ url: req.file.path });
  });
});

// API Nhận file — bắt buộc đăng nhập (khách và nhân viên) để tránh người lạ dùng Cloudinary
router.post('/', verifyToken, uploadLimiter, handleImageUpload);

// Ảnh cho trang quét da: khách chưa đăng nhập cũng được tải (được quét 1 lần) nhưng giới hạn chặt theo IP
const skinUploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, guestMax: 5, userMax: 30,
  message: 'Bạn đã tải lên quá nhiều ảnh hôm nay, vui lòng thử lại vào ngày mai'
});
router.post('/skin', optionalAuth, skinUploadLimiter, handleImageUpload);

// [KHÁCH / CSKH] POST /upload/chat (field "file") — tệp gửi trong chat CSKH: ảnh jpg/png/webp <= 5MB hoặc PDF <= 10MB.
// Trả { url, type: image | pdf, name, size }. Server chat (service-identity) chỉ nhận URL trong thư mục O2O_Chat.
const CHAT_TYPES = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'application/pdf': 'pdf' };
const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => (CHAT_TYPES[file.mimetype] === 'pdf'
    ? { folder: 'O2O_Chat', resource_type: 'raw', format: 'pdf' }
    : { folder: 'O2O_Chat', resource_type: 'image', allowedFormats: ['jpg', 'jpeg', 'png', 'webp'] }),
});
const uploadChat = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (CHAT_TYPES[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Chỉ gửi được ảnh (jpg, png, webp) hoặc tệp PDF'), { code: 'BAD_TYPE' }))),
});
const chatUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 0, userMax: 40,
  message: 'Bạn đã gửi quá nhiều tệp, vui lòng thử lại sau ít phút'
});
router.post('/chat', verifyToken, chatUploadLimiter, (req, res) => {
  uploadChat.single('file')(req, res, async (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Tệp quá lớn: ảnh tối đa 5MB, PDF tối đa 10MB' });
    if (err?.code === 'BAD_TYPE') return res.status(400).json({ message: err.message });
    if (err) { console.error('Lỗi tải tệp chat:', err.message); return res.status(500).json({ message: 'Không tải được tệp, vui lòng thử lại' }); }
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn tệp' });
    const type = CHAT_TYPES[req.file.mimetype];
    if (type === 'image' && req.file.size > 5 * 1024 * 1024) { // ảnh lớn hơn 5MB: xoá lại, báo khách
      cloudinary.uploader.destroy(req.file.filename, { resource_type: 'image' }).catch(() => {});
      return res.status(413).json({ message: 'Ảnh quá lớn, tối đa 5MB' });
    }
    const name = String(req.file.originalname || (type === 'pdf' ? 'tai-lieu.pdf' : 'anh.jpg')).slice(0, 120);
    res.status(200).json({ url: req.file.path, type, name, size: req.file.size });
  });
});

// ---------- Ảnh gốc khuôn mặt nhân viên (xác thực chấm công) ----------
// Dữ liệu sinh trắc học => lưu RIÊNG TƯ (Cloudinary type "authenticated": không có URL công khai).
// Xem ảnh chỉ qua link tải có hạn do service AI xin bằng token hệ thống (quản lý xem trên trang duyệt).
const FACE_STAFF_ROLES = ['DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN'];
const faceStorage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'O2O_Faces', type: 'authenticated', resource_type: 'image', allowedFormats: ['jpg', 'jpeg', 'png', 'webp'] },
});
const uploadFace = multer({ storage: faceStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const faceLimiter = rateLimit({ windowMs: 60 * 60 * 1000, guestMax: 0, userMax: 30, message: 'Bạn đã tải quá nhiều ảnh khuôn mặt, vui lòng thử lại sau' });
const isFaceId = (id) => typeof id === 'string' && /^O2O_Faces\/[\w-]{1,120}$/.test(id);
const systemOnly = (req, res, next) => {
  try {
    const payload = jwt.verify(String(req.header('Authorization') || '').replace(/^Bearer /, ''), process.env.JWT_SECRET);
    if (payload.sys !== true) return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch { return res.status(401).json({ message: 'Unauthorized' }); }
};

// [NHÂN VIÊN] POST /upload/face (field "image") => { public_id } (không trả URL)
router.post('/face', verifyToken, authorizeRoles(...FACE_STAFF_ROLES), faceLimiter, (req, res) => {
  uploadFace.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Ảnh quá lớn, tối đa 5MB' });
    if (err) { console.error('Lỗi tải ảnh khuôn mặt:', err.message); return res.status(500).json({ message: 'Không tải được ảnh, vui lòng thử lại' }); }
    if (!req.file) return res.status(400).json({ message: 'Chưa có ảnh' });
    res.status(200).json({ public_id: req.file.filename });
  });
});
// [HỆ THỐNG] POST /upload/face/sign { public_ids, ttl } => { urls: { id: link tải có hạn } } (mặc định 10 phút)
router.post('/face/sign', systemOnly, (req, res) => {
  const ids = (Array.isArray(req.body?.public_ids) ? req.body.public_ids : []).filter(isFaceId).slice(0, 50);
  const ttl = Math.min(3600, Math.max(60, Number(req.body?.ttl) || 600));
  const expires = Math.floor(Date.now() / 1000) + ttl;
  res.status(200).json({ urls: Object.fromEntries(ids.map((id) => [id, cloudinary.utils.private_download_url(id, 'jpg', { type: 'authenticated', resource_type: 'image', expires_at: expires })])) });
});
// [HỆ THỐNG] POST /upload/face/delete { public_ids }
router.post('/face/delete', systemOnly, async (req, res) => {
  const ids = (Array.isArray(req.body?.public_ids) ? req.body.public_ids : []).filter(isFaceId).slice(0, 50);
  if (!ids.length) return res.status(200).json({ deleted: 0 });
  try {
    const r = await cloudinary.api.delete_resources(ids, { type: 'authenticated', resource_type: 'image', invalidate: true });
    res.status(200).json({ deleted: Object.values(r.deleted || {}).filter((v) => v === 'deleted' || v === 'not_found').length });
  } catch (e) { res.status(502).json({ message: 'Không xoá được ảnh khuôn mặt', error: e.message }); }
});

// [HỆ THỐNG] POST /upload/skin/delete { urls } — service AI nhờ xoá ảnh soi da (khách bấm xoá / hết hạn lưu 2 năm),
// service identity nhờ xoá tệp chat hết hạn lưu. Chỉ nhận token hệ thống (ký bằng JWT_SECRET chung, { sys: true }),
// chỉ xoá tệp trong thư mục O2O_Assets / O2O_Chat của đúng tài khoản Cloudinary.
const DELETABLE_FOLDERS = ['O2O_Assets', 'O2O_Chat'];
// URL Cloudinary => { id, type } (type: image | raw). Tệp raw (PDF) giữ đuôi trong public_id, ảnh thì bỏ đuôi.
const publicIdOf = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname !== 'res.cloudinary.com') return null;
    const [, cloud, type, upload, ...rest] = u.pathname.split('/');
    if (cloud !== process.env.CLOUDINARY_CLOUD_NAME || upload !== 'upload' || !['image', 'raw'].includes(type)) return null;
    const i = rest.findIndex((seg) => DELETABLE_FOLDERS.includes(seg)); // bỏ phần biến đổi ảnh (w_1280,...) và phiên bản (v123)
    if (i < 0) return null;
    const id = decodeURIComponent(rest.slice(i).join('/'));
    return { id: type === 'raw' ? id : id.replace(/\.[a-z0-9]+$/i, ''), type };
  } catch { return null; }
};
router.post('/skin/delete', async (req, res) => {
  try {
    const payload = jwt.verify(String(req.header('Authorization') || '').replace(/^Bearer /, ''), process.env.JWT_SECRET);
    if (payload.sys !== true) return res.status(403).json({ message: 'Forbidden' });
  } catch { return res.status(401).json({ message: 'Unauthorized' }); }
  const items = (Array.isArray(req.body?.urls) ? req.body.urls : []).slice(0, 50).map(publicIdOf).filter(Boolean);
  if (!items.length) return res.status(200).json({ deleted: 0 });
  try {
    const result = {};
    for (const type of ['image', 'raw']) {
      const ids = [...new Set(items.filter((x) => x.type === type).map((x) => x.id))];
      if (ids.length) Object.assign(result, (await cloudinary.api.delete_resources(ids, { resource_type: type, invalidate: true })).deleted || {});
    }
    res.status(200).json({ deleted: Object.values(result).filter((v) => v === 'deleted' || v === 'not_found').length, result });
  } catch (e) {
    res.status(502).json({ message: 'Không xoá được ảnh trên Cloudinary', error: e.message });
  }
});

module.exports = router;