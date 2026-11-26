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
const purchasingRoute = require('./routes/purchasing.route.js');

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
app.use('/api/commerce/purchasing', purchasingRoute); // nhập hàng: nhà cung cấp, đơn đặt hàng, nhận hàng, kiểm kho
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
app.use('/purchasing', purchasingRoute);
app.use('/tasks', require('./routes/task.route.js'));

app.listen(PORT, async() => {
    console.log(`🚀 [Commerce Service] đang chạy tại port ${PORT}`);
    try {
        await sequelize.authenticate();
        // Mặc định chỉ tạo bảng còn thiếu. DB_SYNC_ALTER=true mới sửa cấu trúc bảng theo model —
        // chế độ này có thể XÓA cột không còn trong model, chỉ bật khi cần và nên backup DB trước.
        const alter = process.env.DB_SYNC_ALTER === 'true';
        if (alter) console.warn('⚠️  DB_SYNC_ALTER=true: đang cập nhật cấu trúc bảng theo model');
        // Điểm GlowSkin: trả đơn bằng điểm (payment_method = POINTS); khách tự hủy đơn chọn hoàn tiền thì lưu tài khoản nhận
        await sequelize.query(`DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Orders_payment_method') THEN
            ALTER TYPE "enum_Orders_payment_method" ADD VALUE IF NOT EXISTS 'POINTS';
          END IF;
        END $$;`);
        await sequelize.sync({ alter });
        // Nhập hàng theo lô (cột mới cho DB cũ): NSX / HSD theo lô, lô ghi nhà cung cấp / đơn đặt hàng / biên bản,
        // lô mỹ phẩm hết hạn tách khỏi hàng bán, dòng đơn ghi lô đã xuất
        await sequelize.query('ALTER TABLE "Products" ALTER COLUMN "start_date" DROP NOT NULL, ALTER COLUMN "end_date" DROP NOT NULL');
        await sequelize.query('ALTER TABLE "MaterialLots" ADD COLUMN IF NOT EXISTS "manufacture_date" DATE, ADD COLUMN IF NOT EXISTS "purchase_order_id" UUID, ADD COLUMN IF NOT EXISTS "receipt_id" UUID, ADD COLUMN IF NOT EXISTS "supplier_id" UUID, ADD COLUMN IF NOT EXISTS "hold_reason" VARCHAR(20), ADD COLUMN IF NOT EXISTS "hold_at" TIMESTAMPTZ');
        await sequelize.query('ALTER TABLE "OrderDetails" ADD COLUMN IF NOT EXISTS "lot_allocations" JSONB');
        await sequelize.query('ALTER TABLE "InventoryRequests" ADD COLUMN IF NOT EXISTS "self_approved" BOOLEAN DEFAULT false');
        // Đề xuất cũ đã ghi "đã đặt hàng" theo cách cũ mà chưa nhận hàng và chưa có đơn đặt hàng => về "đã duyệt, chưa đặt" để tạo đơn đặt hàng mới
        const [, legacy] = await sequelize.query(`UPDATE "InventoryRequests" r SET ordered_at = NULL, ordered_by = NULL WHERE r.type = 'PURCHASE_ORDER' AND r.status = 'APPROVED' AND r.ordered_at IS NOT NULL AND r.received_at IS NULL AND NOT EXISTS (SELECT 1 FROM "PurchaseOrders" p WHERE p.request_id = r.id)`);
        if (legacy?.rowCount) console.log(`🧾 ${legacy.rowCount} đề xuất cũ đã đặt hàng (cách cũ) chuyển về chờ tạo đơn đặt hàng`);
        await sequelize.query('ALTER TABLE "Orders" ADD COLUMN IF NOT EXISTS "points_used" INTEGER, ADD COLUMN IF NOT EXISTS "refund_account" VARCHAR(200)');
        // sync thường không thêm cột vào bảng đã có => tự bổ sung cột mới cho DB cũ
        await sequelize.query('ALTER TABLE "ProductDetails" ADD COLUMN IF NOT EXISTS "is_prescription" BOOLEAN NOT NULL DEFAULT false');
        // Đổi hàng / hàng khuyến mãi: yêu cầu cũ đều là hoàn tiền (REFUND); tài khoản ngân hàng chỉ bắt buộc khi hoàn tiền
        await sequelize.query('ALTER TABLE "OrderDetails" ADD COLUMN IF NOT EXISTS "is_sale" BOOLEAN NOT NULL DEFAULT false');
        await sequelize.query(`ALTER TABLE "OrderReturns" ADD COLUMN IF NOT EXISTS "resolution" VARCHAR(10) NOT NULL DEFAULT 'REFUND', ADD COLUMN IF NOT EXISTS "exchange_order_id" UUID,
          ALTER COLUMN "bank_name" DROP NOT NULL, ALTER COLUMN "bank_account" DROP NOT NULL, ALTER COLUMN "bank_holder" DROP NOT NULL`);
        await sequelize.query(`DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_OrderReturns_status') THEN
            ALTER TYPE "enum_OrderReturns_status" ADD VALUE IF NOT EXISTS 'EXCHANGED';
          END IF;
        END $$;`);
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
        // Mỹ phẩm có tồn kho chưa thuộc lô nào => lô tồn đầu kỳ; lô hết hạn tách khỏi hàng bán (mỗi giờ kiểm tra lại)
        const stockLots = require('./utils/stockLots');
        const opened = await stockLots.syncOpeningLots();
        if (opened) console.log(`📦 Đã tạo lô tồn đầu kỳ cho ${opened} mỹ phẩm (NSX / HSD lấy theo dữ liệu cũ của sản phẩm)`);
        const holdLots = () => stockLots.holdExpiredLots().then((n) => { if (n) console.log(`⏳ Đã tách ${n} lô mỹ phẩm hết hạn khỏi hàng bán`); }).catch((e) => console.error('Lỗi tách lô hết hạn:', e.message));
        holdLots();
        setInterval(holdLots, 60 * 60 * 1000);
        // Mỗi buổi trị liệu chỉ có 1 phiếu xuất vật tư (chặn trừ kho 2 lần khi bấm hoàn thành 2 lần cùng lúc)
        await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "inventory_requests_reference_unique" ON "InventoryRequests" ("type", "reference_type", "reference_id") WHERE "reference_id" IS NOT NULL');
        console.log('✅ Đã kết nối DB và cập nhật bảng phân hệ Commerce!');
    } catch (error) {
        console.error('❌ Lỗi DB Commerce:', error.message);
    }
});