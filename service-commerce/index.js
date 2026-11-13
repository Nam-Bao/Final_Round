require('dotenv').config(); // Nạp .env (JWT_SECRET, SEPAY_API_KEY, GHN_*, DB_*) trước khi load các module khác
if (!process.env.JWT_SECRET) throw new Error('Thiếu JWT_SECRET trong file .env của service');
const missingGhn = require('./utils/ghn').missingGhnConfig();
if (missingGhn.length) console.warn(`⚠️  Thiếu cấu hình GHN trong .env: ${missingGhn.join(', ')} => tính phí / tạo vận đơn sẽ lỗi`);
const express = require('express');
const cors = require('cors'); // Nhớ npm i cors nếu chưa cài
const { sequelize } = require('./models');
const { inferConcerns } = require('./utils/concerns');

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
app.use('/api/commerce/tasks', require('./routes/task.route.js')); // việc đang chờ (chuông thông báo)

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
app.use('/tasks', require('./routes/task.route.js'));

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
        await sequelize.query('ALTER TABLE "ProductDetails" ADD COLUMN IF NOT EXISTS "concerns" JSONB');
        await sequelize.query('ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "safety_screening" JSONB');
        // Sản phẩm cũ chưa có nhãn "Vấn đề da": gắn nhãn ban đầu theo tên / công dụng / thành phần (quản lý sửa lại được)
        const [untagged] = await sequelize.query('SELECT d.id, p.name, d.short_description, d.benefits, d.ingredients, d.skin_types FROM "ProductDetails" d JOIN "Products" p ON p.id = d.product_id WHERE d.concerns IS NULL');
        for (const row of untagged) {
            await sequelize.query('UPDATE "ProductDetails" SET concerns = :c WHERE id = :id', { replacements: { c: JSON.stringify(inferConcerns(row.name, row)), id: row.id } });
        }
        if (untagged.length) console.log(`🏷️  Đã gắn nhãn "Vấn đề da" ban đầu cho ${untagged.length} sản phẩm`);
        await sequelize.query(`ALTER TABLE "Promotions" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC'`);
        await sequelize.query('ALTER TABLE "PromotionUsages" ADD COLUMN IF NOT EXISTS "proof_url" TEXT, ADD COLUMN IF NOT EXISTS "applied_by" UUID, ADD COLUMN IF NOT EXISTS "applied_role" VARCHAR(20), ADD COLUMN IF NOT EXISTS "channel" VARCHAR(20), ADD COLUMN IF NOT EXISTS "reference_id" UUID, ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(12,2)');
        await sequelize.query('ALTER TABLE "ProductDetails" ADD COLUMN IF NOT EXISTS "sale_percent" INTEGER, ADD COLUMN IF NOT EXISTS "sale_start" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "sale_end" TIMESTAMPTZ');
        await sequelize.query('ALTER TABLE "InventoryRequests" ADD COLUMN IF NOT EXISTS "reference_type" VARCHAR(30), ADD COLUMN IF NOT EXISTS "reference_id" UUID, ADD COLUMN IF NOT EXISTS "decision_note" TEXT, ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "received_by" UUID, ADD COLUMN IF NOT EXISTS "receive_note" TEXT, ADD COLUMN IF NOT EXISTS "ordered_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "ordered_by" UUID, ADD COLUMN IF NOT EXISTS "supplier" VARCHAR(200), ADD COLUMN IF NOT EXISTS "expected_date" DATE');
        await sequelize.query('ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "promotion_id" UUID, ADD COLUMN IF NOT EXISTS "cancel_initiator" VARCHAR(20), ADD COLUMN IF NOT EXISTS "cancel_reason" VARCHAR(500), ADD COLUMN IF NOT EXISTS "cancelled_by" UUID, ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "cancel_review" VARCHAR(20), ADD COLUMN IF NOT EXISTS "refund_status" VARCHAR(20), ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(12,2), ADD COLUMN IF NOT EXISTS "refund_ref" VARCHAR(50), ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS "refunded_by" UUID');
        // Đơn VietQR quá hạn chưa trả tiền: tự hủy và nhả tồn kho
        const { releaseExpiredOrders } = require('./controllers/order.controller');
        const releaseOrders = () => releaseExpiredOrders().catch((e) => console.error('Lỗi tự hủy đơn quá hạn:', e.message));
        releaseOrders();
        setInterval(releaseOrders, 60 * 1000);
        // Mỗi buổi trị liệu chỉ có 1 phiếu xuất vật tư (chặn trừ kho 2 lần khi bấm hoàn thành 2 lần cùng lúc)
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "inventory_requests_reference_unique" ON "InventoryRequests" ("type", "reference_type", "reference_id") WHERE "reference_id" IS NOT NULL');
        console.log('✅ Đã kết nối DB và cập nhật bảng phân hệ Commerce!');
    } catch (error) {
        console.error('❌ Lỗi DB Commerce:', error.message);
    }
});