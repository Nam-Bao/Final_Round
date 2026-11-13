require('dotenv').config(); // Nạp .env (JWT_SECRET, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
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
// Thông báo real-time cho trang quản trị (namespace /notify + POST /notify/emit cho các service)
require('./notify.socket.js')(io, app);
app.use('/auth', authRoute);
app.use('/profile', profileRoute);
app.use('/users', userRoute);
app.use('/hr', require('./routes/hr.route.js')); // hồ sơ nhân sự
app.use('/medical-records', medicalRecordRoutes);

server.listen(PORT, async () => {
  console.log(`🚀 [Identity & Socket] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    // sync thường không thêm giá trị mới cho ENUM đã có => tự bổ sung vai trò EXPERT cho DB cũ (DB mới sync tạo đủ)
    await sequelize.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') THEN
        ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'EXPERT';
      END IF;
    END $$;`);
    // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
    // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
    const alter = process.env.DB_SYNC_ALTER === 'true';
    if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
    await sequelize.sync({ alter });
  } catch (error) { console.error(error); }
});