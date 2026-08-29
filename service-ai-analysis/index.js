const express = require('express');
const mongoose = require('mongoose');
const models = require('./models'); // Chỉ import để Mongoose nhận diện Schema

const app = express();
const PORT = 4004;

app.use(express.json());

app.listen(PORT, async () => {
  console.log(`🚀 [AI Analysis & Medical Service] đang chạy tại port ${PORT}`);
  try {
    // Kết nối đến MongoDB qua Docker
    await mongoose.connect('mongodb://localhost:27017/medical_db');
    console.log('✅ Kết nối MongoDB THÀNH CÔNG! Collections đã sẵn sàng.');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error.message);
  }
});