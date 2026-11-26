// ==========================================
// NHẬP HÀNG (mỹ phẩm + vật tư) theo kiểu Odoo rút gọn:
//   Đề xuất nhập (hệ thống tự tạo / NVBH / KTV / quản lý) -> quản lý duyệt (không tự duyệt đề xuất của mình)
//   -> Đơn đặt hàng PO gửi email + PDF cho nhà cung cấp
//   -> NVBH nhận hàng, kiểm từng dòng (số lượng, số lô, NSX, HSD, tình trạng, nhãn) => Biên bản nhận hàng
//        khớp: nhập kho ngay theo lô | lệch / lỗi: dòng đó chờ quản lý kiểm tra thực tế, quyết định nhận / trả / hủy / giao bù
//   Kiểm kho tuần (mỹ phẩm): NVBH đếm không thấy số hệ thống; lệch dù 1 sản phẩm => quản lý đếm lại và chốt
// ==========================================
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize, Product, MaterialSpec, MaterialLot, StockAdjustment, InventoryRequest, Supplier, PurchaseOrder, GoodsReceipt, StockCount } = require('../models');
const { sendEmailTo } = require('../utils/mail');
const { renderPurchaseOrderPdf } = require('../utils/purchaseOrderPdf');
const { vnDate, disposeHeldLot } = require('../utils/stockLots');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MANAGERS = ['GEN_MANAGER', 'ADMIN'];
// Hạn dùng còn lại tối thiểu khi nhập (tháng): ngắn hơn thì dòng đó cần quản lý xem xét
const MIN_SHELF_MONTHS = () => Number(process.env.PURCHASE_MIN_SHELF_MONTHS) || 6;
const MAX_QTY = 100000;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fail = (res, error) => {
  if (!error.status) console.error('[Nhập hàng]', error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });
};
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(v).getTime());
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const addMonths = (date, m) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const isManager = (req) => MANAGERS.includes(req.user.role);

// Tuần ISO theo giờ Việt Nam, vd 2026-W48
const isoWeek = (d = new Date()) => {
  const x = new Date(`${vnDate(d)}T00:00:00Z`);
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
};

// Mã chứng từ theo ngày: PO-261126-001, NH-261126-001, KK-261126-001
const nextCode = async (Model, prefix, transaction) => {
  const day = vnDate().slice(2).replace(/-/g, '');
  const base = `${prefix}-${day}-`;
  const last = await Model.findOne({ where: { code: { [Op.like]: `${base}%` } }, order: [['code', 'DESC']], attributes: ['code'], transaction });
  const n = last ? Number(last.code.slice(base.length)) + 1 : 1;
  return `${base}${String(n).padStart(3, '0')}`;
};

const staffNames = async (ids, authorization) => {
  const list = [...new Set(ids.filter((x) => UUID_RE.test(String(x || ''))))];
  if (!list.length) return {};
  const r = await axios.get(`${GATEWAY_URL}/api/identity/users/staff-names`, { params: { ids: list.join(',') }, headers: { Authorization: authorization }, timeout: 5000 }).catch(() => null);
  return Object.fromEntries((r?.data?.data || []).map((u) => [u.id, u.name]));
};
const clinicInfo = async () => {
  const r = await axios.get(`${GATEWAY_URL}/api/media/pages/clinic-info`, { timeout: 4000 }).catch(() => null);
  const c = r?.data?.data || {};
  return { ...c, business_name: c.business_name || 'Phòng khám da liễu GlowSkin', hotline: c.hotline || '0869694064', address: c.address || process.env.CLINIC_ADDRESS || '' };
};

// ---------------------------------------------------------------- Nhà cung cấp
exports.listSuppliers = async (req, res) => {
  try {
    const where = req.query.all === '1' && isManager(req) ? {} : { is_active: true };
    res.status(200).json({ data: await Supplier.findAll({ where, order: [['name', 'ASC']] }) });
  } catch (error) { fail(res, error); }
};

const supplierValues = (body) => {
  const v = {
    name: text(body.name, 200), tax_code: text(body.tax_code, 20) || null, contact_name: text(body.contact_name, 100) || null,
    email: text(body.email, 200).toLowerCase(), phone: text(body.phone, 20) || null, address: text(body.address, 300) || null, note: text(body.note, 500) || null,
  };
  if (v.name.length < 2) throw bad('Nhập tên nhà cung cấp');
  if (!EMAIL_RE.test(v.email)) throw bad('Email nhà cung cấp không hợp lệ (dùng để gửi đơn đặt hàng)');
  if (v.phone && !/^[0-9+\s.-]{8,20}$/.test(v.phone)) throw bad('Số điện thoại không hợp lệ');
  if (v.tax_code && !/^\d{10}(-\d{3})?$/.test(v.tax_code)) throw bad('Mã số thuế gồm 10 số (hoặc 10 số - 3 số chi nhánh)');
  return v;
};

exports.createSupplier = async (req, res) => {
  try {
    const row = await Supplier.create({ ...supplierValues(req.body), created_by: req.user.id });
    res.status(201).json({ message: 'Đã thêm nhà cung cấp', data: row });
  } catch (error) { fail(res, error); }
};

exports.updateSupplier = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy nhà cung cấp', 404);
    const row = await Supplier.findByPk(req.params.id);
    if (!row) throw bad('Không tìm thấy nhà cung cấp', 404);
    const values = supplierValues({ ...row.toJSON(), ...req.body });
    if ('is_active' in req.body) values.is_active = req.body.is_active === true;
    await row.update(values);
    res.status(200).json({ message: 'Đã lưu nhà cung cấp', data: row });
  } catch (error) { fail(res, error); }
};

