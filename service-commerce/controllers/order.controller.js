const { sequelize, Cart, CartItem, Product, Order, OrderDetail, UserAddress, Promotion, SavedPromotion, PromotionUsage } = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');
require('dotenv').config();

const GHN_API_URL = 'https://online-gateway.ghn.vn/shiip/public-api/master-data';
const GHN_FEE_URL = 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee';

const DEFAULT_ITEM_WEIGHT = 200; // gram, dùng khi sản phẩm cũ chưa có cân nặng
const PACKAGING_WEIGHT = 300;    // gram, vỏ hộp/thùng carton (khớp với cách tính ở frontend)

// Gọi API tính phí của GHN. Dùng chung cho API báo giá và cho checkout (server tự tính, không tin phí client gửi lên)
const requestGHNFee = async ({ to_district_id, to_ward_code, weight, insurance_value }) => {
  const payload = {
    from_district_id: 1442, // Mã Gò Vấp (Ví dụ kho GlowSkin đặt tại Gò Vấp)
    from_ward_code: "20102", // Mã Phường 4
    service_type_id: 2,
    to_district_id: Number(to_district_id),
    to_ward_code: String(to_ward_code),
    weight: Number(weight) || DEFAULT_ITEM_WEIGHT,
    insurance_value: Number(insurance_value) || 0
  };

  const response = await axios.post(GHN_FEE_URL, payload, {
    headers: {
       'Token': process.env.GHN_TOKEN,
       'ShopId': process.env.GHN_SHOP_ID,
       'Content-Type': 'application/json'
    }
  });
  return response.data;
};

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

    const data = await requestGHNFee({ to_district_id, to_ward_code, weight, insurance_value });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Lỗi tính phí GHN:", error.response?.data || error.message);
    return res.status(500).json({ success: false, message: 'Lỗi tính phí vận chuyển GHN' });
  }
};

