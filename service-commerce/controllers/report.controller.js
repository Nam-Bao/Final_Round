const { Op } = require('sequelize');
const { Product, ProductDetail, Order, OrderDetail, OrderReturn, InventoryRequest } = require('../models');

// ==========================================
// BÁO CÁO BÁN MỸ PHẨM + CẢNH BÁO HẾT HÀNG cho quản lý
// Doanh thu = đơn đã giao xong (COMPLETED), giá trị hàng sau giảm giá (không tính phí ship – trả cho GHN),
// trừ tiền hoàn của yêu cầu trả hàng đã hoàn tiền. Đơn tại quầy sau khám (có appointment_id) đã nằm trong hoá đơn khám
// bên service-booking nên KHÔNG tính lại ở đây.
// ==========================================
// Ngày theo giờ địa phương của server (VN, UTC+7) — toISOString() là giờ UTC sẽ lệch ngày với đơn buổi tối
const day = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const LEAD_DAYS = 7;          // thời gian đặt hàng về kho (ngày) => cảnh báo khi tồn < lượng bán trong 7 ngày
const MIN_RETAIL_STOCK = 5;   // tối thiểu với hàng bán chậm
const SALES_WINDOW = 30;

const parseRange = (q) => {
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date(to.getTime() - 29 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw Object.assign(new Error('Khoảng ngày không hợp lệ'), { status: 400 });
  if (to - from > 400 * 86400000) throw Object.assign(new Error('Tối đa 400 ngày mỗi lần xem'), { status: 400 });
  from.setHours(0, 0, 0, 0);
  return { from, to };
};

// [ADMIN/GEN_MANAGER] GET /reports/sales?from&to
exports.getSalesReport = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const orders = await Order.findAll({
      where: { status: 'COMPLETED', appointment_id: null, createdAt: { [Op.between]: [from, to] } },
      include: [{ model: OrderDetail, include: [{ model: Product, attributes: ['id', 'name'] }] }],
    });
    const refunds = await OrderReturn.findAll({ where: { status: 'REFUNDED', refunded_at: { [Op.between]: [from, to] } }, raw: true });

    const days = {};
    const bump = (d, key, v) => { const k = day(d); days[k] = days[k] || { online_products: 0, store_products: 0, refunds: 0 }; days[k][key] += v; };
    const top = {};
    orders.forEach((o) => {
      const value = Math.max(0, Number(o.total_amount) - Number(o.discount_amount || 0));
      // consultant_id = NVBH tạo đơn hộ (bán tại quầy / đặt hộ); không có = khách tự đặt online
      bump(o.createdAt, o.consultant_id ? 'store_products' : 'online_products', value);
      o.OrderDetails.forEach((d) => {
        const t = top[d.product_id] || (top[d.product_id] = { id: d.product_id, name: d.Product?.name || 'Sản phẩm', quantity: 0, revenue: 0 });
        t.quantity += d.quantity;
        t.revenue += Number(d.price) * d.quantity;
      });
    });
    refunds.forEach((r) => bump(r.refunded_at, 'refunds', -Number(r.refund_amount || 0)));
    const series = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
    const totals = ['online_products', 'store_products', 'refunds'].reduce((acc, k) => ({ ...acc, [k]: series.reduce((s, d) => s + d[k], 0) }), {});
    res.status(200).json({
      series, totals,
      counts: { orders: orders.length, refunds: refunds.length },
      top_products: Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });
  }
};

// [ADMIN/GEN_MANAGER] GET /reports/overview: đơn cần xử lý, mỹ phẩm sắp hết, đề xuất nhập chờ duyệt
exports.getOverview = async (req, res) => {
  try {
    const since = new Date(Date.now() - SALES_WINDOW * 86400000);
    const [pendingOrders, products, sold, pendingPurchase, approvedNotReceived] = await Promise.all([
      Order.count({ where: { status: { [Op.in]: ['UNPAID', 'PAID', 'CONFIRMED', 'PROCESSING'] }, appointment_id: null } }),
      Product.findAll({ where: { type: 'PRODUCT' }, include: [{ model: ProductDetail, attributes: ['is_published'] }], attributes: ['id', 'name', 'stock_quantity'] }),
      OrderDetail.findAll({
        attributes: ['product_id', 'quantity'],
        include: [{ model: Order, attributes: [], where: { status: { [Op.notIn]: ['CANCELLED', 'UNPAID'] }, createdAt: { [Op.gte]: since } } }],
        raw: true,
      }),
      InventoryRequest.count({ where: { type: 'PURCHASE_ORDER', status: 'PENDING' } }),
      InventoryRequest.count({ where: { type: 'PURCHASE_ORDER', status: 'APPROVED', received_at: null } }),
    ]);
    const soldBy = {};
    sold.forEach((s) => { soldBy[s.product_id] = (soldBy[s.product_id] || 0) + Number(s.quantity); });
    const pendingSet = new Set((await InventoryRequest.findAll({ where: { type: 'PURCHASE_ORDER', status: { [Op.in]: ['PENDING', 'APPROVED'] }, received_at: null }, attributes: ['items'], raw: true }))
      .flatMap((r) => (r.items || []).map((i) => i.product_id)));
    // Cảnh báo mỹ phẩm: tồn kho thấp hơn lượng bán dự kiến trong thời gian chờ hàng về (tối thiểu MIN_RETAIL_STOCK)
    const productAlerts = products.map((p) => {
      const avgDaily = (soldBy[p.id] || 0) / SALES_WINDOW;
      const threshold = Math.max(MIN_RETAIL_STOCK, Math.ceil(avgDaily * LEAD_DAYS));
      return {
        id: p.id, name: p.name, stock: p.stock_quantity, sold_30d: soldBy[p.id] || 0, threshold,
        days_left: avgDaily > 0 ? Math.floor(p.stock_quantity / avgDaily) : null,
        on_web: Boolean(p.ProductDetail?.is_published), purchase_pending: pendingSet.has(p.id),
        status: p.stock_quantity <= 0 ? 'OUT' : p.stock_quantity <= threshold ? 'LOW' : 'OK',
        suggested_qty: Math.max(0, threshold * 2 - p.stock_quantity),
      };
    }).filter((p) => p.status !== 'OK').sort((a, b) => a.stock - b.stock);
    res.status(200).json({ data: { pending_orders: pendingOrders, product_alerts: productAlerts, pending_purchase: pendingPurchase, approved_not_received: approvedNotReceived } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};