// ---------------------------------------------------------------- Đơn đặt hàng (PO)
const poItemsWithRemain = (po) => (po.items || []).map((i) => ({ ...i, remaining: i.closed ? 0 : Math.max(Number(i.quantity) - Number(i.received_qty || 0), 0) }));

const sendPoEmail = async (po, supplier, { resend = false, authorization } = {}) => {
  const [clinic, names] = await Promise.all([clinicInfo(), staffNames([po.created_by], authorization)]);
  const items = po.items || [];
  const pdf = await renderPurchaseOrderPdf({
    code: po.code, created_at: po.createdAt, expected_date: po.expected_date, note: po.note, supplier: supplier.toJSON ? supplier.toJSON() : supplier,
    clinic, items, created_by_name: names[po.created_by],
  });
  const result = await sendEmailTo({
    template: 'PO_SENT', key: `PO_SENT:${po.id}${resend ? `:${Date.now()}` : ''}`, to_email: supplier.email, to_name: supplier.contact_name || supplier.name,
    data: {
      po_code: po.code, supplier_name: supplier.name, resend, expected_date: po.expected_date, note: po.note, delivery_address: clinic.address, contact_phone: clinic.hotline,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unit_cost: i.unit_cost })),
      total: items.reduce((s, i) => s + (Number(i.unit_cost) || 0) * Number(i.quantity), 0),
    },
    attachments: [{ filename: `${po.code}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  const status = result?.status === 'SENT' ? 'SENT' : result?.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED';
  await po.update({ email_status: status });
  return status;
};

// [MANAGER] Tạo đơn đặt hàng từ đề xuất đã duyệt { request_id, supplier_id, expected_date, note, items: [{ product_id, unit_cost }] }
exports.createPurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(String(req.body.request_id || ''))) throw bad('Chọn đề xuất nhập hàng');
    const request = await InventoryRequest.findByPk(req.body.request_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!request || request.type !== 'PURCHASE_ORDER') throw bad('Không tìm thấy đề xuất', 404);
    if (request.status !== 'APPROVED') throw bad('Chỉ đặt hàng cho đề xuất đã duyệt', 409);
    if (request.ordered_at) throw bad('Đề xuất này đã có đơn đặt hàng', 409);
    const supplier = UUID_RE.test(String(req.body.supplier_id || '')) && await Supplier.findByPk(req.body.supplier_id, { transaction: t });
    if (!supplier || !supplier.is_active) throw bad('Chọn nhà cung cấp đang hợp tác');
    const expected = req.body.expected_date || null;
    if (expected && (!isDate(expected) || expected < vnDate())) throw bad('Ngày giao mong muốn không hợp lệ');
    const costOf = Object.fromEntries((Array.isArray(req.body.items) ? req.body.items : []).map((i) => [i?.product_id, i?.unit_cost]));
    const products = await Product.findAll({ where: { id: (request.items || []).map((i) => i.product_id) }, attributes: ['id', 'type'], transaction: t });
    const typeOf = Object.fromEntries(products.map((p) => [p.id, p.type]));
    const items = (request.items || []).map((i) => {
      const c = costOf[i.product_id];
      const cost = c === '' || c === null || c === undefined ? null : Number(c);
      if (cost !== null && (!Number.isInteger(cost) || cost < 0 || cost > 1000000000)) throw bad(`${i.name}: đơn giá không hợp lệ`);
      return { product_id: i.product_id, name: i.name, type: typeOf[i.product_id] || 'PRODUCT', unit: i.unit || 'sản phẩm', quantity: Number(i.quantity), unit_cost: cost, received_qty: 0, closed: false };
    });
    if (!items.length) throw bad('Đề xuất không có sản phẩm');
    const po = await PurchaseOrder.create({
      code: await nextCode(PurchaseOrder, 'PO', t), request_id: request.id, supplier_id: supplier.id, status: 'SENT', items,
      expected_date: expected, note: text(req.body.note, 1000) || null, created_by: req.user.id,
    }, { transaction: t });
    await request.update({ ordered_at: new Date(), ordered_by: req.user.id, supplier: supplier.name, expected_date: expected }, { transaction: t });
    await t.commit();
    const emailStatus = await sendPoEmail(po, supplier, { authorization: req.headers.authorization }).catch((e) => { console.warn('[PO] gửi email lỗi:', e.message); return 'FAILED'; });
    res.status(201).json({
      message: emailStatus === 'SENT' ? `Đã tạo đơn ${po.code} và gửi email cho nhà cung cấp` : `Đã tạo đơn ${po.code}, gửi email chưa được (có thể gửi lại)`,
      data: po, email_status: emailStatus,
    });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// [MANAGER, SALES] Danh sách đơn đặt hàng (NVBH xem để nhận hàng)
exports.listPurchaseOrders = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status).split(',');
    if (!isManager(req)) where.status = { [Op.in]: ['SENT', 'PARTIAL'] };
    const rows = await PurchaseOrder.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
    const suppliers = await Supplier.findAll({ where: { id: [...new Set(rows.map((r) => r.supplier_id))] } });
    const supOf = Object.fromEntries(suppliers.map((s) => [s.id, s]));
    const pendingReview = new Set((await GoodsReceipt.findAll({ where: { status: 'PENDING_REVIEW' }, attributes: ['purchase_order_id'], raw: true })).map((r) => r.purchase_order_id));
    // Số công bố / số lưu hành để NVBH đối chiếu nhãn khi nhận hàng
    const ids = [...new Set(rows.flatMap((r) => (r.items || []).map((i) => i.product_id)))];
    const specs = await MaterialSpec.findAll({ where: { product_id: ids }, attributes: ['product_id', 'registration_no'], raw: true });
    const regOf = Object.fromEntries(specs.map((s) => [s.product_id, s.registration_no]));
    res.status(200).json({
      data: rows.map((r) => ({
        ...r.toJSON(), supplier: supOf[r.supplier_id] || null, has_pending_review: pendingReview.has(r.id),
        items: poItemsWithRemain(r).map((i) => ({ ...i, registration_no: regOf[i.product_id] || null })),
      })),
    });
  } catch (error) { fail(res, error); }
};

exports.purchaseOrderPdf = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy đơn', 404);
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) throw bad('Không tìm thấy đơn', 404);
    const [supplier, clinic, names] = await Promise.all([Supplier.findByPk(po.supplier_id), clinicInfo(), staffNames([po.created_by], req.headers.authorization)]);
    const pdf = await renderPurchaseOrderPdf({ code: po.code, created_at: po.createdAt, expected_date: po.expected_date, note: po.note, supplier: supplier?.toJSON() || {}, clinic, items: po.items || [], created_by_name: names[po.created_by] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${po.code}.pdf"`);
    res.send(pdf);
  } catch (error) { fail(res, error); }
};

