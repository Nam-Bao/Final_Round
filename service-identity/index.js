const express = require('express');
const { sequelize } = require('./models');

// Import các Routes
const authRoute = require('./routes/auth.route.js');
const profileRoute = require('./routes/profile.route.js');
const userRoute = require('./routes/user.route.js');

const app = express();
const PORT = 4001;

app.use(express.json());

// Gắn Route vào ứng dụng
app.use('/auth', authRoute);
app.use('/profile', profileRoute);
app.use('/users', userRoute);

app.listen(PORT, async () => {
  console.log(`🚀 [Identity Service] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ Kết nối PostgreSQL (identity_db) THÀNH CÔNG!');
  } catch (error) {
    console.error('❌ Lỗi DB:', error.message);
  }
});