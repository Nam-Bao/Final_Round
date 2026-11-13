require('dotenv').config(); // Nạp .env (JWT_SECRET, SEPAY_API_KEY, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
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
app.use('/stats', require('./routes/stats.route'));
app.use('/config', require('./routes/config.route')); // mốc thời gian chờ (đổi được qua .env khi demo)
app.use('/reports', require('./routes/report.route')); // Báo cáo doanh thu cho quản lý
app.use('/consultations', require('./routes/consultation.route')); // Tư vấn chuyên gia (thỉnh giảng)
app.use('/attendance', require('./routes/attendance.route')); // chấm công
app.use('/payroll', require('./routes/payroll.route')); // lương
app.use('/bank-transactions', require('./routes/bankTransaction.route')); // đối soát tiền vào
app.use('/follow-ups', require('./routes/followUp.route')); // CSKH gọi chăm sóc khách
app.use('/safety', require('./routes/safety.route')); // sàng lọc an toàn, cảnh báo chống chỉ định
app.use('/safety-rules', require('./routes/safetyRule.route')); // quản lý quy tắc: quản lý soạn -> bác sĩ xem xét -> quản lý duyệt
app.use('/tasks', require('./routes/task.route')); // việc đang chờ (chuông thông báo)

app.listen(PORT, async() => {
    console.log(`🚀 [Booking Service] đang chạy tại port ${PORT}`);
    try {
        await sequelize.authenticate();
        // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
        // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
        const alter = process.env.DB_SYNC_ALTER === 'true';
        if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
        // sync không thêm giá trị mới cho ENUM đã có => tự bổ sung trạng thái "khách không đến" cho DB cũ
        await sequelize.query(`DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Appointments_status') THEN
            ALTER TYPE "enum_Appointments_status" ADD VALUE IF NOT EXISTS 'NO_SHOW';
          END IF;
        END $$;`);
        await sequelize.sync({ alter });
        // sync thường không thêm cột vào bảng đã có => tự bổ sung cột mới cho DB cũ
        await sequelize.query('ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS "breakdown" JSONB');
        const added = await require('./models').addMissingColumns();
        if (added.length) console.log(`➕ Đã thêm cột mới: ${added.join(', ')}`);
        console.log('✅ Đã kết nối DB và tạo xong bảng phân hệ Booking!');
        await require('./utils/safetyRules').init(); // nạp quy tắc chống chỉ định (lần đầu: nạp bộ khởi tạo)
        // Mỗi phút dọn lịch giữ chỗ quá hạn chưa thanh toán (khách đóng tab, không quay lại)
        const { releaseExpiredHolds } = require('./controllers/appointment.controller.js');
        releaseExpiredHolds();
        setInterval(releaseExpiredHolds, 60 * 1000);
        // Lịch tư vấn: trả chỗ chưa cọc quá hạn + chốt vắng mặt khi phòng đã đóng
        const { runMaintenance } = require('./controllers/consultation.controller.js');
        runMaintenance();
        setInterval(runMaintenance, 60 * 1000);
        // Mỗi 5 phút ghi vắng các ca đã quá hạn giải trình mà không chấm công
        const { markAbsences } = require('./controllers/attendance.controller.js');
        markAbsences();
        setInterval(markAbsences, 5 * 60 * 1000);
    } catch (error) {
        console.error('❌ Lỗi DB Booking:', error.message);
    }
});