exports.resendPurchaseOrder = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy đơn', 404);
    const po = await PurchaseOrder.findByPk(req.params.id);
    if (!po) throw bad('Không tìm thấy đơn', 404);
    if (!['SENT', 'PARTIAL'].includes(po.status)) throw bad('Đơn đã kết thúc, không gửi lại', 409);
    const supplier = await Supplier.findByPk(po.supplier_id);
    const status = await sendPoEmail(po, supplier, { resend: true, authorization: req.headers.authorization });
    res.status(200).json({ message: status === 'SENT' ? 'Đã gửi lại email cho nhà cung cấp' : 'Gửi email chưa được, kiểm tra cấu hình email / địa chỉ nhà cung cấp', email_status: status });
  } catch (error) { fail(res, error); }
};

// [MANAGER] Hủy đơn chưa nhận hàng lần nào { reason } => đề xuất quay về "đã duyệt, chưa đặt" để đặt lại nhà cung cấp khác
exports.cancelPurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy đơn', 404);
    const reason = text(req.body.reason, 500);
    if (reason.length < 5) throw bad('Ghi lý do hủy đơn (ít nhất 5 ký tự)');
    const po = await PurchaseOrder.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!po) throw bad('Không tìm thấy đơn', 404);
    if (po.status !== 'SENT') throw bad('Chỉ hủy được đơn chưa nhận hàng', 409);
    if (await GoodsReceipt.count({ where: { purchase_order_id: po.id }, transaction: t })) throw bad('Đơn đã có biên bản nhận hàng, không hủy được', 409);
    await po.update({ status: 'CANCELLED', cancelled_by: req.user.id, cancelled_at: new Date(), cancel_reason: reason }, { transaction: t });
    if (po.request_id) await InventoryRequest.update({ ordered_at: null, ordered_by: null, supplier: null, expected_date: null }, { where: { id: po.request_id }, transaction: t });
    await t.commit();
    const supplier = await Supplier.findByPk(po.supplier_id);
    if (supplier) sendEmailTo({ template: 'PO_CANCELLED', key: `PO_CANCELLED:${po.id}`, to_email: supplier.email, to_name: supplier.contact_name || supplier.name, data: { po_code: po.code, reason, sent_date: vnDate(po.createdAt).split('-').reverse().join('/') } }).catch(() => {});
    res.status(200).json({ message: 'Đã hủy đơn và báo nhà cung cấp' });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// ---------------------------------------------------------------- Nhận hàng (NVBH)
const CONDITIONS = {
  OK: 'Nguyên vẹn', DENTED: 'Móp / vỡ', LEAKING: 'Rò rỉ', SEAL_BROKEN: 'Mất niêm phong / seal', ODD: 'Đổi màu / mùi lạ',
  WRONG_ITEM: 'Sai sản phẩm / dung tích', TEMPERATURE: 'Bảo quản sai nhiệt độ',
};
const ISSUE_TEXT = (l) => ({
  SHORT: `Giao thiếu ${l.expected_qty - l.counted_qty}`, OVER: `Giao thừa ${l.counted_qty - l.expected_qty}`,
  SLIP_MISMATCH: `Phiếu giao ghi ${l.delivered_qty}, đếm được ${l.counted_qty}`,
  DEFECT: `${l.defect_qty} lỗi: ${CONDITIONS[l.condition] || 'hư hỏng'}`, LABEL: 'Thiếu / sai nhãn phụ tiếng Việt',
  REGISTRATION: 'Số công bố trên nhãn không khớp', SHORT_EXPIRY: `HSD ${l.expiry_date} còn dưới ${MIN_SHELF_MONTHS()} tháng`,
});
const problemText = (l) => (l.issues || []).map((c) => ISSUE_TEXT(l)[c]).join('; ');

// Ghi lô mới vào kho cho 1 dòng biên bản
const stockIn = async (line, qty, po, receipt, transaction) => {
  if (qty <= 0) return;
  const item = (po.items || []).find((i) => i.product_id === line.product_id) || {};
  const lot = await MaterialLot.create({
    product_id: line.product_id, lot_no: line.lot_no, manufacture_date: line.manufacture_date || null, expiry_date: line.expiry_date,
    quantity_received: qty, quantity_left: qty, unit_cost: item.unit_cost ?? null, purchase_request_id: po.request_id, purchase_order_id: po.id, receipt_id: receipt.id, supplier_id: po.supplier_id,
  }, { transaction });
  await Product.increment('stock_quantity', { by: qty, where: { id: line.product_id }, transaction });
  return lot;
};

