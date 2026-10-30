const {
    sequelize,
    Cart,
    CartItem,
    Product,
    Order,
    OrderDetail,
    UserAddress
} = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { evaluatePromotion, redeemPromotion, PromotionError } = require('../utils/promotionRules');

// ==========================================
// GIAO HÀNG NHANH (GHN): tra địa chỉ + tính phí ship. Cấu hình GHN_TOKEN, GHN_SHOP_ID trong .env
// ==========================================
const GHN_API_URL = 'https://online-gateway.ghn.vn/shiip/public-api/master-data';
const GHN_FEE_URL = 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee';
// Kho gửi hàng của GlowSkin (mã GHN)
const GHN_FROM = { district_id: 1442, ward_code: '20102' };
const DEFAULT_WEIGHT = 200; // gram / sản phẩm khi chưa nhập trọng lượng
const PACKAGING_WEIGHT = 300; // gram vỏ hộp / thùng đóng gói (frontend cũng cộng như vậy khi hiện phí)

// Lỗi do dữ liệu khách nhập (trả 400 thay vì 500)
class CheckoutError extends Error {}

const ghnHeaders = () => ({ Token: process.env.GHN_TOKEN, ShopId: process.env.GHN_SHOP_ID, 'Content-Type': 'application/json' });

exports.getGHNProvince = async (req, res) => {
    try {
        const response = await axios.get(`${GHN_API_URL}/province`, { headers: ghnHeaders() });
        return res.status(200).json(response.data);
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy Tỉnh/Thành GHN' });
    }
};

exports.getGHNDistrict = async (req, res) => {
    try {
        const province_id = Number(req.query.province_id);
        if (!Number.isInteger(province_id)) return res.status(400).json({ success: false, message: 'Thiếu mã Tỉnh/Thành' });
        const response = await axios.get(`${GHN_API_URL}/district`, { headers: ghnHeaders(), params: { province_id } });
        return res.status(200).json(response.data);
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy Quận/Huyện GHN' });
    }
};

exports.getGHNWard = async (req, res) => {
    try {
        const district_id = Number(req.query.district_id);
        if (!Number.isInteger(district_id)) return res.status(400).json({ success: false, message: 'Thiếu mã Quận/Huyện' });
        const response = await axios.get(`${GHN_API_URL}/ward`, { headers: ghnHeaders(), params: { district_id } });
        return res.status(200).json(response.data);
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi lấy Phường/Xã GHN' });
    }
};

// Hỏi GHN phí ship thật (VNĐ). Dùng cho cả màn hình xem phí và lúc tạo đơn (server tự tính, không tin phí client gửi).
const quoteGHNFee = async ({ to_district_id, to_ward_code, weight, insurance_value }) => {
    const response = await axios.post(GHN_FEE_URL, {
        from_district_id: GHN_FROM.district_id,
        from_ward_code: GHN_FROM.ward_code,
        service_type_id: 2,
        to_district_id: Number(to_district_id),
        to_ward_code: String(to_ward_code),
        weight: Math.max(Number(weight) || DEFAULT_WEIGHT, 1),
        insurance_value: Math.max(Number(insurance_value) || 0, 0)
    }, { headers: ghnHeaders() });
    const fee = Number(response.data?.data?.total);
    if (!Number.isFinite(fee)) throw new Error('GHN không trả về phí vận chuyển');
    return { fee, raw: response.data };
};

exports.calculateGHNFee = async (req, res) => {
    try {
        const { to_district_id, to_ward_code, weight, insurance_value } = req.body;
        if (!to_district_id || !to_ward_code) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin địa chỉ nhận hàng (to_district_id, to_ward_code)' });
        }
        const { raw } = await quoteGHNFee({ to_district_id, to_ward_code, weight, insurance_value });
        return res.status(200).json(raw);
    } catch (error) {
        console.error('Lỗi tính phí GHN:', error.response?.data || error.message);
        return res.status(500).json({ success: false, message: 'Lỗi tính phí vận chuyển GHN' });
    }
};

