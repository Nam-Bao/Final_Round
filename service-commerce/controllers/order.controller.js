const {
    sequelize,
    Cart,
    CartItem,
    Product,
    Order,
    OrderDetail,
    UserAddress
} = require('../models');
const { evaluatePromotion, redeemPromotion, PromotionError } = require('../utils/promotionRules');

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
        payment_method
    } = req.body;

    if (!recipient_name || !shipping_phone || !shipping_address) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin giao hàng bắt buộc' });
    }

    const validPaymentMethod = payment_method || 'COD';
    const t = await sequelize.transaction();

    try {
        const cart = await Cart.findOne({ where: { customer_id } });
        if (!cart) throw new Error('Không tìm thấy giỏ hàng');

        const cartItems = await CartItem.findAll({
            where: { cart_id: cart.id },
            include: [{ model: Product, attributes: ['id', 'price', 'stock_quantity', 'name'] }]
        });

        if (cartItems.length === 0) throw new Error('Giỏ hàng trống');

        let total_amount = 0;
        const orderDetailsData = [];

        for (const item of cartItems) {
            if ((item.Product.stock_quantity || 0) < item.quantity) {
                throw new Error(`Sản phẩm ${item.Product.name} không đủ số lượng trong kho`);
            }

            total_amount += item.Product.price * item.quantity;
            orderDetailsData.push({
                product_id: item.Product.id,
                quantity: item.quantity,
                price: item.Product.price
            });

            await Product.decrement('stock_quantity', { by: item.quantity, where: { id: item.Product.id }, transaction: t });
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
        const status = error instanceof PromotionError ? 400 : 500;
        return res.status(status).json({ success: false, message: error.message || 'Lỗi thanh toán' });
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
        const { recipient_name, phone, address, latitude, longitude, is_default } = req.body;
        const newAddress = await UserAddress.create({
            customer_id: req.user.id, recipient_name, phone, address, latitude, longitude, is_default
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

        const { recipient_name, phone, address: addressText, latitude, longitude, is_default } = req.body;
        await address.update({ recipient_name, phone, address: addressText, latitude, longitude, is_default });
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
        const order = await Order.findByPk(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

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