// Cập nhật đơn đặt hàng sau khi nhập: số đã nhận, trạng thái; xong hết => đánh dấu đề xuất đã nhập kho
const settlePo = async (po, received, closed, userId, transaction) => {
  const items = (po.items || []).map((i) => ({
    ...i, received_qty: Number(i.received_qty || 0) + (received[i.product_id] || 0), closed: i.closed || Boolean(closed[i.product_id]),
  }));
  const done = items.every((i) => i.closed || i.received_qty >= Number(i.quantity));
  await po.update({ items, status: done ? 'RECEIVED' : 'PARTIAL', completed_at: done ? new Date() : null }, { transaction });
  if (done && po.request_id) {
    await InventoryRequest.update({ received_at: new Date(), received_by: userId }, { where: { id: po.request_id }, transaction });
  }
  return done;
};

// [SALES, MANAGER] POST /purchasing/orders/:id/receipts
// { lines: [{ product_id, delivered_qty, counted_qty, defect_qty, condition, lot_no, manufacture_date, expiry_date, label_ok, registration_ok, images, note }], delivery_images, note }
exports.receiveGoods = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy đơn', 404);
    const po = await PurchaseOrder.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!po) throw bad('Không tìm thấy đơn', 404);
    if (!['SENT', 'PARTIAL'].includes(po.status)) throw bad('Đơn này không còn chờ nhận hàng', 409);
    if (await GoodsReceipt.count({ where: { purchase_order_id: po.id, status: 'PENDING_REVIEW' }, transaction: t })) throw bad('Đơn có biên bản đang chờ quản lý kiểm tra, xử lý xong mới nhận tiếp', 409);
    const today = vnDate();
    const minExpiry = addMonths(today, MIN_SHELF_MONTHS());
    const input = Object.fromEntries((Array.isArray(req.body.lines) ? req.body.lines : []).map((l) => [l?.product_id, l]));
    const remain = poItemsWithRemain(po).filter((i) => i.remaining > 0);
    if (!remain.length) throw bad('Đơn đã nhận đủ hàng', 409);
    const lines = [];
    for (const i of remain) {
      const d = input[i.product_id];
      if (!d) throw bad(`Thiếu kết quả kiểm của ${i.name}`);
      const counted = int(d.counted_qty);
      const delivered = d.delivered_qty === '' || d.delivered_qty == null ? null : int(d.delivered_qty);
      const defect = int(d.defect_qty || 0);
      if (!Number.isInteger(counted) || counted < 0 || counted > MAX_QTY) throw bad(`${i.name}: nhập số đếm thực tế`);
      if (delivered !== null && (!Number.isInteger(delivered) || delivered < 0 || delivered > MAX_QTY)) throw bad(`${i.name}: số trên phiếu giao không hợp lệ`);
      if (!Number.isInteger(defect) || defect < 0 || defect > counted) throw bad(`${i.name}: số lỗi từ 0 đến số đếm được`);
      const condition = CONDITIONS[d.condition] ? d.condition : 'OK';
      if (defect > 0 && condition === 'OK') throw bad(`${i.name}: chọn tình trạng lỗi`);
      if (condition !== 'OK' && defect === 0) throw bad(`${i.name}: ghi số sản phẩm bị lỗi`);
      const images = (Array.isArray(d.images) ? d.images : []).filter((u) => /^https:\/\//.test(String(u))).slice(0, 6);
      if (condition !== 'OK' && !images.length) throw bad(`${i.name}: chụp ảnh sản phẩm lỗi`);
      const line = {
        product_id: i.product_id, name: i.name, type: i.type, unit: i.unit, expected_qty: i.remaining, delivered_qty: delivered, counted_qty: counted, defect_qty: defect, condition,
        lot_no: text(d.lot_no, 50), manufacture_date: d.manufacture_date || null, expiry_date: d.expiry_date || null,
        label_ok: d.label_ok !== false, registration_ok: i.type === 'PRODUCT' ? d.registration_ok !== false : true, images, note: text(d.note, 500), issues: [],
      };
      if (counted > 0) {
        if (!line.lot_no) throw bad(`${i.name}: nhập số lô`);
        if (!isDate(line.expiry_date)) throw bad(`${i.name}: nhập hạn sử dụng của lô`);
        if (i.type === 'PRODUCT' && !isDate(line.manufacture_date)) throw bad(`${i.name}: nhập ngày sản xuất của lô`);
        if (line.manufacture_date && (!isDate(line.manufacture_date) || line.manufacture_date > today || line.manufacture_date >= line.expiry_date)) throw bad(`${i.name}: ngày sản xuất không hợp lệ`);
        if (line.expiry_date <= today) throw bad(`${i.name}: lô đã hết hạn, không nhận hàng (ghi số đếm 0 và ghi chú để trả nhà cung cấp)`);
      }
      if (counted < line.expected_qty) line.issues.push('SHORT');
      if (counted > line.expected_qty) line.issues.push('OVER');
      if (delivered !== null && delivered !== counted) line.issues.push('SLIP_MISMATCH');
      if (defect > 0) line.issues.push('DEFECT');
      if (counted > 0 && !line.label_ok) line.issues.push('LABEL');
      if (counted > 0 && !line.registration_ok) line.issues.push('REGISTRATION');
      if (counted > 0 && line.expiry_date < minExpiry) line.issues.push('SHORT_EXPIRY');
      if (line.issues.length && line.note.length < 5 && !line.issues.every((c) => ['SHORT_EXPIRY'].includes(c))) {
        // Lệch / lỗi cần ghi chú ngắn cho quản lý (trừ trường hợp chỉ HSD ngắn đã thể hiện rõ)
        throw bad(`${i.name}: ghi chú chênh lệch / lỗi (ít nhất 5 ký tự)`);
      }
      line.problem = problemText(line);
      lines.push(line);
    }
    const hasIssue = lines.some((l) => l.issues.length);
    const receipt = await GoodsReceipt.create({
      code: await nextCode(GoodsReceipt, 'NH', t), purchase_order_id: po.id, status: hasIssue ? 'PENDING_REVIEW' : 'MATCHED', lines,
      delivery_images: (Array.isArray(req.body.delivery_images) ? req.body.delivery_images : []).filter((u) => /^https:\/\//.test(String(u))).slice(0, 6),
      note: text(req.body.note, 1000) || null, received_by: req.user.id,
    }, { transaction: t });
    // Dòng khớp: nhập kho ngay. Dòng lệch / lỗi: chờ quản lý
    const received = {};
    for (const l of lines) {
      if (l.issues.length) { l.stocked_qty = 0; continue; }
      await stockIn(l, l.counted_qty, po, receipt, t);
      l.stocked_qty = l.counted_qty;
      received[l.product_id] = l.counted_qty;
    }
    await receipt.update({ lines }, { transaction: t });
    const done = await settlePo(po, received, {}, req.user.id, t);
    await t.commit();

    const supplier = await Supplier.findByPk(po.supplier_id);
    if (hasIssue) {
      const names = await staffNames([req.user.id], req.headers.authorization);
      sendEmailTo({
        template: 'RECEIPT_REVIEW', key: `RECEIPT_REVIEW:${receipt.id}`, to_role: 'GEN_MANAGER',
        data: { receipt_code: receipt.code, po_code: po.code, supplier_name: supplier?.name, received_by_name: names[req.user.id], lines: lines.filter((l) => l.issues.length).map((l) => ({ name: l.name, problem: l.problem })) },
      }).catch(() => {});
    } else if (done && supplier) {
      sendReceivedEmail(po, receipt, supplier);
    }
    res.status(201).json({
      message: hasIssue ? `Đã lập biên bản ${receipt.code}. Có chênh lệch / lỗi, đã báo quản lý kiểm tra (dòng khớp đã nhập kho)` : `Đã nhập kho, biên bản ${receipt.code}`,
      data: receipt,
    });
  } catch (error) { await t.rollback(); fail(res, error); }
};