// 1. API Checkout Đơn hàng (Xử lý an toàn Tồn kho & Đơn hàng)
exports.checkout = async(req, res) => {
    const customer_id = req.user.id;
    const {
        recipient_name,
        shipping_phone,
        shipping_address,
        latitude,
        longitude,
        note,
        save_address_to_book,
        promotion_code,
        payment_method,
        shipping_district_id, // mã Quận/Huyện GHN
        shipping_ward_code    // mã Phường/Xã GHN
    } = req.body;

    if (!recipient_name || !shipping_phone || !shipping_address) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin giao hàng bắt buộc' });
    }
    if (!['COD', 'VIETQR_SEPAY'].includes(payment_method || 'COD')) {
        return res.status(400).json({ success: false, message: 'Phương thức thanh toán không hợp lệ' });
    }

    const validPaymentMethod = payment_method || 'COD';
    const t = await sequelize.transaction();

    try {
        const cart = await Cart.findOne({ where: { customer_id } });
        if (!cart) throw new Error('Không tìm thấy giỏ hàng');

        const cartItems = await CartItem.findAll({
            where: { cart_id: cart.id },
            include: [{ model: Product, attributes: ['id', 'price', 'stock_quantity', 'name', 'weight'] }]
        });

        if (cartItems.length === 0) throw new Error('Giỏ hàng trống');

        let total_amount = 0;
        let total_weight = PACKAGING_WEIGHT;
        const orderDetailsData = [];

        for (const item of cartItems) {
            if ((item.Product.stock_quantity || 0) < item.quantity) {
                throw new Error(`Sản phẩm ${item.Product.name} không đủ số lượng trong kho`);
            }

            const weight = item.Product.weight || DEFAULT_WEIGHT;
            total_amount += item.Product.price * item.quantity;
            total_weight += weight * item.quantity;
            orderDetailsData.push({
                product_id: item.Product.id,
                quantity: item.quantity,
                price: item.Product.price,
                weight
            });

            await Product.decrement('stock_quantity', { by: item.quantity, where: { id: item.Product.id }, transaction: t });
        }

        // PHÍ SHIP: server tự hỏi GHN theo địa chỉ + trọng lượng thật, không dùng phí client gửi lên
        let shipping_fee = 0;
        if (shipping_district_id && shipping_ward_code) {
            try {
                ({ fee: shipping_fee } = await quoteGHNFee({
                    to_district_id: shipping_district_id,
                    to_ward_code: shipping_ward_code,
                    weight: total_weight,
                    insurance_value: total_amount
                }));
            } catch (err) {
                console.error('Lỗi tính phí GHN khi đặt hàng:', err.response?.data || err.message);
                throw new CheckoutError('Không tính được phí vận chuyển cho địa chỉ này, vui lòng kiểm tra lại địa chỉ');
            }
        }

        // TÍNH VOUCHER & GHI NHẬN LƯỢT DÙNG (mã không hợp lệ thì báo lỗi, không lặng lẽ bỏ qua)
        let discount_amount = 0;
        if (promotion_code) {
            const { promo, discount } = await evaluatePromotion({
                code: promotion_code,
                order_value: total_amount,
                scope_values: { PRODUCT: total_amount },
                customer_id,
                transaction: t
            });
            await redeemPromotion({ promo, customer_id, transaction: t });
            discount_amount = discount;
        }

        // LƯU ĐỊA CHỈ
        if (save_address_to_book) {
            await UserAddress.create({
                customer_id,
                recipient_name,
                phone: shipping_phone,
                address: shipping_address,
                shipping_district_id: shipping_district_id || null,
                shipping_ward_code: shipping_ward_code || null,
                latitude,
                longitude
            }, { transaction: t });
        }

        // TẠO ORDER
        const newOrder = await Order.create({
            customer_id,
            recipient_name,
            shipping_phone,
            shipping_address,
            shipping_district_id: shipping_district_id || null,
            shipping_ward_code: shipping_ward_code || null,
            shipping_fee,
            latitude,
            longitude,
            note,
            total_amount,
            discount_amount,
            status: 'UNPAID', // Chờ nhân viên bán hàng duyệt (luồng UNPAID -> PROCESSING -> SHIPPING -> COMPLETED)
            payment_method: validPaymentMethod
        }, { transaction: t });

        const detailsWithOrderId = orderDetailsData.map(d => ({...d, order_id: newOrder.id }));
        await OrderDetail.bulkCreate(detailsWithOrderId, { transaction: t });
        await CartItem.destroy({ where: { cart_id: cart.id }, transaction: t });

        await t.commit();
        return res.status(201).json({ success: true, data: newOrder });

    } catch (error) {
        await t.rollback();
        const status = error instanceof PromotionError || error instanceof CheckoutError ? 400 : 500;
        return res.status(status).json({ success: false, message: error.message || 'Lỗi thanh toán' });
    }
};

