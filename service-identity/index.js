// Nạp biến môi trường từ .env (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* không có file .env */ }
if (!process.env.JWT_SECRET) throw new Error("Thiếu JWT_SECRET trong file .env của service");

const express = require('express');
const { sequelize } = require('./models');
const http = require('http'); // THÊM DÒNG NÀY
const { Server } = require('socket.io'); // THÊM DÒNG NÀY

// Import các Routes
const authRoute = require('./routes/auth.route.js');
const profileRoute = require('./routes/profile.route.js');
const userRoute = require('./routes/user.route.js');
const medicalRecordRoutes = require('./routes/medical-record.route.js');


const app = express();
const PORT = 4001;

// Khởi tạo HTTP Server và Socket.io
const server = http.createServer(app);
// Chỉ cho 2 frontend kết nối chat (cùng danh sách với CORS của gateway)
const io = new Server(server, { cors: { origin: ['http://localhost:3000', 'http://localhost:3001'] } });

// Kích hoạt bộ não xử lý Chat (Sẽ tạo ở file dưới)
require('./chat.socket.js')(io);

// Gắn Route vào ứng dụng
app.use(express.json());
app.use('/auth', authRoute);
app.use('/profile', profileRoute);
app.use('/users', userRoute);
app.use('/medical-records', medicalRecordRoutes);

server.listen(PORT, async () => {
  console.log(`🚀 [Identity & Socket] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    await sequelize.sync();
  } catch (error) { console.error(error); }
});