const sendReceivedEmail = async (po, receipt, supplier) => {
  const receipts = await GoodsReceipt.findAll({ where: { purchase_order_id: po.id }, attributes: ['lines'], raw: true });
  const items = receipts.flatMap((r) => (r.lines || []).filter((l) => l.stocked_qty > 0).map((l) => ({ name: l.name, quantity: l.stocked_qty, lot_no: l.lot_no, expiry_date: l.expiry_date })));
  return sendEmailTo({ template: 'PO_RECEIVED', key: `PO_RECEIVED:${po.id}`, to_email: supplier.email, to_name: supplier.contact_name || supplier.name, data: { po_code: po.code, receipt_code: receipt.code, items } }).catch(() => null);
};

exports.listReceipts = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = String(req.query.status).split(',');
    if (!isManager(req)) where.received_by = req.user.id;
    const rows = await GoodsReceipt.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
    const pos = await PurchaseOrder.findAll({ where: { id: [...new Set(rows.map((r) => r.purchase_order_id))] }, attributes: ['id', 'code', 'supplier_id'] });
    const sups = await Supplier.findAll({ where: { id: [...new Set(pos.map((p) => p.supplier_id))] }, attributes: ['id', 'name'] });
    const poOf = Object.fromEntries(pos.map((p) => [p.id, p]));
    const supOf = Object.fromEntries(sups.map((s) => [s.id, s.name]));
    const names = await staffNames(rows.flatMap((r) => [r.received_by, r.reviewed_by]), req.headers.authorization);
    res.status(200).json({
      data: rows.map((r) => ({
        ...r.toJSON(), po_code: poOf[r.purchase_order_id]?.code, supplier_name: supOf[poOf[r.purchase_order_id]?.supplier_id],
        received_by_name: names[r.received_by] || null, reviewed_by_name: names[r.reviewed_by] || null,
      })),
    });
  } catch (error) { fail(res, error); }
};

