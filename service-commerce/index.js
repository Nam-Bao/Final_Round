const express = require('express');
const cors = require('cors'); // Nhớ npm i cors nếu chưa cài
const { sequelize } = require('./models');

const categoryRoute = require('./routes/category.route.js');
const productRoute = require('./routes/product.route.js');
const promotionRoute = require('./routes/promotion.route.js');
const orderRoute = require('./routes/order.route.js');
const cartRoute = require('./routes/cart.route.js');

const app = express();
// Cho phép lấy PORT từ biến môi trường hoặc mặc định 4000 (để khớp với Gateway/Client)
const PORT = process.env.PORT || 4000;

// Middleware bắt buộc
app.use(cors());
app.use(express.json());

// 1. Mount đường dẫn có tiền tố chuẩn O2O Gateway (/api/commerce/...)
app.use('/api/commerce/categories', categoryRoute);
app.use('/api/commerce/products', productRoute);
app.use('/api/commerce/orders', orderRoute);
app.use('/api/commerce/carts', cartRoute);
app.use('/api/commerce/promotions', promotionRoute);

// 2. Mount dự phòng đường dẫn ngắn (Direct Service Calls)
app.use('/categories', categoryRoute);
app.use('/products', productRoute);
app.use('/orders', orderRoute);
app.use('/carts', cartRoute);
app.use('/promotions', promotionRoute);

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