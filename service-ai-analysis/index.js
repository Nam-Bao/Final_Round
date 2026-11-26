// Nạp .env TRƯỚC khi require routes: controller đọc process.env ngay lúc load module
// (trước đây dotenv chạy sau nên các biến như ROBOFLOW_BASE_URL, VISION_DAILY_CAP trong .env bị bỏ qua)
require('dotenv').config();
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const aiRoutes = require('./routes/aiAnalysis.route');

const app = express();
app.set('trust proxy', 'loopback'); // tin X-Forwarded-For từ gateway chạy cùng máy => req.ip là IP thật của khách
app.use(cors());
app.use(express.json({ limit: '1mb' })); // AI rà soát đơn nhận kèm danh mục sản phẩm
app.use(express.urlencoded({ extended: true }));

app.use('/', aiRoutes);

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db')
  .then(() => {
    const PORT = Number(process.env.PORT) || 4004;
    app.listen(PORT, () => console.log(`AI Service running on port ${PORT}`));
    require('./services/scanDeletion').startRetentionJob(); // xoá lượt soi quá hạn lưu 2 năm (SCAN_RETENTION_DAYS)
    require('./services/knowledge').start(); // nạp kho kiến thức RAG (chatbot, AI rà soát đơn), cập nhật định kỳ
  })
  .catch(err => console.error('Database connection error:', err));1