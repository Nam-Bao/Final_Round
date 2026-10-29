// Nạp biến môi trường từ .env (Node >= 20.12)
try { process.loadEnvFile(); } catch { /* không có file .env */ }
if (!process.env.JWT_SECRET) throw new Error("Thiếu JWT_SECRET trong file .env của service");

const express = require('express');
const { sequelize } = require('./models');
const packageRoute = require('./routes/package.route.js');
const shiftRoute = require('./routes/shift.route.js');
const appointmentRoute = require('./routes/appointment.route.js');
const sessionRoute = require('./routes/session.route.js');
const spaServiceRoute = require('./routes/spaService.route.js');
const reviewRoutes = require('./routes/review.route');

const app = express();
const PORT = 4002;



app.use(express.json());
app.use('/packages', packageRoute);
app.use('/shifts', shiftRoute);
app.use('/appointments', appointmentRoute);
app.use('/sessions', sessionRoute);
app.use('/spa-services', spaServiceRoute);
app.use('/reviews', reviewRoutes);

app.listen(PORT, async() => {
    console.log(`🚀 [Booking Service] đang chạy tại port ${PORT}`);
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        console.log('✅ Đã kết nối DB và tạo xong bảng phân hệ Booking!');
    } catch (error) {
        console.error('❌ Lỗi DB Booking:', error.message);
    }
});