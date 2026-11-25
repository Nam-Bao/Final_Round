// Chứng từ in cho khách (khổ A5): hóa đơn bán lẻ tại quầy + thông tin sản phẩm cho đơn thuốc / phiếu thanh toán bên booking.
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Op } = require('sequelize');
const { Product, ProductDetail, Order, OrderDetail, Promotion } = require('../models');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const PICKUP_ADDRESS = 'Nhận tại quầy phòng khám GlowSkin';

// [STAFF] GET /products/print-info?ids=a,b — tên, dung tích, giá, hướng dẫn sử dụng, thuốc kê đơn
// (in đơn thuốc; bác sĩ điền sẵn "Cách dùng" từ hướng dẫn sử dụng)
const productPrintInfo = async (req, res) => {
  try {
    const ids = [...new Set(String(req.query.ids || '').split(',').filter((id) => UUID_RE.test(id)))].slice(0, 50);
    if (!ids.length) return res.json({ data: [] });
    const rows = await Product.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'name', 'price'], include: [{ model: ProductDetail, attributes: ['brand', 'capacity', 'usage', 'warnings', 'is_prescription'], required: false }] });
    res.json({
      data: rows.map((p) => ({
        id: p.id, name: p.name, price: Number(p.price), brand: p.ProductDetail?.brand || null, capacity: p.ProductDetail?.capacity || null,
        usage: clip(p.ProductDetail?.usage, 300), warnings: clip(p.ProductDetail?.warnings, 300), is_prescription: !!p.ProductDetail?.is_prescription,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const sysToken = () => jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });

// Thông tin phòng khám (công khai) + tên người (identity, token hệ thống). Lỗi thì in phần còn lại, không chặn in.
const clinicInfo = () => axios.get(`${GATEWAY}/api/media/pages/clinic-info`, { timeout: 5000 }).then((r) => r.data.data || {}).catch(() => ({}));
const peopleInfo = (user_ids) => axios.post(`${GATEWAY}/api/identity/users/print-info`, { user_ids }, { headers: { Authorization: `Bearer ${sysToken()}` }, timeout: 5000 })
  .then((r) => r.data).catch(() => ({ users: {} }));

const RETURNED = ['RETURN_REQUESTED', 'RETURN_COMPLETED', 'REFUND_PENDING'];

// [SALES/MANAGER] GET /orders/admin/:id/print — hóa đơn bán lẻ của đơn nhận tại quầy đã hoàn thành
const counterOrderPrint = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    const order = await Order.findByPk(req.params.id, { include: [{ model: OrderDetail, include: [{ model: Product, attributes: ['name'], include: [{ model: ProductDetail, attributes: ['capacity'], required: false }] }] }] });
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    if (order.shipping_address !== PICKUP_ADDRESS) return res.status(409).json({ message: 'Chỉ in hóa đơn cho đơn nhận tại quầy. Đơn giao hàng dùng vận đơn GHN.' });
    // Mỹ phẩm mua khi chốt bill sau khám đã nằm trong phiếu thanh toán của lịch khám => không in thêm hóa đơn thứ 2
    if (order.appointment_id) return res.status(409).json({ code: 'IN_CLINIC_INVOICE', message: 'Đơn này thuộc phiếu thanh toán sau khám, hãy in ở lịch hẹn', appointment_id: order.appointment_id });
    if (order.status === 'CANCELLED') return res.status(409).json({ message: 'Đơn đã hủy, không in hóa đơn' });
    if (!['COMPLETED', ...RETURNED, 'RETURN_REJECTED'].includes(order.status)) return res.status(409).json({ message: 'Đơn tại quầy chưa hoàn thành' });

    const [clinic, people, promo] = await Promise.all([
      clinicInfo(),
      peopleInfo([order.customer_id, order.consultant_id, req.user.id].filter(Boolean)),
      order.promotion_id ? Promotion.findByPk(order.promotion_id, { attributes: ['code'] }) : null,
    ]);
    const u = people.users || {};
    const gross = Number(order.total_amount);
    const discount = Number(order.discount_amount || 0);
    res.json({
      data: {
        // Số chứng từ: DH-ngày-6 ký tự đầu mã đơn (cùng cách với phiếu thanh toán / đơn thuốc bên booking)
        doc_no: `DH-${new Date(order.createdAt.getTime() + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '')}-${order.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        clinic,
        order: {
          id: order.id, created_at: order.createdAt, status: order.status,
          returned: RETURNED.includes(order.status), refund_status: order.refund_status,
          // Đơn tại quầy: COD = khách trả tiền mặt tại quầy
          payment_method: order.payment_method === 'POINTS' ? `Điểm GlowSkin (${Number(order.points_used || 0).toLocaleString('vi-VN')} điểm)` : order.payment_method === 'VIETQR_SEPAY' ? 'Chuyển khoản (VietQR)' : 'Tiền mặt',
          note: order.note,
        },
        customer: { name: order.recipient_name, phone: order.shipping_phone, account_name: u[order.customer_id]?.full_name || null },
        seller: u[order.consultant_id]?.full_name || null,
        items: order.OrderDetails.map((d) => ({ name: d.Product?.name || 'Sản phẩm', capacity: d.Product?.ProductDetail?.capacity || null, quantity: d.quantity, price: Number(d.price), amount: Number(d.price) * d.quantity })),
        totals: { gross, discount, voucher_code: promo?.code || null, total: Math.max(0, gross - discount) },
        // Lưu ý an toàn NVBH đã tư vấn khi bán (sàng lọc tại quầy)
        safety: order.safety_screening?.warnings?.length ? order.safety_screening.warnings.map((w) => ({ severity: w.severity, label: w.severity_label, item: w.item, message: w.message })) : [],
        printed_by: u[req.user.id]?.full_name || null,
        printed_at: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { productPrintInfo, counterOrderPrint };
