const { sequelize, Cart, CartItem, Product, Order, OrderDetail, UserAddress, Promotion, SavedPromotion, PromotionUsage } = require('../models');

// API 1: Checkout Đơn hàng
exports.checkout = async (req, res) => {
  const { 
    customer_id, recipient_name, shipping_phone, shipping_address, 
    latitude, longitude, note, save_address_to_book, promotion_code, payment_method
  } = req.body;

  if (!customer_id || !recipient_name || !shipping_phone || !shipping_address) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin giao hàng bắt buộc' });
  }

  const validPaymentMethod = payment_method || 'COD';
  const t = await sequelize.transaction();

  try {
    const cart = await Cart.findOne({ where: { customer_id } });
    if (!cart) throw new Error('Không tìm thấy giỏ hàng');

    const cartItems = await CartItem.findAll({ 
      where: { cart_id: cart.id }, include: [{ model: Product, attributes: ['id', 'price', 'stock_quantity', 'name'] }]
    });

    if (cartItems.length === 0) throw new Error('Giỏ hàng trống');

    let total_amount = 0;
    const orderDetailsData = [];

    for (const item of cartItems) {
      if (item.Product.stock_quantity < item.quantity) {
        throw new Error(`Sản phẩm ${item.Product.name} không đủ số lượng`);
      }
      total_amount += item.Product.price * item.quantity;
      orderDetailsData.push({ product_id: item.Product.id, quantity: item.quantity, price: item.Product.price });
      
      // Trừ số lượng tồn kho
      await Product.decrement('stock_quantity', { by: item.quantity, where: { id: item.Product.id }, transaction: t });
    }

    // TÍNH VOUCHER & TĂNG LƯỢT DÙNG
    let discount_amount = 0;
    if (promotion_code) {
      const promo = await Promotion.findOne({ where: { code: promotion_code, status: 'ACTIVE' } });
      if (promo && total_amount >= promo.min_order_value) {
        
        // Cú chót: Kiểm tra lại xem có lách luật gọi API trực tiếp không
        const isUsed = await PromotionUsage.findOne({ where: { customer_id, promotion_id: promo.id } });
        if (isUsed) throw new Error('Bạn đã dùng mã này');

        discount_amount = promo.discount_type === 'PERCENTAGE' 
          ? Math.min((total_amount * promo.discount_value) / 100, promo.max_discount || Infinity)
          : promo.discount_value;
          
        await Promotion.increment('used_count', { by: 1, where: { id: promo.id }, transaction: t });
        
        // Gỡ mã khỏi ví voucher
        await SavedPromotion.destroy({ where: { customer_id, promotion_id: promo.id }, transaction: t });

        // LƯU LỊCH SỬ: Đánh dấu khách hàng này đã dùng mã
        await PromotionUsage.create({ customer_id, promotion_id: promo.id }, { transaction: t });
      }
    }

    // LƯU ĐỊA CHỈ: Bao gồm cả tọa độ thật
    if (save_address_to_book) {
      await UserAddress.create({ 
        customer_id, recipient_name, phone: shipping_phone, address: shipping_address, latitude, longitude
      }, { transaction: t });
    }

    // TẠO ORDER: Kèm phương thức thanh toán và tọa độ
    const newOrder = await Order.create({
      customer_id, recipient_name, shipping_phone, shipping_address, latitude, longitude,
      note, total_amount, discount_amount, status: 'UNPAID', payment_method: validPaymentMethod
    }, { transaction: t });

    const detailsWithOrderId = orderDetailsData.map(d => ({ ...d, order_id: newOrder.id }));
    await OrderDetail.bulkCreate(detailsWithOrderId, { transaction: t });
    await CartItem.destroy({ where: { cart_id: cart.id }, transaction: t });
    
    await t.commit();
    return res.status(201).json({ success: true, data: newOrder });

  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message || 'Lỗi thanh toán' });
  }
};

// THÊM MỚI: API Lấy sổ địa chỉ (Nhớ gắn vào routes/order.route.js: router.get('/addresses', orderController.getUserAddresses))
exports.getUserAddresses = async (req, res) => {
  const { customer_id } = req.query;
  try {
    const addresses = await UserAddress.findAll({ 
      where: { customer_id }, order: [['is_default', 'DESC'], ['createdAt', 'DESC']]
    });
    return res.status(200).json({ success: true, data: addresses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.addUserAddress = async (req, res) => {
  try {
    const newAddress = await UserAddress.create(req.body);
    return res.status(201).json({ success: true, data: newAddress });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUserAddress = async (req, res) => {
  try {
    const address = await UserAddress.findByPk(req.params.id);
    if (!address) return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });
    
    await address.update(req.body);
    return res.status(200).json({ success: true, data: address });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [SALE/ADMIN] Lấy toàn bộ danh sách đơn hàng
exports.getAllOrdersForAdmin = async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        {
          model: OrderDetail,
          include: [{ model: Product, attributes: ['id', 'name', 'price', 'image_url'] }]
        }
      ],
      order: [['createdAt', 'ASC']]
    });
    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [SALE/ADMIN] Cập nhật trạng thái đơn (Duyệt, Đang giao, Hoàn thành)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    
    await order.update({ status });
    return res.status(200).json({ success: true, data: order, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [SALE/ADMIN] Hủy đơn hàng và Hoàn lại tồn kho
exports.cancelOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderDetail }]
    });
    if (!order) throw new Error('Không tìm thấy đơn hàng');
    if (order.status === 'CANCELLED') throw new Error('Đơn hàng này đã bị hủy trước đó');

    // Cập nhật trạng thái hủy
    await order.update({ status: 'CANCELLED' }, { transaction: t });

    // Lặp qua chi tiết đơn và cộng lại tồn kho cho sản phẩm
    for (const detail of order.OrderDetails) {
      await Product.increment('stock_quantity', { 
        by: detail.quantity, 
        where: { id: detail.product_id }, 
        transaction: t 
      });
    }

    // Ghi chú: Để hoàn lại Voucher, bạn cần lưu promotion_id vào bảng Order lúc checkout. Tạm thời luồng này hoàn trả lại kho sản phẩm thành công.

    await t.commit();
    return res.status(200).json({ success: true, message: 'Hủy đơn và Hoàn lại tồn kho thành công!' });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};