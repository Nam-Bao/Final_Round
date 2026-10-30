const { sequelize, Cart, CartItem, Product, Order, OrderDetail, UserAddress, Promotion, SavedPromotion, PromotionUsage } = require('../models');
const axios = require('axios');
require('dotenv').config();

const GHN_API_URL = 'https://online-gateway.ghn.vn/shiip/public-api/master-data';
const GHN_FEE_URL = 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee';

exports.getGHNProvince = async (req, res) => {
  try {
    const response = await axios.get(`${GHN_API_URL}/province`, {
      headers: { 'Token': process.env.GHN_TOKEN }
    });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi lấy Tỉnh/Thành GHN', details: error.response?.data });
  }
};

exports.getGHNDistrict = async (req, res) => {
  try {
    const { province_id } = req.query;
    const response = await axios.get(`${GHN_API_URL}/district`, {
      headers: { 'Token': process.env.GHN_TOKEN },
      params: { province_id }
    });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi lấy Quận/Huyện GHN' });
  }
};

exports.getGHNWard = async (req, res) => {
  try {
    const { district_id } = req.query;
    const response = await axios.get(`${GHN_API_URL}/ward`, {
      headers: { 'Token': process.env.GHN_TOKEN },
      params: { district_id }
    });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi lấy Phường/Xã GHN' });
  }
};