// [MANAGER] PUT /purchasing/receipts/:id/review — sau khi kiểm tra thực tế
// { checked: true, note, decisions: [{ product_id, accept_qty, reject_action: RETURN|DISPOSE, shortage_action: BACKORDER|CLOSE }] }
exports.reviewReceipt = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy biên bản', 404);
    const receipt = await GoodsReceipt.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!receipt) throw bad('Không tìm thấy biên bản', 404);
    if (receipt.status !== 'PENDING_REVIEW') throw bad('Biên bản đã được xử lý', 409);
    if (receipt.received_by === req.user.id) throw bad('Người nhận hàng không tự duyệt biên bản của mình', 403);
    if (req.body.checked !== true) throw bad('Xác nhận đã kiểm tra thực tế hàng hóa');
    const note = text(req.body.note, 1000);
    if (note.length < 10) throw bad('Ghi kết quả kiểm tra thực tế (ít nhất 10 ký tự)');
    const po = await PurchaseOrder.findByPk(receipt.purchase_order_id, { transaction: t, lock: t.LOCK.UPDATE });
    const decisionOf = Object.fromEntries((Array.isArray(req.body.decisions) ? req.body.decisions : []).map((d) => [d?.product_id, d]));
    const lines = receipt.lines.map((l) => ({ ...l }));
    const received = {};
    const closed = {};
    const issues = [];
    const backorder = [];
    const returns = [];
    let acceptedShort = false;
    for (const l of lines) {
      if (!l.issues?.length) continue;
      const d = decisionOf[l.product_id];
      if (!d) throw bad(`Chưa quyết định cho ${l.name}`);
      const accept = int(d.accept_qty);
      if (!Number.isInteger(accept) || accept < 0 || accept > l.counted_qty) throw bad(`${l.name}: số nhận kho từ 0 đến ${l.counted_qty}`);
      if (accept > 0 && (!l.lot_no || !isDate(l.expiry_date) || l.expiry_date <= vnDate())) throw bad(`${l.name}: lô không hợp lệ để nhập kho`);
      const rejected = l.counted_qty - accept;
      const rejectAction = rejected > 0 ? (d.reject_action === 'DISPOSE' ? 'DISPOSE' : 'RETURN') : null;
      const short = Math.max(l.expected_qty - accept, 0);
      const shortageAction = short > 0 ? (d.shortage_action === 'CLOSE' ? 'CLOSE' : 'BACKORDER') : null;
      // Hàng bị trả lại / hủy không tính vào số đã nhận => thiếu thì giao bù hoặc chốt thiếu
      if (accept > 0) await stockIn(l, accept, po, receipt, t);
      l.stocked_qty = accept;
      l.decision = { accept_qty: accept, rejected_qty: rejected, reject_action: rejectAction, shortage_qty: short, shortage_action: shortageAction, note: text(d.note, 300) };
      received[l.product_id] = accept;
      if (shortageAction === 'CLOSE') { closed[l.product_id] = true; acceptedShort = true; }
      issues.push({ name: l.name, problem: l.problem, quantity: rejected || short || '' });
      if (rejectAction === 'RETURN') returns.push({ name: l.name, quantity: rejected });
      if (shortageAction === 'BACKORDER') backorder.push({ name: l.name, quantity: short });
    }
    await receipt.update({ lines, status: 'REVIEWED', reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note }, { transaction: t });
    const done = await settlePo(po, received, closed, req.user.id, t);
    await t.commit();
    const supplier = await Supplier.findByPk(po.supplier_id);
    if (supplier) {
      await sendEmailTo({
        template: 'PO_ISSUE', key: `PO_ISSUE:${receipt.id}`, to_email: supplier.email, to_name: supplier.contact_name || supplier.name,
        data: { po_code: po.code, receipt_code: receipt.code, issues, backorder, returns, accepted_short: acceptedShort && !backorder.length, note: text(req.body.supplier_note, 500) || null },
      }).catch(() => null);
      if (done && !returns.length && !backorder.length && !acceptedShort) sendReceivedEmail(po, receipt, supplier);
    }
    res.status(200).json({ message: done ? 'Đã chốt biên bản, đơn đặt hàng hoàn tất' : 'Đã chốt biên bản, đơn chờ giao bù', data: receipt });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// ---------------------------------------------------------------- Kiểm kho tuần (mỹ phẩm)
const countableLots = async (transaction) => {
  const lots = await MaterialLot.findAll({
    where: { quantity_left: { [Op.gt]: 0 } }, include: [{ model: Product, attributes: ['id', 'name'], where: { type: 'PRODUCT' } }],
    order: [[Product, 'name', 'ASC'], ['expiry_date', 'ASC']], transaction,
  });
  return lots;
};

// [SALES, MANAGER] Danh sách lô cần đếm — KHÔNG kèm số trên hệ thống (kiểm kho "mù")
exports.stockCountTemplate = async (req, res) => {
  try {
    const lots = await countableLots();
    const week = isoWeek();
    const done = await StockCount.findOne({ where: { week }, order: [['createdAt', 'DESC']], attributes: ['code', 'status', 'createdAt'] });
    const products = await Product.findAll({ where: { type: 'PRODUCT' }, attributes: ['id', 'name'], order: [['name', 'ASC']] });
    res.status(200).json({
      week, this_week: done,
      data: lots.map((l) => ({ lot_id: l.id, product_id: l.product_id, name: l.Product.name, lot_no: l.lot_no, manufacture_date: l.manufacture_date, expiry_date: l.expiry_date, on_hold: Boolean(l.hold_reason) })),
      products: products.map((p) => ({ id: p.id, name: p.name })),
      conditions: CONDITIONS,
    });
  } catch (error) { fail(res, error); }
};

