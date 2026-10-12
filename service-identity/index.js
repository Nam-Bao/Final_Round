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
const io = new Server(server, { cors: { origin: '*' } });

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