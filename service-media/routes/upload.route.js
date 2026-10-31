const express = require('express');
const multer = require('multer');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { optionalAuth } = require('../middlewares/auth.middleware.js');
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

// Khách vãng lai vẫn upload được (trang phân tích da AI là trang công khai) nhưng bị giới hạn chặt hơn
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 15, userMax: 100,
  message: 'Bạn đã tải lên quá nhiều ảnh, vui lòng thử lại sau ít phút'
});

// API Nhận file
router.post('/', optionalAuth, uploadLimiter, (req, res) => {
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

module.exports = router;