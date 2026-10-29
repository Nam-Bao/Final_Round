// Nạp biến môi trường từ .env (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* không có file .env */ }
if (!process.env.JWT_SECRET) throw new Error("Thiếu JWT_SECRET trong file .env của service");

const express = require('express');
const cors = require('cors'); // Nhớ npm i cors nếu chưa cài
const { sequelize } = require('./models');

const categoryRoute = require('./routes/category.route.js');
const productRoute = require('./routes/product.route.js');
const promotionRoute = require('./routes/promotion.route.js');
const orderRoute = require('./routes/order.route.js');
const cartRoute = require('./routes/cart.route.js');
const reviewRoute = require('./routes/review.route.js');

const app = express();
// Gateway chuyển /api/commerce sang port 4003
const PORT = process.env.PORT || 4003;

// Middleware bắt buộc
app.use(cors());
app.use(express.json());

// 1. Mount đường dẫn có tiền tố chuẩn O2O Gateway (/api/commerce/...)
app.use('/api/commerce/categories', categoryRoute);
app.use('/api/commerce/products', productRoute);
app.use('/api/commerce/orders', orderRoute);
app.use('/api/commerce/carts', cartRoute);
app.use('/api/commerce/promotions', promotionRoute);
app.use('/api/commerce/reviews', reviewRoute);

// 2. Mount dự phòng đường dẫn ngắn (Direct Service Calls)
app.use('/categories', categoryRoute);
app.use('/products', productRoute);
app.use('/orders', orderRoute);
app.use('/carts', cartRoute);
app.use('/promotions', promotionRoute);
app.use('/reviews', reviewRoute);

app.listen(PORT, async() => {
    console.log(`🚀 [Commerce Service] đang chạy tại port ${PORT}`);
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        console.log('✅ Đã kết nối DB và cập nhật bảng phân hệ Commerce!');
    } catch (error) {
        console.error('❌ Lỗi DB Commerce:', error.message);
    }
});