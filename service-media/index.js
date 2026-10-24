const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');

const app = express();
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
    await sequelize.sync({ alter: true });
    console.log('✅ Đã kết nối media_db và đồng bộ bảng tin tức!');
  } catch (error) {
    console.error('❌ Lỗi DB Media:', error.message);
  }
});
