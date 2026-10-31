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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', aiRoutes);

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db')
  .then(() => app.listen(4004, () => console.log('AI Service running on port 4004')))
  .catch(err => console.error('Database connection error:', err));1