// API 1: Checkout Đơn hàng
exports.checkout = async (req, res) => {
  const customer_id = req.user.id; // Luôn là khách đang đăng nhập, không nhận customer_id từ body
  const {
    recipient_name, shipping_phone, shipping_address,
    // Các trường mới phục vụ GHN (Thêm vào đây)
    // shipping_fee KHÔNG lấy từ client: server tự hỏi GHN ở bên dưới
    shipping_district_id, shipping_ward_code,
    latitude, longitude, note, save_address_to_book, promotion_code, payment_method
  } = req.body;

  if (!customer_id || !recipient_name || !shipping_phone || !shipping_address) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin giao hàng bắt buộc' });
  }
  if (!shipping_district_id || !shipping_ward_code) {
    return res.status(400).json({ success: false, message: 'Thiếu mã Quận/Huyện hoặc Phường/Xã GHN, vui lòng cập nhật địa chỉ' });
  }

  const validPaymentMethod = ['COD', 'VIETQR_SEPAY'].includes(payment_method) ? payment_method : 'COD';

  // Đọc giỏ hàng và tính phí GHN TRƯỚC khi mở transaction, để không giữ khóa DB trong lúc chờ API bên ngoài
  let cart, cartItems, shipping_fee;
  try {
    cart = await Cart.findOne({ where: { customer_id } });
    if (!cart) return res.status(400).json({ success: false, message: 'Không tìm thấy giỏ hàng' });

    cartItems = await CartItem.findAll({
      where: { cart_id: cart.id }, include: [{ model: Product, attributes: ['id', 'price', 'stock_quantity', 'name', 'weight', 'type'] }]
    });
    if (cartItems.length === 0) return res.status(400).json({ success: false, message: 'Giỏ hàng trống' });
    // Giỏ cũ có thể còn vật tư nội bộ (thêm vào trước khi chặn) => không cho đặt
    const notForSale = cartItems.find(item => !item.Product || item.Product.type !== 'PRODUCT');
    if (notForSale) return res.status(400).json({ success: false, message: `Sản phẩm ${notForSale.Product?.name || ''} không còn bán, vui lòng xóa khỏi giỏ hàng` });

    const totalWeight = cartItems.reduce(
      (sum, item) => sum + item.quantity * (item.Product.weight || DEFAULT_ITEM_WEIGHT), PACKAGING_WEIGHT
    );
    const feeData = await requestGHNFee({ to_district_id: shipping_district_id, to_ward_code: shipping_ward_code, weight: totalWeight });
    shipping_fee = Number(feeData?.data?.total);
    if (!Number.isFinite(shipping_fee) || shipping_fee < 0) throw new Error('GHN trả về phí không hợp lệ');
  } catch (error) {
    console.error("Lỗi tính phí GHN khi checkout:", error.response?.data || error.message);
    return res.status(502).json({ success: false, message: 'Không tính được phí vận chuyển GHN, vui lòng thử lại sau' });
  }

  const t = await sequelize.transaction();

  try {
    let total_amount = 0;
    const orderDetailsData = [];

    for (const item of cartItems) {
      if (item.Product.stock_quantity < item.quantity) {
        throw new Error(`Sản phẩm ${item.Product.name} không đủ số lượng`);
      }
      total_amount += item.Product.price * item.quantity;
      orderDetailsData.push({
        product_id: item.Product.id, quantity: item.quantity, price: item.Product.price,
        weight: item.Product.weight || DEFAULT_ITEM_WEIGHT // để cân nặng gửi GHN lúc tạo vận đơn khớp với lúc báo giá
      });

      // Trừ tồn kho CÓ ĐIỀU KIỆN (stock >= số lượng) ngay trong câu UPDATE: 2 khách đặt cùng lúc
      // thì người sau sẽ không trừ được (0 dòng bị ảnh hưởng) thay vì làm tồn kho bị âm
      const [affected] = await Product.update(
        { stock_quantity: sequelize.literal(`stock_quantity - ${Number(item.quantity)}`) },
        { where: { id: item.Product.id, stock_quantity: { [Op.gte]: item.quantity } }, transaction: t }
      );
      if (affected === 0) throw new Error(`Sản phẩm ${item.Product.name} vừa hết hàng, vui lòng cập nhật giỏ`);
    }

    // TÍNH VOUCHER & TĂNG LƯỢT DÙNG
    let discount_amount = 0;
    if (promotion_code) {
      // Kiểm tra mã đầy đủ như API /promotions/apply (trước đây checkout bỏ qua hạn dùng, giới hạn lượt, phạm vi áp dụng)
      const promo = await Promotion.findOne({ where: { code: String(promotion_code).toUpperCase(), status: 'ACTIVE' }, transaction: t, lock: t.LOCK.UPDATE });
      const now = new Date();
      if (!promo) throw new Error('Mã giảm giá không tồn tại hoặc đã bị khóa');
      if (promo.start_date && now < new Date(promo.start_date)) throw new Error('Mã này chưa đến thời gian áp dụng');
      if (promo.end_date && now > new Date(promo.end_date)) throw new Error('Mã này đã hết hạn');
      if (promo.usage_limit != null && Number(promo.used_count || 0) >= Number(promo.usage_limit)) throw new Error('Mã này đã hết lượt sử dụng');
      if (!['ALL', 'PRODUCT'].includes(promo.applicable_scope)) throw new Error('Mã này không áp dụng cho đơn mỹ phẩm');
      if (total_amount < Number(promo.min_order_value || 0)) throw new Error('Đơn hàng chưa đạt giá trị tối thiểu để dùng mã');

      const isUsed = await PromotionUsage.findOne({ where: { customer_id, promotion_id: promo.id }, transaction: t });
      if (isUsed) throw new Error('Bạn đã dùng mã này');

      discount_amount = promo.discount_type === 'PERCENTAGE'
        ? Math.min((total_amount * Number(promo.discount_value)) / 100, Number(promo.max_discount) || Infinity)
        : Number(promo.discount_value);
      discount_amount = Math.min(discount_amount, total_amount); // không giảm quá tiền hàng

      await Promotion.increment('used_count', { by: 1, where: { id: promo.id }, transaction: t });
      await SavedPromotion.destroy({ where: { customer_id, promotion_id: promo.id }, transaction: t });
      await PromotionUsage.create({ customer_id, promotion_id: promo.id }, { transaction: t });
    }

    // LƯU ĐỊA CHỈ: Bao gồm cả tọa độ thật
    if (save_address_to_book) {
      await UserAddress.create({
        customer_id, recipient_name, phone: shipping_phone, address: shipping_address, latitude, longitude,
        shipping_district_id, shipping_ward_code // lưu kèm mã GHN để lần sau tính phí được
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
// Các trường khách được phép tự ghi vào sổ địa chỉ (không cho ghi đè customer_id, id...)
const ADDRESS_FIELDS = ['recipient_name', 'phone', 'address', 'shipping_district_id', 'shipping_ward_code', 'latitude', 'longitude', 'is_default'];
const pickAddressFields = (body) =>
  Object.fromEntries(ADDRESS_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

exports.getUserAddresses = async (req, res) => {
  const customer_id = req.user.id; // chỉ xem sổ địa chỉ của chính mình
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
    const newAddress = await UserAddress.create({ ...pickAddressFields(req.body), customer_id: req.user.id });
    return res.status(201).json({ success: true, data: newAddress });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateUserAddress = async (req, res) => {
  try {
    const address = await UserAddress.findOne({ where: { id: req.params.id, customer_id: req.user.id } });
    if (!address) return res.status(404).json({ success: false, message: 'Không tìm thấy địa chỉ' });

    await address.update(pickAddressFields(req.body));
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

// Luồng trạng thái hợp lệ khi NVBH bấm cập nhật (CANCELLED không nằm ở đây: dùng API /cancel)
// Chờ duyệt (COD) / Đã thanh toán (chuyển khoản) -> Đã duyệt -> Đang đóng gói -> Đang giao (tạo vận đơn GHN) -> Hoàn thành
const ORDER_TRANSITIONS = {
  UNPAID: ['CONFIRMED'],    // COD: NVBH kiểm tra & duyệt (đơn chuyển khoản chưa trả tiền bị chặn thêm ở dưới)
  PAID: ['CONFIRMED'],      // Chuyển khoản đã nhận tiền (SePay) -> NVBH duyệt
  CONFIRMED: ['PROCESSING'], // Bắt đầu đóng gói
  PROCESSING: ['SHIPPING'], // Shipper đến lấy hàng -> tạo vận đơn GHN
  SHIPPING: ['COMPLETED'],
};
// Thứ tự để webhook GHN chỉ được đẩy đơn TIẾN lên, không kéo lùi (vd. "ready_to_pick" đến sau khi đã SHIPPING)
const ORDER_PROGRESS = ['UNPAID', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPING', 'COMPLETED'];

// [SALE/ADMIN] Cập nhật trạng thái đơn (Duyệt, Đang giao, Hoàn thành)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderDetail, include: [{ model: Product }] }]
    });
    
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });

    // Chỉ cho chuyển trạng thái theo đúng luồng. Hủy đơn phải đi qua API /cancel (để hoàn kho, hủy vận đơn GHN).
    const allowedNext = ORDER_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({ success: false, message: `Không thể chuyển đơn từ ${order.status} sang ${status}` });
    }
    // Đơn chuyển khoản chưa nhận được tiền thì chưa được giao
    if (status === 'CONFIRMED' && order.payment_method === 'VIETQR_SEPAY' && order.status !== 'PAID') {
      return res.status(400).json({ success: false, message: 'Đơn chuyển khoản chưa nhận được thanh toán, chưa thể duyệt' });
    }

    // Shipper đến lấy hàng => lúc này mới tạo vận đơn trên GHN
    if (status === 'SHIPPING' && !order.tracking_code) {
      
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
        // GHN trả về nhưng không thành công => KHÔNG đổi trạng thái (đơn chưa có mã vận đơn thì không được "Đang giao")
        return res.status(400).json({ success: false, message: 'Lỗi từ GHN: ' + (ghnRes.data?.message || 'Không tạo được vận đơn') });
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

const CANCELLABLE_ORDER_STATUSES = ['UNPAID', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPING'];

// Cộng lại tồn kho cho các dòng của đơn bị hủy/hoàn
const restoreStock = async (orderDetails, transaction) => {
  for (const detail of orderDetails) {
    await Product.increment('stock_quantity', { by: detail.quantity, where: { id: detail.product_id }, transaction });
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
    // Đơn đã giao xong/đang đổi trả thì không hủy (trước đây hủy được cả đơn COMPLETED => kho bị cộng sai)
    if (!CANCELLABLE_ORDER_STATUSES.includes(order.status)) throw new Error(`Không thể hủy đơn ở trạng thái ${order.status}`);
    // Đơn chuyển khoản đã nhận tiền => sau khi hủy phải hoàn tiền tay cho khách
    const needsRefund = order.payment_method === 'VIETQR_SEPAY' && order.status !== 'UNPAID';

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
    await restoreStock(order.OrderDetails, t);

    await t.commit();
    return res.status(200).json({
      success: true,
      needs_refund: needsRefund,
      message: 'Đã hủy đơn hàng (và đồng bộ GHN nếu có) thành công!' + (needsRefund ? ' Đơn đã thanh toán chuyển khoản: cần hoàn tiền cho khách.' : '')
    });
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

    const order = await Order.findOne({ where: { tracking_code: OrderCode }, include: [{ model: OrderDetail }] });
    if (!order) {
      console.log(`⚠️ [GHN WEBHOOK] Không tìm thấy đơn hàng cho mã vận đơn: ${OrderCode}`);
      return res.status(200).json({ message: 'Bỏ qua, không phải đơn của hệ thống này' });
    }
    // Đơn đã kết thúc thì bỏ qua (GHN có thể gửi lại sự kiện cũ, không được kéo đơn lùi trạng thái)
    if (['CANCELLED', 'COMPLETED'].includes(order.status)) {
      return res.status(200).json({ success: true, message: 'Đơn đã kết thúc, bỏ qua' });
    }

    let newStatus = order.status;

    // Vận đơn GHN chỉ được tạo khi đơn đã "Đang giao" => ready_to_pick/picking không đổi gì
    // (trước đây map về PROCESSING nên vừa tạo vận đơn xong đơn bị kéo lùi về "Đang chuẩn bị")
    if (['picked', 'storing', 'transporting', 'sorting', 'delivering'].includes(Status)) newStatus = 'SHIPPING';
    else if (['delivered'].includes(Status)) newStatus = 'COMPLETED';
    else if (['cancel', 'returned'].includes(Status)) newStatus = 'CANCELLED';

    // Chỉ cho đi tiến (CANCELLED là ngoại lệ, xử lý riêng ở dưới)
    if (newStatus !== 'CANCELLED' && ORDER_PROGRESS.indexOf(newStatus) < ORDER_PROGRESS.indexOf(order.status)) {
      newStatus = order.status;
    }

    if (newStatus !== order.status) {
      if (newStatus === 'CANCELLED') {
        // Hàng bị hủy/hoàn về kho => cộng lại tồn kho (trước đây chỉ đổi trạng thái, kho bị thiếu)
        await sequelize.transaction(async (t) => {
          await order.update({ status: newStatus }, { transaction: t });
          await restoreStock(order.OrderDetails, t);
        });
      } else {
        await order.update({ status: newStatus });
      }
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
      // Tìm cấu trúc "SP MãĐơnHàng". SePay gửi MỌI giao dịch tới cả webhook này lẫn webhook đặt lịch,
      // nên "SP" phải đứng riêng (tránh khớp nhầm trong chữ như "SPA", "GSP...")
      const match = content.match(/(?<![a-z0-9])SP\s?([a-z0-9]{6})/i);
      if (match) {
        const shortId = match[1].toLowerCase();
        const pendingOrders = await Order.findAll({ where: { status: 'UNPAID', payment_method: 'VIETQR_SEPAY' } });
        const candidates = pendingOrders.filter(o => o.id.toLowerCase().startsWith(shortId));
        // Mã 6 ký tự có thể trùng giữa 2 đơn => không tự đoán, để nhân viên đối soát tay
        if (candidates.length > 1) console.warn(`⚠️ [SEPAY WEBHOOK] Mã SP ${shortId} khớp ${candidates.length} đơn, cần đối soát tay`);
        const order = candidates.length === 1 ? candidates[0] : null;

        if (order) {
           const amountToPay = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);

           if (Number(transferAmount) >= amountToPay) {
               // Đặt PAID (không phải PROCESSING): NVBH bấm "Duyệt" thì mới tạo vận đơn GHN.
               // Trước đây đặt thẳng PROCESSING nên đơn đã trả tiền không bao giờ được tạo vận đơn.
               order.status = 'PAID';
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
    if (req.user.role === 'CUSTOMER' && order.customer_id !== req.user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng này' });
    }

    // Nếu trạng thái khác UNPAID nghĩa là đã nhận được tiền hoặc bị hủy
    const isPaid = order.status !== 'UNPAID';
    return res.status(200).json({ isPaid, status: order.status });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};