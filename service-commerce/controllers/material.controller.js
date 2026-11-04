const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize, Product, MaterialSpec, MaterialNorm, InventoryRequest } = require('../models');

// ==========================================
// VẬT TƯ NỘI BỘ: định mức theo dịch vụ / gói, KTV ghi số thực dùng => tự trừ kho,
// cảnh báo sớm khi sắp hết (dưới tồn tối thiểu hoặc không đủ cho lịch 14 ngày tới) => tự tạo đề xuất nhập hàng
// ==========================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_TYPES = ['SERVICE', 'PACKAGE'];
const REFERENCE_TYPES = ['TREATMENT_SESSION', 'SERVICE_SESSION'];
const DEMAND_DAYS = 14;   // dự báo nhu cầu theo lịch đã đặt trong 14 ngày tới
const USAGE_WINDOW = 30;  // tốc độ dùng trung bình tính trên 30 ngày gần nhất
const MAX_QTY = 10000;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const fail = (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });

const materialInclude = [{ model: MaterialSpec }];
const toItem = (p) => ({
  id: p.id, name: p.name, price: Number(p.price), stock: p.stock_quantity, image_url: p.image_url,
  unit: p.MaterialSpec?.unit || '', pack_size: p.MaterialSpec?.pack_size || 1, pack_label: p.MaterialSpec?.pack_label || '',
  origin: p.MaterialSpec?.origin || '', manufacturer: p.MaterialSpec?.manufacturer || '', supplier: p.MaterialSpec?.supplier || '',
  registration_no: p.MaterialSpec?.registration_no || '', source_url: p.MaterialSpec?.source_url || '',
  min_stock: p.MaterialSpec?.min_stock || 0,
});

// Số buổi đã đặt trong N ngày tới theo dịch vụ / gói (service-booking). Lỗi thì coi như chưa có lịch.
const fetchUpcomingDemand = async (authorization) => {
  try {
    const r = await axios.get('http://localhost:4000/api/booking/sessions/upcoming-demand', {
      params: { days: DEMAND_DAYS }, headers: { Authorization: authorization }, timeout: 5000,
    });
    return r.data.data || { SERVICE: {}, PACKAGE: {} };
  } catch (e) {
    console.warn('Không lấy được lịch sắp tới từ service-booking:', e.message);
    return null;
  }
};

// Nhu cầu vật tư = Σ (định mức × số buổi đã đặt) theo từng vật tư
const demandByProduct = async (sessions) => {
  const result = {};
  if (!sessions) return result;
  const norms = await MaterialNorm.findAll({ raw: true });
  norms.forEach((n) => {
    const count = Number(sessions[n.target_type]?.[n.target_id] || 0);
    if (count) result[n.product_id] = (result[n.product_id] || 0) + n.quantity * count;
  });
  return result;
};

// Tổng đã dùng trong USAGE_WINDOW ngày gần nhất theo vật tư
const usageByProduct = async () => {
  const since = new Date(Date.now() - USAGE_WINDOW * 86400000);
  const rows = await InventoryRequest.findAll({ where: { type: 'MATERIAL_USAGE', createdAt: { [Op.gte]: since } }, attributes: ['items'], raw: true });
  const used = {};
  rows.forEach((r) => (r.items || []).forEach((i) => { used[i.product_id] = (used[i.product_id] || 0) + Number(i.deducted || 0); }));
  return used;
};

// Đánh giá tình trạng tồn kho 1 vật tư
const assess = (item, demand, used30) => {
  const avgDaily = used30 / USAGE_WINDOW;
  const daysLeft = avgDaily > 0 ? Math.floor(item.stock / avgDaily) : null;
  let status = 'OK';
  if (item.stock <= 0) status = 'OUT';
  else if (item.stock <= item.min_stock) status = 'LOW';
  else if (item.stock - demand < item.min_stock) status = 'SHORT'; // đủ hôm nay nhưng không đủ cho lịch 14 ngày tới
  // Gợi ý nhập: đủ cho lịch sắp tới + giữ lại gấp đôi tồn tối thiểu, làm tròn lên theo quy cách nhập
  const need = Math.max(0, item.min_stock * 2 + demand - item.stock);
  const suggestedPacks = status === 'OK' ? 0 : Math.ceil(need / (item.pack_size || 1));
  return { demand_14d: demand, used_30d: used30, avg_daily: Math.round(avgDaily * 10) / 10, days_left: daysLeft, status, suggested_packs: suggestedPacks };
};