// 1b. [CSKH/ADMIN] Ghi đơn mỹ phẩm khách mua tại quầy theo đơn bác sĩ kê (gọi từ service-booking khi chốt sale).
// Tiền đã thu trong hóa đơn phòng khám nên đơn tạo ở trạng thái COMPLETED (khách nhận hàng ngay tại quầy).
// Mỗi lịch khám chỉ tạo 1 đơn: gọi lại trả về đơn cũ, không trừ kho lần nữa.
exports.createCounterOrder = async(req, res) => {
    const { customer_id, appointment_id, recipient_name, shipping_phone, payment_method } = req.body;
    // Gộp các dòng trùng sản phẩm, số lượng 1 - 20
    const qtyByProduct = {};
    (Array.isArray(req.body.items) ? req.body.items : []).forEach((item) => {
        const quantity = Math.min(Math.max(parseInt(item?.quantity, 10) || 0, 0), 20);
        if (item?.product_id && quantity > 0) qtyByProduct[item.product_id] = Math.min((qtyByProduct[item.product_id] || 0) + quantity, 20);
    });
    const productIds = Object.keys(qtyByProduct);

    if (!customer_id || !appointment_id || productIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Thiếu khách hàng, lịch khám hoặc sản phẩm' });
    }

    const existing = await Order.findOne({ where: { appointment_id } });
    if (existing) return res.status(200).json({ success: true, data: existing, duplicated: true });

    const t = await sequelize.transaction();
    try {
        const products = await Product.findAll({ where: { id: productIds }, transaction: t });
        if (products.length !== productIds.length) throw new Error('Có sản phẩm không tồn tại');

        let total_amount = 0;
        for (const product of products) {
            const quantity = qtyByProduct[product.id];
            // Trừ kho có điều kiện: chỉ trừ khi còn đủ, tránh tồn kho âm khi nhiều quầy bán cùng lúc
            const [updated] = await Product.update(
                { stock_quantity: sequelize.literal(`stock_quantity - ${quantity}`) },
                { where: { id: product.id, stock_quantity: { [Op.gte]: quantity } }, transaction: t }
            );
            if (!updated) throw new Error(`Sản phẩm ${product.name} không đủ hàng trong kho (còn ${product.stock_quantity || 0})`);
            total_amount += Number(product.price) * quantity;
        }

        const order = await Order.create({
            customer_id,
            appointment_id,
            consultant_id: req.user.id,
            recipient_name: recipient_name || 'Khách hàng',
            shipping_phone: shipping_phone || 'Không có',
            shipping_address: 'Nhận tại quầy phòng khám GlowSkin',
            note: 'Mua tại quầy theo đơn bác sĩ kê sau buổi khám',
            total_amount,
            discount_amount: 0,
            status: 'COMPLETED',
            payment_method: payment_method === 'VIETQR' ? 'VIETQR_SEPAY' : 'COD'
        }, { transaction: t });

        await OrderDetail.bulkCreate(products.map((product) => ({
            order_id: order.id,
            product_id: product.id,
            quantity: qtyByProduct[product.id],
            price: product.price
        })), { transaction: t });

        await t.commit();
        return res.status(201).json({ success: true, data: order });
    } catch (error) {
        await t.rollback();
        return res.status(400).json({ success: false, message: error.message || 'Không tạo được đơn tại quầy' });
    }
};

