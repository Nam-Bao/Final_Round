const { sequelize, Product, Order, OrderDetail, OrderReturn } = require('../models');
const axios = require('axios');
const { ghnUrl, shopWarehouse, ghnHeaders } = require('../utils/ghn');
const { sendRefundClaim } = require('../utils/refundClaim');

// ==========================================
// QUY ĐỊNH HOÀN / TRẢ HÀNG (đồng bộ với nội dung hiển thị cho khách ở frontend-client)
// ==========================================
const RETURN_WINDOW_DAYS = 7;          // tính từ lúc đơn chuyển sang "Đã nhận"
const RETURN_REASONS = {
  DAMAGED: 'Hàng bị móp, vỡ, rò rỉ khi vận chuyển',
  WRONG_ITEM: 'Giao sai sản phẩm / sai phân loại',
  DEFECTIVE: 'Sản phẩm lỗi (biến chất, đổi màu, mùi lạ, vòi bơm hỏng)',
  EXPIRED: 'Sản phẩm hết hạn hoặc không có hạn sử dụng',
};
const MAX_IMAGES = 5;
const PACKAGING_WEIGHT = 300; // gram, khớp với đơn giao đi
// Chỉ nhận ảnh đã tải qua service-media (Cloudinary), không nhận link ngoài
const isEvidenceUrl = (url) => typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\/[^\s]+$/.test(url);

const ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'PICKING', 'RECEIVED'];
// Đã có 1 yêu cầu ở các trạng thái này thì đơn không được yêu cầu hoàn trả lần nữa
const BLOCKING_STATUSES = [...ACTIVE_STATUSES, 'REFUNDED', 'REJECTED'];

class ReturnError extends Error {}