// [SALES, MANAGER] POST /purchasing/stock-counts { lines: [{ lot_id, counted_qty, defect_qty, condition, note, images }], extras: [{ product_id, lot_no, manufacture_date, expiry_date, counted_qty, note, images }], note }
exports.submitStockCount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const lots = await countableLots(t);
    const lotOf = Object.fromEntries(lots.map((l) => [l.id, l]));
    const input = Array.isArray(req.body.lines) ? req.body.lines : [];
    const seen = new Set();
    const lines = [];
    for (const d of input) {
      const lot = UUID_RE.test(String(d?.lot_id || '')) && (lotOf[d.lot_id] || await MaterialLot.findByPk(d.lot_id, { include: [{ model: Product, attributes: ['id', 'name', 'type'] }], transaction: t }));
      if (!lot || lot.Product?.type === 'MATERIAL' || seen.has(lot.id)) throw bad('Dòng kiểm kho không hợp lệ');
      seen.add(lot.id);
      const counted = int(d.counted_qty);
      const defect = int(d.defect_qty || 0);
      if (!Number.isInteger(counted) || counted < 0 || counted > MAX_QTY) throw bad(`${lot.Product.name} (lô ${lot.lot_no}): nhập số đếm thực tế`);
      if (!Number.isInteger(defect) || defect < 0 || defect > counted) throw bad(`${lot.Product.name} (lô ${lot.lot_no}): số lỗi từ 0 đến số đếm`);
      const condition = CONDITIONS[d.condition] ? d.condition : 'OK';
      const images = (Array.isArray(d.images) ? d.images : []).filter((u) => /^https:\/\//.test(String(u))).slice(0, 6);
      if (defect > 0 && (condition === 'OK' || !images.length)) throw bad(`${lot.Product.name} (lô ${lot.lot_no}): chọn tình trạng lỗi và chụp ảnh`);
      lines.push({
        product_id: lot.product_id, name: lot.Product.name, lot_id: lot.id, lot_no: lot.lot_no, expiry_date: lot.expiry_date, on_hold: Boolean(lot.hold_reason),
        system_qty: lot.quantity_left, counted_qty: counted, defect_qty: defect, condition, note: text(d.note, 300), images, extra: false,
      });
    }
    const missing = lots.filter((l) => !seen.has(l.id));
    if (missing.length) throw bad(`Còn ${missing.length} lô chưa đếm (vd ${missing[0].Product.name} - lô ${missing[0].lot_no})`);
    const productIds = new Set((await Product.findAll({ where: { type: 'PRODUCT' }, attributes: ['id'], raw: true, transaction: t })).map((p) => p.id));
    const names = Object.fromEntries((await Product.findAll({ where: { type: 'PRODUCT' }, attributes: ['id', 'name'], raw: true, transaction: t })).map((p) => [p.id, p.name]));
    for (const d of (Array.isArray(req.body.extras) ? req.body.extras : []).slice(0, 50)) {
      if (!productIds.has(d?.product_id)) throw bad('Hàng ngoài danh sách: chọn sản phẩm');
      const counted = int(d.counted_qty);
      if (!Number.isInteger(counted) || counted < 1 || counted > MAX_QTY) throw bad(`${names[d.product_id]}: số đếm phải lớn hơn 0`);
      if (!text(d.lot_no, 50) || !isDate(d.expiry_date)) throw bad(`${names[d.product_id]}: nhập số lô và hạn sử dụng của hàng ngoài danh sách`);
      lines.push({
        product_id: d.product_id, name: names[d.product_id], lot_id: null, lot_no: text(d.lot_no, 50), manufacture_date: isDate(d.manufacture_date) ? d.manufacture_date : null, expiry_date: d.expiry_date,
        on_hold: false, system_qty: 0, counted_qty: counted, defect_qty: 0, condition: 'OK', note: text(d.note, 300),
        images: (Array.isArray(d.images) ? d.images : []).filter((u) => /^https:\/\//.test(String(u))).slice(0, 6), extra: true,
      });
    }
    if (!lines.length) throw bad('Kho chưa có lô mỹ phẩm nào để kiểm');
    const diffs = lines.filter((l) => l.extra || l.counted_qty !== l.system_qty || l.defect_qty > 0);
    const row = await StockCount.create({
      code: await nextCode(StockCount, 'KK', t), week: isoWeek(), status: diffs.length ? 'PENDING_REVIEW' : 'MATCHED', lines,
      note: text(req.body.note, 1000) || null, counted_by: req.user.id,
    }, { transaction: t });
    await t.commit();
    if (diffs.length) {
      sendEmailTo({
        template: 'STOCK_COUNT_REVIEW', key: `STOCK_COUNT_REVIEW:${row.id}`, to_role: 'GEN_MANAGER',
        data: {
          count_code: row.code, week: row.week, diff_count: diffs.length,
          lines: diffs.map((l) => ({ name: l.name, lot_no: l.lot_no, problem: l.extra ? `Hàng ngoài danh sách: ${l.counted_qty}` : [l.counted_qty !== l.system_qty ? `${l.counted_qty - l.system_qty > 0 ? '+' : ''}${l.counted_qty - l.system_qty}` : null, l.defect_qty ? `${l.defect_qty} lỗi` : null].filter(Boolean).join(', ') })),
        },
      }).catch(() => {});
    }
    // NVBH không thấy số hệ thống, chỉ biết khớp hay cần quản lý kiểm tra
    res.status(201).json({ message: diffs.length ? `Đã gửi phiếu ${row.code}. Có ${diffs.length} dòng chênh lệch / lỗi, đã báo quản lý kiểm tra` : `Đã gửi phiếu ${row.code}, số đếm khớp hệ thống`, data: { id: row.id, code: row.code, status: row.status } });
  } catch (error) { await t.rollback(); fail(res, error); }
};

exports.listStockCounts = async (req, res) => {
  try {
    const rows = await StockCount.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
    const names = await staffNames(rows.flatMap((r) => [r.counted_by, r.reviewed_by]), req.headers.authorization);
    const manager = isManager(req);
    res.status(200).json({
      data: rows.map((r) => {
        const j = r.toJSON();
        // NVBH không xem số trên hệ thống (tránh đếm theo số có sẵn ở lần sau)
        const lines = manager ? j.lines : j.lines.map(({ system_qty, final_qty, ...l }) => l);
        return { ...j, lines, diff_count: j.lines.filter((l) => l.extra || l.counted_qty !== l.system_qty || l.defect_qty > 0).length, counted_by_name: names[j.counted_by] || null, reviewed_by_name: names[j.reviewed_by] || null };
      }),
    });
  } catch (error) { fail(res, error); }
};