exports.calculateGHNFee = async (req, res) => {
  try {
    const { to_district_id, to_ward_code, weight, insurance_value } = req.body;
    
    // Validate
    if (!to_district_id || !to_ward_code) {
       return res.status(400).json({ success: false, message: 'Thiếu thông tin địa chỉ nhận hàng (to_district_id, to_ward_code)' });
    }

    const payload = {
      from_district_id: 1442, // Mã Gò Vấp (Ví dụ kho GlowSkin đặt tại Gò Vấp)
      from_ward_code: "20102", // Mã Phường 4
      service_type_id: 2, 
      to_district_id: Number(to_district_id),
      to_ward_code: String(to_ward_code),
      weight: Number(weight) || 200, 
      insurance_value: Number(insurance_value) || 0
    };

    const response = await axios.post(GHN_FEE_URL, payload, {
      headers: { 
         'Token': process.env.GHN_TOKEN, 
         'ShopId': process.env.GHN_SHOP_ID,
         'Content-Type': 'application/json' 
      }
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Lỗi tính phí GHN:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Lỗi tính phí vận chuyển GHN' });
  }
};

// API 1: Checkout Đơn hàng
exports.checkout = async (req, res) => {
  const { 
    customer_id, recipient_name, shipping_phone, shipping_address, 
    // Các trường mới phục vụ GHN (Thêm vào đây)
    shipping_district_id, shipping_ward_code, shipping_fee,
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
      where: { cart_id: cart.id }, include: [{ model: Product, attributes: ['id', 'price', 'stock_quantity', 'name', 'weight'] }]
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
        const isUsed = await PromotionUsage.findOne({ where: { customer_id, promotion_id: promo.id } });
        if (isUsed) throw new Error('Bạn đã dùng mã này');

        discount_amount = promo.discount_type === 'PERCENTAGE' 
          ? Math.min((total_amount * promo.discount_value) / 100, promo.max_discount || Infinity)
          : promo.discount_value;
          
        await Promotion.increment('used_count', { by: 1, where: { id: promo.id }, transaction: t });
        await SavedPromotion.destroy({ where: { customer_id, promotion_id: promo.id }, transaction: t });
        await PromotionUsage.create({ customer_id, promotion_id: promo.id }, { transaction: t });
      }
    }

    // LƯU ĐỊA CHỈ: Bao gồm cả tọa độ thật
    if (save_address_to_book) {
      await UserAddress.create({ 
        customer_id, recipient_name, phone: shipping_phone, address: shipping_address, latitude, longitude
      }, { transaction: t });
    }

    // TẠO ORDER: Kèm phương thức thanh toán, mã vùng và phí vận chuyển (NEW)
    const newOrder = await Order.create({
      customer_id, recipient_name, shipping_phone, shipping_address, 
      shipping_district_id, shipping_ward_code, shipping_fee, // TRƯỜNG DỮ LIỆU GHN MỚI
      latitude, longitude, note, total_amount, discount_amount, 
      status: 'UNPAID', payment_method: validPaymentMethod
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
    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderDetail, include: [{ model: Product }] }]
    });
    
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

    if (status === 'PROCESSING' && !order.tracking_code) {
      
      const GHN_TOKEN = process.env.GHN_TOKEN;
      const GHN_SHOP_ID = process.env.GHN_SHOP_ID;

      const items = order.OrderDetails.map(detail => ({
        name: detail.Product?.name || 'Sản phẩm GlowSkin',
        quantity: detail.quantity,
        price: Number(detail.price),
        weight: detail.weight || 200 // Sử dụng trọng lượng có trong OrderDetail
      }));

      // Bổ sung các thông số để truyền vào Payload GHN
      const totalWeight = items.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
      let codAmount = 0;
      // Chỉ thu hộ nếu phương thức thanh toán là COD (Tiền mặt)
      if (order.payment_method === 'COD') {
        codAmount = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);
      }
      const ghnPayload = {
        from_name: "GlowSkin Spa",
        from_phone: "0909123456",
        from_address: "123 Nguyễn Văn Bảo, Phường 4",
        from_ward_code: "20102",    
        from_district_id: 1442,     
        payment_type_id: 2,
        note: order.note || "Giao hàng trong giờ hành chính",
        required_note: "CHOXEMHANGKHONGTHU",
        to_name: order.recipient_name,
        to_phone: order.shipping_phone,
        to_address: order.shipping_address, // Nội dung text
        to_ward_code: order.shipping_ward_code, // Giá trị lưu từ database (chuẩn hóa GHN)
        to_district_id: Number(order.shipping_district_id), // Giá trị lưu từ database
        weight: totalWeight,
        length: 15, width: 15, height: 10, 
        service_type_id: 2, 
        cod_amount: codAmount,
        items: items
      };

      try {
        const ghnRes = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create', ghnPayload, {
          headers: { 'Content-Type': 'application/json', 'Token': GHN_TOKEN, 'ShopId': GHN_SHOP_ID }
        });

        if (ghnRes.data && ghnRes.data.code === 200) {
          const trackingCode = ghnRes.data.data.order_code;
          await order.update({ status, tracking_code: trackingCode });
          
          return res.status(200).json({ 
            success: true, data: order, 
            message: `Tạo đơn GHN thành công! Mã vận đơn: ${trackingCode}` 
          });
        }
      } catch (ghnError) {
        console.error("Lỗi đẩy đơn GHN:", ghnError.response?.data || ghnError.message);
        return res.status(400).json({ 
          success: false, 
          message: 'Lỗi từ GHN: ' + (ghnError.response?.data?.message || 'Sai thông tin địa chỉ/cấu hình') 
        });
      }
    }

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

    // NẾU ĐƠN HÀNG ĐÃ BẮN SANG GHN (CÓ MÃ VẬN ĐƠN), HỦY BÊN GHN TRƯỚC
    if (order.tracking_code) {
      const ghnCancelPayload = {
         order_codes: [order.tracking_code]
      };
      
      try {
         const ghnCancelRes = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/switch-status/cancel', ghnCancelPayload, {
            headers: {
               'Token': process.env.GHN_TOKEN,
               'ShopId': process.env.GHN_SHOP_ID,
               'Content-Type': 'application/json'
            }
         });
         
         if (ghnCancelRes.data && ghnCancelRes.data.code === 200) {
            console.log(`Đã hủy thành công mã vận đơn ${order.tracking_code} trên GHN`);
         } else {
            throw new Error(ghnCancelRes.data?.message || 'Hệ thống GHN từ chối hủy đơn này (Có thể do đơn đang giao).');
         }
      } catch (ghnError) {
         console.error("Lỗi khi hủy đơn trên GHN:", ghnError.response?.data || ghnError.message);
         throw new Error(`Không thể hủy trên GHN: ${ghnError.response?.data?.message || 'Lỗi kết nối ĐVVC GHN'}`);
      }
    }

    // Nếu thao tác hủy qua GHN êm xuôi -> Hủy trạng thái ở CSDL GlowSkin
    await order.update({ status: 'CANCELLED' }, { transaction: t });

    for (const detail of order.OrderDetails) {
      await Product.increment('stock_quantity', { 
        by: detail.quantity, 
        where: { id: detail.product_id }, 
        transaction: t 
      });
    }

    await t.commit();
    return res.status(200).json({ success: true, message: 'Đã hủy đơn hàng (và đồng bộ GHN nếu có) thành công!' });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// [WEBHOOK] ĐÓN DỮ LIỆU TỰ ĐỘNG TỪ GHN