// Đơn COMPLETED không còn bị sửa gì sau đó, nên updatedAt chính là thời điểm khách nhận hàng
const returnDeadline = (order) => new Date(new Date(order.updatedAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

// Kiểm tra đơn có đủ điều kiện hoàn trả không (dùng cho cả API tạo yêu cầu)
const assertOrderReturnable = (order) => {
  if (order.status !== 'COMPLETED') throw new ReturnError('Chỉ đơn đã nhận hàng mới được yêu cầu hoàn trả');
  // Đơn tại quầy (không có vận đơn GHN) đổi trả trực tiếp tại phòng khám
  if (!order.tracking_code) throw new ReturnError('Đơn mua tại quầy vui lòng mang sản phẩm đến phòng khám để được hỗ trợ');
  if (new Date() > returnDeadline(order)) throw new ReturnError(`Đã quá ${RETURN_WINDOW_DAYS} ngày kể từ khi nhận hàng, đơn không còn được hoàn trả`);
};

// Số tiền hoàn: giá trị sản phẩm trả lại trừ phần voucher phân bổ theo tỷ lệ; trả toàn bộ đơn thì hoàn cả phí ship ban đầu
const refundGoodsValue = (order, items) => {
  const itemsValue = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const subtotal = Number(order.total_amount || 0);
  const discountShare = subtotal > 0 ? Math.round(Number(order.discount_amount || 0) * itemsValue / subtotal) : 0;
  return Math.max(0, itemsValue - discountShare);
};
const calcRefund = (order, items, isFullReturn) => refundGoodsValue(order, items) + (isFullReturn ? Number(order.shipping_fee || 0) : 0);
exports.refundGoodsValue = refundGoodsValue;

const sendError = (res, error, fallback) => {
  if (error instanceof ReturnError) return res.status(400).json({ success: false, message: error.message });
  console.error(fallback, error.response?.data || error.message);
  return res.status(500).json({ success: false, message: fallback });
};

// [PUBLIC] Quy định hoàn trả để frontend hiển thị
exports.getReturnPolicy = (req, res) => {
  res.status(200).json({ data: { window_days: RETURN_WINDOW_DAYS, reasons: RETURN_REASONS, max_images: MAX_IMAGES } });
};

// ==========================================
// KHÁCH HÀNG
// ==========================================

// [CUSTOMER] Gửi yêu cầu hoàn trả cho đơn của chính mình
exports.createReturn = async (req, res) => {
  const customer_id = req.user.id;
  const { order_id, reason, agree } = req.body;
  const description = String(req.body.description || '').trim();
  const bank_name = String(req.body.bank_name || '').trim();
  const bank_account = String(req.body.bank_account || '').replace(/\s/g, '');
  const bank_holder = String(req.body.bank_holder || '').trim().toUpperCase();
  const images = Array.isArray(req.body.images) ? [...new Set(req.body.images)] : [];

  // 1. Kiểm tra hồ sơ (không cần DB)
  if (!order_id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng' });
  if (!RETURN_REASONS[reason]) return res.status(400).json({ success: false, message: 'Lý do hoàn trả không hợp lệ' });
  if (description.length < 20 || description.length > 1000) return res.status(400).json({ success: false, message: 'Mô tả tình trạng sản phẩm cần từ 20 đến 1000 ký tự' });
  if (images.length < 1 || images.length > MAX_IMAGES || !images.every(isEvidenceUrl)) {
    return res.status(400).json({ success: false, message: `Cần 1 - ${MAX_IMAGES} ảnh bằng chứng tải lên từ hệ thống` });
  }
  if (!bank_name || !bank_holder || !/^\d{6,20}$/.test(bank_account)) {
    return res.status(400).json({ success: false, message: 'Thông tin nhận hoàn tiền chưa hợp lệ (số tài khoản 6 - 20 chữ số)' });
  }
  if (agree !== true) return res.status(400).json({ success: false, message: 'Bạn cần xác nhận đồng ý với quy định hoàn trả' });

  const t = await sequelize.transaction();
  try {
    // 2. Khóa dòng đơn hàng để 2 yêu cầu gửi cùng lúc không cùng lọt qua bước kiểm tra
    const order = await Order.findOne({ where: { id: order_id, customer_id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw new ReturnError('Không tìm thấy đơn hàng');
    assertOrderReturnable(order);

    const existed = await OrderReturn.findOne({ where: { order_id, status: BLOCKING_STATUSES }, transaction: t });
    if (existed) throw new ReturnError('Đơn này đã có yêu cầu hoàn trả, mỗi đơn chỉ được yêu cầu một lần');

    // 3. Sản phẩm trả: phải thuộc đơn, số lượng không vượt số đã mua
    const details = await OrderDetail.findAll({ where: { order_id }, include: [{ model: Product, attributes: ['name'] }], transaction: t });
    const qtyByDetail = {};
    (Array.isArray(req.body.items) ? req.body.items : []).forEach((item) => {
      const quantity = parseInt(item?.quantity, 10) || 0;
      if (item?.order_detail_id && quantity > 0) qtyByDetail[item.order_detail_id] = (qtyByDetail[item.order_detail_id] || 0) + quantity;
    });
    if (Object.keys(qtyByDetail).length === 0) throw new ReturnError('Chọn ít nhất một sản phẩm cần hoàn trả');

    const items = Object.entries(qtyByDetail).map(([detailId, quantity]) => {
      const detail = details.find((d) => d.id === detailId);
      if (!detail) throw new ReturnError('Sản phẩm không thuộc đơn hàng này');
      if (quantity > detail.quantity) throw new ReturnError(`Số lượng trả của ${detail.Product?.name || 'sản phẩm'} vượt số đã mua (${detail.quantity})`);
      return { order_detail_id: detail.id, product_id: detail.product_id, name: detail.Product?.name || 'Sản phẩm', quantity, price: Number(detail.price), weight: detail.weight };
    });
    const isFullReturn = details.every((d) => qtyByDetail[d.id] === d.quantity);

    const created = await OrderReturn.create({
      order_id, customer_id, items, reason, description, images, bank_name, bank_account, bank_holder,
      refund_amount: calcRefund(order, items, isFullReturn),
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({ success: true, data: created, message: 'Đã gửi yêu cầu hoàn trả, nhân viên sẽ phản hồi trong 24 giờ làm việc' });
  } catch (error) {
    await t.rollback();
    return sendError(res, error, 'Không gửi được yêu cầu hoàn trả');
  }
};

// [CUSTOMER] Hủy yêu cầu khi nhân viên chưa duyệt
exports.cancelReturn = async (req, res) => {
  try {
    const [updated] = await OrderReturn.update(
      { status: 'CANCELLED' },
      { where: { id: req.params.id, customer_id: req.user.id, status: 'PENDING' } }
    );
    if (!updated) return res.status(400).json({ success: false, message: 'Chỉ hủy được yêu cầu đang chờ duyệt' });
    return res.status(200).json({ success: true, message: 'Đã hủy yêu cầu hoàn trả' });
  } catch (error) {
    return sendError(res, error, 'Không hủy được yêu cầu');
  }
};

// ==========================================
// NHÂN VIÊN BÁN HÀNG
// ==========================================

exports.getReturnsForAdmin = async (req, res) => {
  try {
    const returns = await OrderReturn.findAll({
      include: [{ model: Order, attributes: ['id', 'recipient_name', 'shipping_phone', 'shipping_address', 'tracking_code', 'payment_method', 'total_amount', 'discount_amount', 'shipping_fee', 'updatedAt'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json({ success: true, data: returns });
  } catch (error) {
    return sendError(res, error, 'Lỗi tải danh sách hoàn trả');
  }
};

// Khóa yêu cầu, kiểm tra trạng thái hiện tại rồi chạy thao tác trong cùng transaction
const withReturn = async (req, res, allowedFrom, action, successMessage) => {
  const t = await sequelize.transaction();
  try {
    const ret = await OrderReturn.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!ret) throw new ReturnError('Không tìm thấy yêu cầu hoàn trả');
    if (!allowedFrom.includes(ret.status)) throw new ReturnError(`Không thể thao tác khi yêu cầu đang ở trạng thái ${ret.status}`);
    await action(ret, t);
    await ret.save({ transaction: t });
    await t.commit();
    return res.status(200).json({ success: true, data: ret, message: successMessage });
  } catch (error) {
    await t.rollback();
    return sendError(res, error, error.message || 'Thao tác thất bại');
  }
};

// [SALES] Duyệt yêu cầu (sau khi xem ảnh/mô tả hợp lệ)
exports.approveReturn = (req, res) => withReturn(req, res, ['PENDING'], async (ret) => {
  Object.assign(ret, { status: 'APPROVED', handled_by: req.user.id, approved_at: new Date() });
}, 'Đã duyệt yêu cầu, hãy tạo đơn GHN lấy hàng');

// [SALES] Từ chối: khi duyệt hồ sơ, hoặc khi kiểm tra hàng nhận về không đạt
exports.rejectReturn = (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 10) return res.status(400).json({ success: false, message: 'Nhập lý do từ chối (ít nhất 10 ký tự) để thông báo cho khách' });
  return withReturn(req, res, ['PENDING', 'APPROVED', 'RECEIVED'], async (ret) => {
    Object.assign(ret, { status: 'REJECTED', reject_reason: reason, handled_by: req.user.id });
  }, 'Đã từ chối yêu cầu hoàn trả');
};

// Tách "số nhà, phường, quận, tỉnh" (định dạng địa chỉ lúc khách đặt hàng) thành các phần cho GHN
const splitAddress = (address) => {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const [province, district, ward] = parts.slice(-3).reverse();
  return { street: parts.slice(0, -3).join(', '), ward, district, province };
};

// [SALES] Tạo đơn GHN chiều ngược: lấy hàng tại địa chỉ khách, giao về kho, shop trả phí
exports.createReturnPickup = (req, res) => withReturn(req, res, ['APPROVED'], async (ret, t) => {
  const order = await Order.findByPk(ret.order_id, { transaction: t });
  const addr = splitAddress(order.shipping_address);
  if (!addr) throw new ReturnError('Địa chỉ đơn hàng không đủ Phường / Quận / Tỉnh, vui lòng liên hệ khách');

  const warehouse = shopWarehouse(); // kho nhận hàng hoàn (cấu hình trong .env)
  const items = ret.items.map((i) => ({ name: i.name, quantity: i.quantity, price: Math.round(i.price), weight: i.weight || 200 }));
  const itemsValue = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const payload = {
    payment_type_id: 1,               // shop trả phí vận chuyển chiều về
    required_note: 'KHONGCHOXEMHANG',
    client_order_code: `RT${ret.id.replace(/-/g, '').slice(0, 18)}`, // gửi lại cùng mã => GHN trả đơn cũ, không tạo trùng
    note: `Lấy hàng hoàn trả đơn #${order.id.slice(0, 8).toUpperCase()}`,
    from_name: order.recipient_name,
    from_phone: order.shipping_phone,
    from_address: order.shipping_address,
    from_ward_name: addr.ward,
    from_district_name: addr.district,
    from_province_name: addr.province,
    from_ward_code: order.shipping_ward_code,
    from_district_id: Number(order.shipping_district_id) || undefined,
    to_name: warehouse.name,
    to_phone: warehouse.phone,
    to_address: warehouse.address,
    to_ward_code: warehouse.ward_code,
    to_district_id: warehouse.district_id,
    cod_amount: 0,
    insurance_value: Math.min(itemsValue, 5000000),
    weight: items.reduce((sum, i) => sum + i.weight * i.quantity, PACKAGING_WEIGHT),
    length: 15, width: 15, height: 10,
    service_type_id: 2,
    items,
  };

  let ghnRes;
  try {
    ghnRes = await axios.post(ghnUrl('/v2/shipping-order/create'), payload, { headers: ghnHeaders() });
  } catch (error) {
    console.error('Lỗi tạo đơn GHN hoàn trả:', error.response?.data || error.message);
    throw new ReturnError('Lỗi từ GHN: ' + (error.response?.data?.message || 'không kết nối được'));
  }
  if (ghnRes.data?.code !== 200 || !ghnRes.data?.data?.order_code) {
    throw new ReturnError('Lỗi từ GHN: ' + (ghnRes.data?.message || 'không tạo được vận đơn'));
  }
  Object.assign(ret, { status: 'PICKING', tracking_code: ghnRes.data.data.order_code, ghn_status: 'ready_to_pick', handled_by: req.user.id });
}, 'Đã tạo đơn GHN lấy hàng hoàn trả');

// [SALES] Hủy đơn GHN lấy hàng (vd. khách hẹn lại) => quay về "Đã duyệt" để tạo lại
exports.cancelReturnPickup = (req, res) => withReturn(req, res, ['PICKING'], async (ret) => {
  try {
    const ghnRes = await axios.post(ghnUrl('/v2/switch-status/cancel'), { order_codes: [ret.tracking_code] }, { headers: ghnHeaders() });
    if (ghnRes.data?.code !== 200) throw new Error(ghnRes.data?.message);
  } catch (error) {
    throw new ReturnError('GHN không cho hủy (có thể shipper đã lấy hàng): ' + (error.response?.data?.message || error.message || ''));
  }
  Object.assign(ret, { status: 'APPROVED', tracking_code: null, ghn_status: 'cancel', handled_by: req.user.id });
}, 'Đã hủy đơn GHN lấy hàng');

// [SALES] Xác nhận kho đã nhận hàng hoàn (dự phòng khi chưa nhận được webhook GHN)
exports.receiveReturn = (req, res) => withReturn(req, res, ['PICKING'], async (ret) => {
  Object.assign(ret, { status: 'RECEIVED', received_at: new Date(), handled_by: req.user.id });
}, 'Đã xác nhận nhận hàng hoàn, hãy kiểm tra sản phẩm');

// [SALES] Kiểm tra hàng đạt => ghi nhận đã chuyển khoản hoàn tiền; tùy chọn nhập lại kho nếu hàng còn bán được
exports.refundReturn = (req, res) => {
  const refund_ref = String(req.body.refund_ref || '').trim();
  if (refund_ref.length < 4 || refund_ref.length > 50) {
    return res.status(400).json({ success: false, message: 'Nhập mã giao dịch chuyển khoản hoàn tiền (4 - 50 ký tự)' });
  }
  const restock = req.body.restock === true;
  return withReturn(req, res, ['RECEIVED'], async (ret, t) => {
    // Tài khoản nhận hoàn là tài khoản khách khai khi gửi yêu cầu; ghi khoản hoàn để quản lý đối chiếu tiền ra
    t.afterCommit(() => sendRefundClaim({
      source: 'RETURN', source_id: ret.id, customer_id: ret.customer_id, amount: Number(ret.refund_amount), bank_ref: refund_ref,
      account: `${ret.bank_name} - ${ret.bank_account} - ${ret.bank_holder}`, claimed_by: req.user.id,
    }));
    if (restock) {
      for (const item of ret.items) {
        await Product.increment('stock_quantity', { by: item.quantity, where: { id: item.product_id }, transaction: t });
      }
    }
    Object.assign(ret, { status: 'REFUNDED', refund_ref, restocked: restock, refunded_at: new Date(), handled_by: req.user.id });
  }, 'Đã hoàn tất hoàn tiền cho khách');
};

// [WEBHOOK GHN] Trả true nếu mã vận đơn là đơn lấy hàng hoàn trả (đã xử lý), false nếu không phải
exports.handleReturnWebhook = async (orderCode, status) => {
  const ret = await OrderReturn.findOne({ where: { tracking_code: orderCode } });
  if (!ret) return false;
  if (ret.status !== 'PICKING') return true; // đã xử lý xong / sự kiện cũ gửi lại

  const update = { ghn_status: status };
  if (status === 'delivered') Object.assign(update, { status: 'RECEIVED', received_at: new Date() });
  // GHN hủy hoặc không lấy được hàng (trả lại khách) => quay về "Đã duyệt" để NVBH liên hệ khách và tạo lại
  else if (['cancel', 'returned'].includes(status)) Object.assign(update, { status: 'APPROVED', tracking_code: null });

  await OrderReturn.update(update, { where: { id: ret.id, status: 'PICKING' } });
  console.log(`✅ [GHN WEBHOOK] Yêu cầu hoàn trả ${ret.id}: ${status}`);
  return true;
};
