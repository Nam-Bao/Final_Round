const express = require('express');
const multer = require('multer');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

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
const upload = multer({ storage: storage });

// API Nhận file
router.post('/', (req, res) => {
  // Bọc hàm upload lại để bắt lỗi chi tiết từ Multer & Cloudinary
  const uploadImage = upload.single('image');

  uploadImage(req, res, function (err) {
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