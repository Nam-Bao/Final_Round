require('dotenv').config(); // Nạp .env (JWT_SECRET, SEPAY_API_KEY, GHN_*, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
const missingGhn = require('./utils/ghn').missingGhnConfig();
if (missingGhn.length) console.warn(`⚠️  Thiếu cấu hình GHN trong .env: ${missingGhn.join(', ')} => tính phí / tạo vận đơn sẽ lỗi`);
const express = require('express');
const cors = require('cors'); // Nhớ npm i cors nếu chưa cài
const { sequelize } = require('./models');

const categoryRoute = require('./routes/category.route.js');
const productRoute = require('./routes/product.route.js');
const promotionRoute = require('./routes/promotion.route.js');
const orderRoute = require('./routes/order.route.js');
const cartRoute = require('./routes/cart.route.js');
const reviewRoute = require('./routes/review.route.js');
const returnRoute = require('./routes/return.route.js');
const materialRoute = require('./routes/material.route.js');
const reportRoute = require('./routes/report.route.js');

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
app.use('/api/commerce/returns', returnRoute);
app.use('/api/commerce/materials', materialRoute);
app.use('/api/commerce/reports', reportRoute);

// 2. Mount dự phòng đường dẫn ngắn (Direct Service Calls)
app.use('/categories', categoryRoute);
app.use('/products', productRoute);
app.use('/orders', orderRoute);
app.use('/carts', cartRoute);
app.use('/promotions', promotionRoute);
app.use('/reviews', reviewRoute);
app.use('/returns', returnRoute);
app.use('/materials', materialRoute);
app.use('/reports', reportRoute);

app.listen(PORT, async() => {
    console.log(`🚀 [Commerce Service] đang chạy tại port ${PORT}`);
    try {
        await sequelize.authenticate();
        // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
        // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
        const alter = process.env.DB_SYNC_ALTER === 'true';
        if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
        await sequelize.sync({ alter });
        // sync thường không thêm cột vào bảng đã có => tự bổ sung cột mới cho DB cũ
        await sequelize.query('ALTER TABLE "ProductDetails" ADD COLUMN IF NOT EXISTS "is_prescription" BOOLEAN NOT NULL DEFAULT false');
        await sequelize.query('ALTER TABLE "ProductDetails" ADD COLUMN IF NOT EXISTS "sale_percent" INTEGER, ADD COLUMN IF NOT EXISTS "sale_start" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "sale_end" TIMESTAMPTZ');
        await sequelize.query('ALTER TABLE "InventoryRequests" ADD COLUMN IF NOT EXISTS "reference_type" VARCHAR(30), ADD COLUMN IF NOT EXISTS "reference_id" UUID, ADD COLUMN IF NOT EXISTS "decision_note" TEXT, ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "received_by" UUID');
        // Mỗi buổi trị liệu chỉ có 1 phiếu xuất vật tư (chặn trừ kho 2 lần khi bấm hoàn thành 2 lần cùng lúc)
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "inventory_requests_reference_unique" ON "InventoryRequests" ("type", "reference_type", "reference_id") WHERE "reference_id" IS NOT NULL');
        console.log('✅ Đã kết nối DB và cập nhật bảng phân hệ Commerce!');
    } catch (error) {
        console.error('❌ Lỗi DB Commerce:', error.message);
    }
});