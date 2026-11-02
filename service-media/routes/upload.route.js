const express = require('express');
const multer = require('multer');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
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

// API Nhận file — bắt buộc đăng nhập (khách và nhân viên) để tránh người lạ dùng Cloudinary
router.post('/', verifyToken, uploadLimiter, (req, res) => {
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
});

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

module.exports = router;