// Vật tư đang có đề xuất nhập chờ duyệt
const pendingPurchaseProducts = async (transaction) => {
  const rows = await InventoryRequest.findAll({ where: { type: 'PURCHASE_ORDER', status: 'PENDING' }, attributes: ['items'], raw: true, transaction });
  return new Set(rows.flatMap((r) => (r.items || []).map((i) => i.product_id)));
};

// [ADMIN/GEN_MANAGER/TECHNICIAN] Danh sách vật tư + tình trạng tồn kho (quản lý có thêm dự báo theo lịch sắp tới)
exports.listMaterials = async (req, res) => {
  try {
    const products = await Product.findAll({ where: { type: 'MATERIAL' }, include: materialInclude, order: [['name', 'ASC']] });
    const isManager = ['ADMIN', 'GEN_MANAGER'].includes(req.user.role);
    const [sessions, used, pending] = isManager
      ? await Promise.all([fetchUpcomingDemand(req.headers.authorization), usageByProduct(), pendingPurchaseProducts()])
      : [null, {}, new Set()];
    const demand = await demandByProduct(sessions);
    const data = products.map((p) => {
      const item = toItem(p);
      return { ...item, ...assess(item, demand[p.id] || 0, used[p.id] || 0), purchase_pending: pending.has(p.id) };
    });
    res.status(200).json({ data, demand_available: Boolean(sessions), demand_days: DEMAND_DAYS });
  } catch (error) { fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Cập nhật thông tin vật tư (đơn vị, quy cách, nguồn gốc, tồn tối thiểu)
const TEXT_LIMITS = { unit: 20, pack_label: 60, origin: 100, manufacturer: 200, supplier: 200, registration_no: 100, source_url: 500 };
exports.upsertSpec = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) throw bad('Không tìm thấy vật tư', 404);
    const product = await Product.findByPk(req.params.id);
    if (!product || product.type !== 'MATERIAL') throw bad('Chỉ khai báo cho vật tư nội bộ (MATERIAL)', 404);
    const values = {};
    for (const [k, max] of Object.entries(TEXT_LIMITS)) {
      if (!(k in req.body)) continue;
      const v = String(req.body[k] ?? '').trim();
      if (v.length > max) throw bad(`${k} tối đa ${max} ký tự`);
      values[k] = v || null;
    }
    if ('source_url' in values && values.source_url && !/^https?:\/\//i.test(values.source_url)) throw bad('Link nguồn phải bắt đầu bằng http(s)://');
    for (const k of ['pack_size', 'min_stock']) {
      if (!(k in req.body)) continue;
      const n = Number(req.body[k]);
      if (!Number.isInteger(n) || n < (k === 'pack_size' ? 1 : 0) || n > 1000000) throw bad(`${k} không hợp lệ`);
      values[k] = n;
    }
    const existing = await MaterialSpec.findOne({ where: { product_id: product.id } });
    if (!existing && !values.unit) throw bad('Cần đơn vị tính');
    if (existing && 'unit' in values && !values.unit) throw bad('Cần đơn vị tính');
    const spec = existing ? await existing.update(values) : await MaterialSpec.create({ ...values, product_id: product.id });
    res.status(200).json({ message: 'Đã lưu thông tin vật tư', data: spec });
  } catch (error) { fail(res, error); }
};

