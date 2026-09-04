const express = require('express');
const { sequelize } = require('./models');
const categoryRoute = require('./routes/category.route.js');
const productRoute = require('./routes/product.route.js');

const app = express();
const PORT = 4003;

app.use(express.json());
app.use('/categories', categoryRoute);
app.use('/products', productRoute);

app.listen(PORT, async () => {
  console.log(`🚀 [Commerce Service] đang chạy tại port ${PORT}`);
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ Đã kết nối DB và tạo xong bảng phân hệ Commerce!');
  } catch (error) {
    console.error('❌ Lỗi DB Commerce:', error.message);
  }
});