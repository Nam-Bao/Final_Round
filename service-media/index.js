require('dotenv').config(); // Nạp .env (JWT_SECRET, CLOUDINARY_*, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');

const app = express();
app.set('trust proxy', 'loopback'); // tin X-Forwarded-For từ gateway chạy cùng máy => req.ip là IP thật của khách
app.use(cors());
app.use(express.json());

const uploadRoutes = require('./routes/upload.route.js');
const newsRoutes = require('./routes/news.route.js');

app.use('/upload', uploadRoutes);
app.use('/news', newsRoutes);

const PORT = 4005;
app.listen(PORT, async () => {
  console.log(`📦 [Service Media] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
    // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
    const alter = process.env.DB_SYNC_ALTER === 'true';
    if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
    await sequelize.sync({ alter });
    console.log('✅ Đã kết nối media_db và đồng bộ bảng tin tức!');
  } catch (error) {
    console.error('❌ Lỗi DB Media:', error.message);
  }
});