// 2. BỔ SUNG: API Lấy danh sách đơn hàng cho Khách hàng (Hiển thị Lịch Sử Đơn Hàng)
exports.getCustomerOrders = async(req, res) => {
    try {
        const customer_id = req.user.id;
        const orders = await Order.findAll({
            where: { customer_id },
            include: [{
                model: OrderDetail,
                include: [{ model: Product, attributes: ['id', 'name', 'price', 'image_url'] }]
            }],
            order: [
                ['createdAt', 'DESC']
            ]
        });

        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        console.error('[Lỗi getCustomerOrders]:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 3. API Lấy sổ địa chỉ khách hàng
exports.getUserAddresses = async(req, res) => {
    const customer_id = req.user.id;
    try {
        const addresses = await UserAddress.findAll({
            where: { customer_id },
            order: [
                ['is_default', 'DESC'],
                ['createdAt', 'DESC']
            ]
        });
        return res.status(200).json({ success: true, data: addresses });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 4. API Thêm địa chỉ mới
exports.addUserAddress = async(req, res) => {
    try {
        const { recipient_name, phone, address, latitude, longitude, is_default, shipping_district_id, shipping_ward_code } = req.body;
        const newAddress = await UserAddress.create({
            customer_id: req.user.id, recipient_name, phone, address, latitude, longitude, is_default, shipping_district_id, shipping_ward_code
        });
        return res.status(201).json({ success: true, data: newAddress });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 5. API Cập nhật địa chỉ
exports.updateUserAddress = async(req, res) => {
    try {
        const address = await UserAddress.findOne({ where: { id: req.params.id, customer_id: req.user.id } });
        if (!address) return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });

        const { recipient_name, phone, address: addressText, latitude, longitude, is_default, shipping_district_id, shipping_ward_code } = req.body;
        await address.update({ recipient_name, phone, address: addressText, latitude, longitude, is_default, shipping_district_id, shipping_ward_code });
        return res.status(200).json({ success: true, data: address });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 6. [SALE/ADMIN] Lấy toàn bộ danh sách đơn hàng
exports.getAllOrdersForAdmin = async(req, res) => {
    try {
        const orders = await Order.findAll({
            include: [{
                model: OrderDetail,
                include: [{ model: Product, attributes: ['id', 'name', 'price', 'image_url'] }]
            }],
            order: [
                ['createdAt', 'DESC']
            ]
        });
        return res.status(200).json({ success: true, data: orders });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 7. [SALE/ADMIN] Cập nhật trạng thái đơn hàng
exports.updateOrderStatus = async(req, res) => {
    try {
        const { status } = req.body;
        // Hủy đơn phải qua API cancel để hoàn kho
        if (!['UNPAID', 'PROCESSING', 'SHIPPING', 'COMPLETED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
        }
        const order = await Order.findByPk(req.params.id, {
            include: [{ model: OrderDetail, include: [{ model: Product }] }]
        });
        if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

        // Duyệt đơn giao hàng: tạo vận đơn GHN (chỉ đơn có địa chỉ GHN, chưa có mã vận đơn)
        if (status === 'PROCESSING' && !order.tracking_code && order.shipping_district_id && order.shipping_ward_code) {
            const items = order.OrderDetails.map(detail => ({
                name: detail.Product?.name || 'Sản phẩm GlowSkin',
                quantity: detail.quantity,
                price: Number(detail.price),
                weight: detail.weight || DEFAULT_WEIGHT
            }));
            const totalWeight = items.reduce((sum, item) => sum + item.weight * item.quantity, 0);
            // Chỉ thu hộ khi khách chọn COD
            const codAmount = order.payment_method === 'COD'
                ? Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0)
                : 0;

            try {
                const ghnRes = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create', {
                    from_name: 'GlowSkin Spa',
                    from_phone: '0909123456',
                    from_address: '123 Nguyễn Văn Bảo, Phường 4',
                    from_ward_code: GHN_FROM.ward_code,
                    from_district_id: GHN_FROM.district_id,
                    payment_type_id: 2,
                    note: order.note || 'Giao hàng trong giờ hành chính',
                    required_note: 'CHOXEMHANGKHONGTHU',
                    to_name: order.recipient_name,
                    to_phone: order.shipping_phone,
                    to_address: order.shipping_address,
                    to_ward_code: order.shipping_ward_code,
                    to_district_id: Number(order.shipping_district_id),
                    weight: totalWeight,
                    length: 15, width: 15, height: 10,
                    service_type_id: 2,
                    cod_amount: codAmount,
                    items
                }, { headers: ghnHeaders() });

                if (ghnRes.data?.code === 200) {
                    const trackingCode = ghnRes.data.data.order_code;
                    await order.update({ status, tracking_code: trackingCode });
                    return res.status(200).json({ success: true, data: order, message: `Tạo đơn GHN thành công! Mã vận đơn: ${trackingCode}` });
                }
                return res.status(400).json({ success: false, message: 'GHN không tạo được vận đơn: ' + (ghnRes.data?.message || 'không rõ lý do') });
            } catch (ghnError) {
                console.error('Lỗi đẩy đơn GHN:', ghnError.response?.data || ghnError.message);
                return res.status(400).json({ success: false, message: 'Lỗi từ GHN: ' + (ghnError.response?.data?.message || 'Sai thông tin địa chỉ/cấu hình') });
            }
        }

        await order.update({ status });
        return res.status(200).json({ success: true, data: order, message: 'Cập nhật trạng thái thành công' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 8. [SALE/ADMIN] Hủy đơn hàng và Hoàn lại tồn kho
exports.cancelOrder = async(req, res) => {
    const t = await sequelize.transaction();
    try {
        const order = await Order.findByPk(req.params.id, {
            include: [{ model: OrderDetail }]
        });
        if (!order) throw new Error('Không tìm thấy đơn hàng');
        if (order.status === 'CANCELLED') throw new Error('Đơn hàng này đã bị hủy trước đó');

        // Đơn đã có vận đơn GHN: hủy bên GHN trước, GHN từ chối (đang giao...) thì không hủy
        if (order.tracking_code) {
            try {
                const ghnCancelRes = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/switch-status/cancel',
                    { order_codes: [order.tracking_code] }, { headers: ghnHeaders() });
                if (ghnCancelRes.data?.code !== 200) {
                    throw new Error(ghnCancelRes.data?.message || 'GHN từ chối hủy đơn này (có thể đơn đang giao).');
                }
            } catch (ghnError) {
                console.error('Lỗi khi hủy đơn trên GHN:', ghnError.response?.data || ghnError.message);
                throw new Error(`Không thể hủy trên GHN: ${ghnError.response?.data?.message || ghnError.message || 'Lỗi kết nối GHN'}`);
            }
        }

        await order.update({ status: 'CANCELLED' }, { transaction: t });

        for (const detail of order.OrderDetails) {
            if (detail.product_id) {
                await Product.increment('stock_quantity', {
                    by: detail.quantity,
                    where: { id: detail.product_id },
                    transaction: t
                });
            }
        }

        await t.commit();
        return res.status(200).json({ success: true, message: 'Hủy đơn và Hoàn lại tồn kho thành công!' });
    } catch (error) {
        await t.rollback();
        return res.status(500).json({ success: false, message: error.message });
    }
};
// ==========================================
// [WEBHOOK] GHN cập nhật trạng thái giao hàng.
// Xác thực ở route: khoá GHN_WEBHOOK_SECRET (?token=... trong URL webhook khai báo với GHN) hoặc nhân viên bán hàng (giả lập).
// ==========================================
const GHN_STATUS_MAP = {
    ready_to_pick: 'PROCESSING', picking: 'PROCESSING',
    delivering: 'SHIPPING',
    delivered: 'COMPLETED',
    cancel: 'CANCELLED', returned: 'CANCELLED'
};

exports.ghnWebhook = async (req, res) => {
    try {
        const { OrderCode, Status } = req.body || {};
        if (!OrderCode || !Status) return res.status(400).json({ message: 'Thiếu thông tin vận đơn' });

        const order = await Order.findOne({ where: { tracking_code: String(OrderCode) } });
        if (!order) return res.status(200).json({ message: 'Bỏ qua, không phải đơn của hệ thống này' });

        const newStatus = GHN_STATUS_MAP[Status] || order.status;
        if (newStatus !== order.status && order.status !== 'CANCELLED') {
            await order.update({ status: newStatus });
            console.log(`[GHN WEBHOOK] Đơn ${order.id} -> ${newStatus}`);
        }
        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (error) {
        console.error('[GHN WEBHOOK] Lỗi xử lý:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Middleware xác thực webhook GHN (khoá bí mật hoặc nhân viên bán hàng đã đăng nhập)
exports.verifyGhnWebhook = (req, res, next) => {
    const secret = process.env.GHN_WEBHOOK_SECRET;
    const provided = req.query.token || req.header('X-Webhook-Token');
    if (secret && provided === secret) return next();

    const token = req.header('Authorization')?.split(' ')[1];
    if (token) {
        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            if (['SALES', 'ADMIN', 'GEN_MANAGER'].includes(user.role)) return next();
        } catch { /* token sai -> từ chối bên dưới */ }
    }
    return res.status(401).json({ success: false, message: 'Webhook không hợp lệ' });
};

// ==========================================
// [WEBHOOK] SePay báo chuyển khoản cho đơn mỹ phẩm (nội dung "SP <6 ký tự đầu mã đơn>").
// SePay gửi header Authorization: Apikey <SEPAY_API_KEY> (cùng khoá với service-booking).
// ==========================================
exports.sepayOrderWebhook = async (req, res) => {
    const apiKey = process.env.SEPAY_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, message: 'Webhook chưa được cấu hình' });
    if (req.header('Authorization') !== `Apikey ${apiKey}`) {
        return res.status(401).json({ success: false, message: 'Sai API key' });
    }

    try {
        const transferAmount = Number(req.body?.transferAmount);
        const content = String(req.body?.content || '');
        const match = content.match(/SP\s?([a-zA-Z0-9]{6})/i);
        if (transferAmount > 0 && match) {
            const shortId = match[1].toLowerCase();
            const pendingOrders = await Order.findAll({ where: { status: 'UNPAID', payment_method: 'VIETQR_SEPAY' } });
            const order = pendingOrders.find(o => o.id.toLowerCase().startsWith(shortId));
            if (order) {
                const amountToPay = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);
                if (transferAmount >= amountToPay) {
                    await order.update({ status: 'PROCESSING' });
                    console.log(`[SEPAY WEBHOOK] Đã nhận ${transferAmount} cho đơn mỹ phẩm ${order.id}`);
                }
            }
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[SEPAY WEBHOOK] Lỗi xử lý:', error.message);
        return res.status(200).json({ success: false, message: error.message });
    }
};

// [CUSTOMER] GET /orders/:id/check-payment — frontend hỏi định kỳ xem đơn đã được thanh toán chưa (chỉ đơn của chính mình)
exports.checkOrderPaymentStatus = async (req, res) => {
    try {
        const order = await Order.findOne({ where: { id: req.params.id, customer_id: req.user.id } });
        if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
        return res.status(200).json({ isPaid: order.status !== 'UNPAID', status: order.status });
    } catch (error) {
        return res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};