// ==========================================
exports.ghnWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log('📦 [GHN WEBHOOK] Nhận dữ liệu:', payload);

    const { OrderCode, Status } = payload;
    if (!OrderCode || !Status) {
      return res.status(400).json({ message: 'Thiếu thông tin vận đơn' });
    }

    const order = await Order.findOne({ where: { tracking_code: OrderCode } });
    if (!order) {
      console.log(`⚠️ [GHN WEBHOOK] Không tìm thấy đơn hàng cho mã vận đơn: ${OrderCode}`);
      return res.status(200).json({ message: 'Bỏ qua, không phải đơn của hệ thống này' });
    }

    let newStatus = order.status;
    
    if (['ready_to_pick', 'picking'].includes(Status)) newStatus = 'PROCESSING';
    else if (['delivering'].includes(Status)) newStatus = 'SHIPPING';
    else if (['delivered'].includes(Status)) newStatus = 'COMPLETED';
    else if (['cancel', 'returned'].includes(Status)) newStatus = 'CANCELLED';

    if (newStatus !== order.status) {
      await order.update({ status: newStatus });
      console.log(`✅ [GHN WEBHOOK] Đã cập nhật đơn ${order.id} sang trạng thái ${newStatus}`);
    }

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ [GHN WEBHOOK] Lỗi xử lý:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// [WEBHOOK] SEPAY DÀNH CHO ĐƠN HÀNG THƯƠNG MẠI
// ==========================================
exports.sepayOrderWebhook = async (req, res) => {
  try {
    const { transferAmount, content } = req.body;
    if (transferAmount > 0 && content) {
      // Tìm cấu trúc "SP MãĐơnHàng" 
      const match = content.match(/SP\s?([a-zA-Z0-9]{6})/i); 
      if (match) {
        const shortId = match[1].toLowerCase();
        const pendingOrders = await Order.findAll({ where: { status: 'UNPAID', payment_method: 'VIETQR_SEPAY' } });
        const order = pendingOrders.find(o => o.id.toLowerCase().startsWith(shortId));

        if (order) {
           const amountToPay = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);
           
           if (transferAmount >= amountToPay) {
               order.status = 'PROCESSING'; 
               await order.save();
               console.log(`✅ [SEPAY WEBHOOK] Đã nhận thanh toán ${transferAmount} cho đơn hàng mua Mỹ phẩm ${order.id}`);
           }
        }
      }
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ [SEPAY WEBHOOK] Lỗi xử lý:', error.message);
    return res.status(200).json({ success: false, message: error.message }); 
  }
};

// API CHECK TRẠNG THÁI THANH TOÁN (Dành cho Polling ở Frontend)
exports.checkOrderPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    
    // Nếu trạng thái khác UNPAID nghĩa là đã nhận được tiền hoặc bị hủy
    const isPaid = order.status !== 'UNPAID';
    return res.status(200).json({ isPaid, status: order.status });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};