// [TECHNICIAN/ADMIN/GEN_MANAGER] Định mức của 1 dịch vụ / gói (kèm tồn kho) => form ghi vật tư khi hoàn thành buổi
exports.getNorms = async (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (!TARGET_TYPES.includes(target_type) || !UUID_RE.test(String(target_id || ''))) throw bad('Thiếu dịch vụ / gói');
    const norms = await MaterialNorm.findAll({ where: { target_type, target_id }, include: [{ model: Product, include: materialInclude }] });
    res.status(200).json({
      data: norms.filter((n) => n.Product).map((n) => ({ product_id: n.product_id, quantity: n.quantity, ...toItem(n.Product), id: undefined })),
    });
  } catch (error) { fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Toàn bộ định mức, gom theo dịch vụ / gói
exports.listAllNorms = async (req, res) => {
  try {
    const norms = await MaterialNorm.findAll({ include: [{ model: Product, include: materialInclude }], order: [['target_name', 'ASC']] });
    const groups = {};
    norms.filter((n) => n.Product).forEach((n) => {
      const key = `${n.target_type}:${n.target_id}`;
      groups[key] = groups[key] || { target_type: n.target_type, target_id: n.target_id, target_name: n.target_name, items: [] };
      groups[key].items.push({ product_id: n.product_id, name: n.Product.name, unit: n.Product.MaterialSpec?.unit || '', quantity: n.quantity });
    });
    res.status(200).json({ data: Object.values(groups) });
  } catch (error) { fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Lưu định mức của 1 dịch vụ / gói (thay toàn bộ danh sách)
exports.saveNorms = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { target_type, target_id } = req.body;
    const target_name = String(req.body.target_name || '').trim().slice(0, 255);
    if (!TARGET_TYPES.includes(target_type) || !UUID_RE.test(String(target_id || ''))) throw bad('Thiếu dịch vụ / gói');
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const qty = {};
    for (const i of items) {
      const q = Number(i?.quantity);
      if (!UUID_RE.test(String(i?.product_id || '')) || !Number.isInteger(q) || q < 1 || q > MAX_QTY) throw bad('Vật tư hoặc định mức không hợp lệ (số nguyên từ 1)');
      qty[i.product_id] = q;
    }
    const ids = Object.keys(qty);
    const count = ids.length ? await Product.count({ where: { id: ids, type: 'MATERIAL' }, transaction: t }) : 0;
    if (count !== ids.length) throw bad('Có vật tư không tồn tại');
    await MaterialNorm.destroy({ where: { target_type, target_id }, transaction: t });
    await MaterialNorm.bulkCreate(ids.map((product_id) => ({ target_type, target_id, target_name, product_id, quantity: qty[product_id] })), { transaction: t });
    await t.commit();
    res.status(200).json({ message: 'Đã lưu định mức' });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// Tự tạo đề xuất nhập hàng cho vật tư đã xuống dưới tồn tối thiểu (mỗi vật tư chỉ 1 đề xuất đang chờ duyệt)
const autoPurchaseRequests = async (productIds, requesterId) => {
  const products = await Product.findAll({ where: { id: productIds, type: 'MATERIAL' }, include: materialInclude });
  const low = products.map(toItem).filter((m) => m.stock <= m.min_stock);
  if (!low.length) return [];
  const pending = await pendingPurchaseProducts();
  const fresh = low.filter((m) => !pending.has(m.id));
  if (!fresh.length) return low;
  await InventoryRequest.create({
    requester_id: requesterId,
    type: 'PURCHASE_ORDER',
    status: 'PENDING',
    reason: `Tự động: ${fresh.length} vật tư xuống dưới mức tồn tối thiểu`,
    items: fresh.map((m) => {
      const packs = Math.max(1, Math.ceil((m.min_stock * 2 - m.stock) / (m.pack_size || 1)));
      return { product_id: m.id, name: m.name, unit: m.unit, stock: m.stock, min_stock: m.min_stock, pack_label: m.pack_label, pack_size: m.pack_size, packs, quantity: packs * (m.pack_size || 1), auto: true };
    }),
  });
  return low;
};

// [TECHNICIAN] Ghi vật tư đã dùng cho 1 buổi => trừ kho (service-booking gọi khi KTV bấm hoàn thành buổi)
// Kho không đủ: vẫn ghi nhận buổi đã làm, trừ về 0 và ghi rõ phần thiếu để quản lý kiểm kê
exports.recordUsage = async (req, res) => {
  const { reference_type, reference_id, target_type, target_id } = req.body;
  const target_name = String(req.body.target_name || '').trim().slice(0, 255);
  const qty = {}; // product_id -> số lượng thực dùng (> 0)
  try {
    if (!REFERENCE_TYPES.includes(reference_type) || !UUID_RE.test(String(reference_id || ''))) throw bad('Thiếu buổi trị liệu');
    if (!TARGET_TYPES.includes(target_type) || !UUID_RE.test(String(target_id || ''))) throw bad('Thiếu dịch vụ / gói');
    for (const i of (Array.isArray(req.body.items) ? req.body.items : [])) {
      const q = Number(i?.quantity);
      if (!UUID_RE.test(String(i?.product_id || '')) || !Number.isInteger(q) || q < 0 || q > MAX_QTY) throw bad('Số lượng vật tư không hợp lệ (số nguyên, không âm)');
      if (q > 0) qty[i.product_id] = (qty[i.product_id] || 0) + q;
    }
    const existing = await InventoryRequest.findOne({ where: { type: 'MATERIAL_USAGE', reference_type, reference_id } });
    if (existing) return res.status(200).json({ message: 'Buổi này đã ghi vật tư trước đó', data: existing, already: true });
    if (!Object.keys(qty).length) return res.status(200).json({ message: 'Không có vật tư nào được ghi', data: null });
  } catch (error) { return fail(res, error); }

  const ids = Object.keys(qty);
  const t = await sequelize.transaction();
  try {
    // Khoá các dòng vật tư để 2 buổi hoàn thành cùng lúc không trừ sai tồn kho
    const products = await Product.findAll({ where: { id: ids, type: 'MATERIAL' }, include: materialInclude, transaction: t, lock: { level: t.LOCK.UPDATE, of: Product } });
    if (products.length !== ids.length) throw bad('Có vật tư không tồn tại');
    const norms = await MaterialNorm.findAll({ where: { target_type, target_id }, raw: true, transaction: t });
    const normOf = Object.fromEntries(norms.map((n) => [n.product_id, n.quantity]));

    const items = [];
    for (const p of products) {
      const used = qty[p.id];
      const deducted = Math.min(used, Math.max(p.stock_quantity, 0));
      await p.update({ stock_quantity: p.stock_quantity - deducted }, { transaction: t });
      const norm = normOf[p.id] ?? null;
      items.push({
        product_id: p.id, name: p.name, unit: p.MaterialSpec?.unit || '', quantity: used, deducted, shortage: used - deducted,
        norm, over_norm: norm !== null && used > norm, stock_after: p.stock_quantity,
      });
    }
    const usage = await InventoryRequest.create({
      requester_id: req.user.id, type: 'MATERIAL_USAGE', status: 'APPROVED', items,
      reason: `Buổi: ${target_name || target_type}`, reference_type, reference_id,
    }, { transaction: t });
    await t.commit();

    const low = await autoPurchaseRequests(ids, req.user.id).catch((e) => { console.error('Lỗi tạo đề xuất nhập:', e.message); return []; });
    const shortages = items.filter((i) => i.shortage > 0);
    res.status(201).json({
      message: shortages.length ? 'Đã ghi vật tư; một số vật tư không đủ trong kho, quản lý cần kiểm kê' : 'Đã ghi vật tư và trừ kho',
      data: usage, shortages, low_stock: low.map((m) => ({ id: m.id, name: m.name, stock: m.stock, unit: m.unit, min_stock: m.min_stock })),
    });
  } catch (error) {
    await t.rollback();
    // 2 yêu cầu cùng buổi gửi đồng thời: unique index chặn bản ghi thứ 2
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(200).json({ message: 'Buổi này đã ghi vật tư trước đó', already: true });
    fail(res, error);
  }
};

// [ADMIN/GEN_MANAGER] Lịch sử xuất vật tư + thống kê theo vật tư (thực dùng so với định mức)
exports.listUsage = async (req, res) => {
  try {
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : new Date();
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00`) : new Date(to.getTime() - 30 * 86400000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw bad('Khoảng ngày không hợp lệ');
    const rows = await InventoryRequest.findAll({
      where: { type: 'MATERIAL_USAGE', createdAt: { [Op.between]: [from, to] } }, order: [['createdAt', 'DESC']], limit: 1000, raw: true,
    });
    // Tên KTV (service-identity); lỗi thì để trống
    let names = {};
    try {
      const r = await axios.get('http://localhost:4000/api/identity/users/employees', { headers: { Authorization: req.headers.authorization }, timeout: 5000 });
      names = Object.fromEntries((r.data.data || []).map((u) => [u.id, u.Profile?.full_name || u.full_name || u.email]));
    } catch { /* bỏ qua */ }

    const summary = {};
    rows.forEach((r) => (r.items || []).forEach((i) => {
      const s = summary[i.product_id] || (summary[i.product_id] = { product_id: i.product_id, name: i.name, unit: i.unit, used: 0, norm_total: 0, sessions: 0, over_sessions: 0, shortage: 0 });
      s.used += Number(i.quantity || 0);
      s.norm_total += Number(i.norm || 0);
      s.sessions += 1;
      if (i.over_norm) s.over_sessions += 1;
      s.shortage += Number(i.shortage || 0);
    }));
    res.status(200).json({
      data: rows.map((r) => ({ ...r, requester_name: names[r.requester_id] || null, over_norm: (r.items || []).some((i) => i.over_norm), shortage: (r.items || []).some((i) => i.shortage > 0) })),
      summary: Object.values(summary).sort((a, b) => b.used - a.used),
      from, to,
    });
  } catch (error) { fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Đề xuất nhập hàng (tự động khi xuống dưới tồn tối thiểu hoặc do quản lý tạo)
exports.listPurchaseRequests = async (req, res) => {
  try {
    const rows = await InventoryRequest.findAll({ where: { type: 'PURCHASE_ORDER' }, order: [['createdAt', 'DESC']], limit: 200 });
    res.status(200).json({ data: rows });
  } catch (error) { fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Tạo đề xuất nhập hàng thủ công (vd từ cảnh báo "không đủ cho lịch 14 ngày tới")
exports.createPurchaseRequest = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim().slice(0, 255) || 'Đề xuất nhập vật tư';
    const packs = {};
    for (const i of (Array.isArray(req.body.items) ? req.body.items : [])) {
      const n = Number(i?.packs);
      if (!UUID_RE.test(String(i?.product_id || '')) || !Number.isInteger(n) || n < 1 || n > 10000) throw bad('Số lượng nhập không hợp lệ');
      packs[i.product_id] = n;
    }
    const ids = Object.keys(packs);
    if (!ids.length) throw bad('Chưa chọn vật tư cần nhập');
    const products = await Product.findAll({ where: { id: ids }, include: materialInclude });
    if (products.length !== ids.length) throw bad('Có sản phẩm / vật tư không tồn tại');
    const row = await InventoryRequest.create({
      requester_id: req.user.id, type: 'PURCHASE_ORDER', status: 'PENDING', reason,
      items: products.map((p) => ({ ...toItem(p), unit: p.MaterialSpec?.unit || 'sản phẩm', pack_label: p.MaterialSpec?.pack_label || '1 sản phẩm', type: p.type })).map((m) => ({
        product_id: m.id, name: m.name, unit: m.unit, stock: m.stock, min_stock: m.min_stock, pack_label: m.pack_label, pack_size: m.pack_size,
        packs: packs[m.id], quantity: packs[m.id] * (m.pack_size || 1),
      })),
    });
    res.status(201).json({ message: 'Đã tạo đề xuất nhập hàng', data: row });
  } catch (error) { fail(res, error); }
};

// ---------- Duyệt đề xuất nhập hàng: PENDING -> APPROVED / REJECTED -> (APPROVED) xác nhận hàng về kho ----------
const findRequest = async (id, transaction) => {
  if (!UUID_RE.test(String(id || ''))) throw bad('Không tìm thấy đề xuất', 404);
  const row = await InventoryRequest.findByPk(id, { transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });
  if (!row || row.type !== 'PURCHASE_ORDER') throw bad('Không tìm thấy đề xuất', 404);
  return row;
};

// [ADMIN/GEN_MANAGER] Duyệt (có thể chỉnh số quy cách cần nhập) hoặc từ chối (bắt buộc lý do)
exports.decidePurchaseRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const row = await findRequest(req.params.id, t);
    if (row.status !== 'PENDING') throw bad('Đề xuất đã được xử lý', 409);
    const approve = req.body.decision === 'APPROVE';
    if (!approve && req.body.decision !== 'REJECT') throw bad('Quyết định không hợp lệ');
    const note = String(req.body.note || '').trim().slice(0, 1000);
    if (!approve && !note) throw bad('Cần ghi lý do từ chối');
    let items = row.items || [];
    if (approve && Array.isArray(req.body.items)) {
      const packs = Object.fromEntries(req.body.items.map((i) => [i.product_id, Number(i.packs)]));
      items = items.map((i) => {
        if (!(i.product_id in packs)) return i;
        const n = packs[i.product_id];
        if (!Number.isInteger(n) || n < 1 || n > 10000) throw bad('Số lượng duyệt không hợp lệ');
        return { ...i, packs: n, quantity: n * (i.pack_size || 1) };
      });
    }
    await row.update({ status: approve ? 'APPROVED' : 'REJECTED', approver_id: req.user.id, decision_note: note || null, decided_at: new Date(), items }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: approve ? 'Đã duyệt đề xuất nhập hàng' : 'Đã từ chối đề xuất', data: row });
  } catch (error) { await t.rollback(); fail(res, error); }
};

// [ADMIN/GEN_MANAGER] Xác nhận hàng đã về kho => cộng tồn kho theo số lượng đã duyệt (chỉ 1 lần)
exports.receivePurchaseRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const row = await findRequest(req.params.id, t);
    if (row.status !== 'APPROVED') throw bad('Chỉ nhận hàng cho đề xuất đã duyệt', 409);
    if (row.received_at) throw bad('Đề xuất này đã nhập kho', 409);
    for (const i of row.items || []) {
      await Product.increment('stock_quantity', { by: Number(i.quantity || 0), where: { id: i.product_id }, transaction: t });
    }
    await row.update({ received_at: new Date(), received_by: req.user.id }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: 'Đã nhập kho', data: row });
  } catch (error) { await t.rollback(); fail(res, error); }
};