// [MANAGER] PUT /purchasing/stock-counts/:id/review { checked: true, note, finals: [{ index, final_qty }] }
// final_qty: số còn bán được sau khi quản lý đếm lại (hàng lỗi bị loại thì không tính). Chênh lệch so với số hệ thống lúc đếm
// được cộng / trừ vào lô (đã tính cả hàng bán ra trong lúc chờ duyệt), có phiếu điều chỉnh.
exports.reviewStockCount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy phiếu', 404);
    const row = await StockCount.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!row) throw bad('Không tìm thấy phiếu', 404);
    if (row.status !== 'PENDING_REVIEW') throw bad('Phiếu đã được xử lý', 409);
    if (row.counted_by === req.user.id) throw bad('Người đếm không tự duyệt phiếu kiểm kho của mình', 403);
    if (req.body.checked !== true) throw bad('Xác nhận đã đếm lại thực tế');
    const note = text(req.body.note, 1000);
    if (note.length < 10) throw bad('Ghi kết quả đếm lại / nguyên nhân chênh lệch (ít nhất 10 ký tự)');
    const finalOf = Object.fromEntries((Array.isArray(req.body.finals) ? req.body.finals : []).map((f) => [Number(f?.index), int(f?.final_qty)]));
    const lines = row.lines.map((l) => ({ ...l }));
    let changed = 0;
    for (const [idx, l] of lines.entries()) {
      const needs = l.extra || l.counted_qty !== l.system_qty || l.defect_qty > 0;
      const final = idx in finalOf ? finalOf[idx] : (needs ? NaN : l.system_qty);
      if (!Number.isInteger(final) || final < 0 || final > MAX_QTY) throw bad(`${l.name} (lô ${l.lot_no}): nhập số chốt sau khi đếm lại`);
      l.final_qty = final;
      const delta = final - l.system_qty;
      if (!delta) continue;
      const reason = `Kiểm kho ${row.code}: ${note}`.slice(0, 500);
      if (l.extra) {
        const sellable = l.expiry_date > vnDate();
        const lot = await MaterialLot.create({ product_id: l.product_id, lot_no: l.lot_no, manufacture_date: l.manufacture_date || null, expiry_date: l.expiry_date, quantity_received: final, quantity_left: final, ...(sellable ? {} : { hold_reason: 'EXPIRED', hold_at: new Date() }) }, { transaction: t });
        if (sellable) await Product.increment('stock_quantity', { by: final, where: { id: l.product_id }, transaction: t });
        await StockAdjustment.create({ product_id: l.product_id, lot_id: lot.id, lot_no: lot.lot_no, quantity_before: 0, quantity_after: final, reason, adjusted_by: req.user.id }, { transaction: t });
        l.lot_id = lot.id;
      } else {
        const lot = await MaterialLot.findByPk(l.lot_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!lot) throw bad(`Không còn lô ${l.lot_no}`);
        const after = Math.max(lot.quantity_left + delta, 0);
        const applied = after - lot.quantity_left;
        await StockAdjustment.create({ product_id: lot.product_id, lot_id: lot.id, lot_no: lot.lot_no, quantity_before: lot.quantity_left, quantity_after: after, reason, adjusted_by: req.user.id }, { transaction: t });
        await lot.update({ quantity_left: after }, { transaction: t });
        if (!lot.hold_reason && lot.expiry_date >= vnDate() && applied) {
          await Product.update({ stock_quantity: sequelize.literal(`GREATEST(stock_quantity + (${applied}), 0)`) }, { where: { id: lot.product_id }, transaction: t });
        }
      }
      changed += 1;
    }
    await row.update({ lines, status: 'REVIEWED', reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: changed ? `Đã chốt phiếu, điều chỉnh ${changed} lô` : 'Đã chốt phiếu, số chốt khớp hệ thống' });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// ---------------------------------------------------------------- Lô hàng
// [MANAGER] Hủy hàng của lô đã hết hạn { reason }
exports.disposeLot = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy lô', 404);
    const reason = text(req.body.reason, 500);
    if (reason.length < 10) throw bad('Ghi lý do / biên bản hủy hàng (ít nhất 10 ký tự)');
    await disposeHeldLot(req.params.id, req.user.id, reason);
    res.status(200).json({ message: 'Đã ghi nhận hủy hàng' });
  } catch (error) { fail(res, error); }
};

// [MANAGER] Các lô của 1 sản phẩm (kể cả đã hết hàng gần đây) + lịch sử điều chỉnh
exports.productLots = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy sản phẩm', 404);
    const [lots, adjustments, suppliers] = await Promise.all([
      MaterialLot.findAll({ where: { product_id: req.params.id }, order: [['expiry_date', 'ASC'], ['createdAt', 'ASC']], limit: 100 }),
      StockAdjustment.findAll({ where: { product_id: req.params.id }, order: [['createdAt', 'DESC']], limit: 50 }),
      Supplier.findAll({ attributes: ['id', 'name'], raw: true }),
    ]);
    const supOf = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
    const today = vnDate();
    res.status(200).json({ data: lots.map((l) => ({ ...l.toJSON(), supplier_name: supOf[l.supplier_id] || null, expired: l.expiry_date < today, sellable: !l.hold_reason && l.expiry_date >= today && l.quantity_left > 0 })), adjustments });
  } catch (error) { fail(res, error); }
};

module.exports.isoWeek = isoWeek;
module.exports.CONDITIONS = CONDITIONS;
