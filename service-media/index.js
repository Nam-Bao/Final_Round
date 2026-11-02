require('dotenv').config(); // Nạp .env (JWT_SECRET, CLOUDINARY_*, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
const express = require('express');
const cors = require('cors');
const { sequelize, syncSchema } = require('./models');

const app = express();
app.set('trust proxy', 'loopback'); // tin X-Forwarded-For từ gateway chạy cùng máy => req.ip là IP thật của khách
app.use(cors());
app.use(express.json());

const uploadRoutes = require('./routes/upload.route.js');
const newsRoutes = require('./routes/news.route.js');
const pageRoutes = require('./routes/page.route.js');

app.use('/upload', uploadRoutes);
app.use('/news', newsRoutes);
app.use('/pages', pageRoutes); // banner, popup

const PORT = Number(process.env.PORT) || 4005;
app.listen(PORT, async () => {
  console.log(`📦 [Service Media] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
    // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
    const alter = process.env.DB_SYNC_ALTER === 'true';
    if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
    if (alter) await sequelize.sync({ alter });
    // Tạo bảng còn thiếu + thêm cột mới vào bảng cũ (không xóa / sửa cột nào)
    const added = await syncSchema();
    if (added.length) console.log(`➕ Đã thêm cột mới: ${added.join(', ')}`);
    console.log('✅ Đã kết nối media_db và đồng bộ bảng tin tức, banner, popup!');
  } catch (error) {
    console.error('❌ Lỗi DB Media:', error.message);
  }
});
