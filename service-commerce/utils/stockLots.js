// Tồn kho mỹ phẩm theo lô. Product.stock_quantity = tổng số còn bán được (các lô chưa hết hạn, không bị tách riêng).
// Bán (web, tại quầy, đổi hàng): trừ lô hết hạn trước bán trước (FEFO), ghi lại lô đã xuất vào OrderDetail.lot_allocations.
// Hủy đơn / nhập lại hàng trả: cộng lại đúng lô đã xuất. Lô hết hạn: tách khỏi hàng bán, chờ quản lý hủy.
// Vật tư (MATERIAL) vẫn dùng cách tính riêng trong material.controller (hạn dùng loại trừ khi xem).
const { Op } = require('sequelize');
const { sequelize, Product, MaterialLot, StockAdjustment } = require('../models');

const OPENING_LOT_NO = 'TON-DAU-KY';
const RETURN_LOT_NO = 'HANG-TRA-LAI';
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
const vnDate = (d = new Date()) => new Date(new Date(d).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Lô đang bán được của 1 sản phẩm, theo thứ tự xuất (hết hạn trước, nhập trước)
const sellableLots = (productId, transaction, lock = false) => MaterialLot.findAll({
  where: { product_id: productId, quantity_left: { [Op.gt]: 0 }, hold_reason: null, expiry_date: { [Op.gte]: vnDate() } },
  order: [['expiry_date', 'ASC'], ['createdAt', 'ASC']],
  transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
});

// Trừ kho 1 mỹ phẩm (có điều kiện, không để âm) + chọn lô theo FEFO. Trả [{ lot_id, lot_no, expiry_date, quantity }]
// Vật tư hoặc sản phẩm chưa có lô nào (dữ liệu rất cũ): chỉ trừ tổng như trước.
const takeStock = async (product, quantity, transaction) => {
  const qty = Number(quantity);
  const [affected] = await Product.update(
    { stock_quantity: sequelize.literal(`stock_quantity - ${qty}`) },
    { where: { id: product.id, stock_quantity: { [Op.gte]: qty } }, transaction },
  );
  if (!affected) throw bad(`Sản phẩm ${product.name} không đủ hàng trong kho (còn ${product.stock_quantity || 0})`, 409);
  if (product.type === 'MATERIAL') return [];
  const lots = await sellableLots(product.id, transaction, true);
  if (!lots.length) return [];
  let rest = qty;
  const taken = [];
  for (const lot of lots) {
    if (rest <= 0) break;
    const n = Math.min(rest, lot.quantity_left);
    await lot.update({ quantity_left: lot.quantity_left - n }, { transaction });
    taken.push({ lot_id: lot.id, lot_no: lot.lot_no, expiry_date: lot.expiry_date, quantity: n });
    rest -= n;
  }
  if (rest > 0) throw bad(`Sản phẩm ${product.name} không đủ hàng còn hạn sử dụng`, 409);
  return taken;
};

// Cộng lại kho cho 1 mỹ phẩm: trả về đúng các lô đã xuất (nếu biết), phần còn lại vào lô còn hạn xa nhất
const putBack = async (productId, quantity, allocations, transaction) => {
  const qty = Number(quantity);
  if (!qty) return;
  await Product.increment('stock_quantity', { by: qty, where: { id: productId }, transaction });
  const product = await Product.findByPk(productId, { attributes: ['id', 'type', 'end_date', 'start_date'], transaction });
  if (!product || product.type === 'MATERIAL') return;
  let rest = qty;
  for (const a of Array.isArray(allocations) ? allocations : []) {
    if (rest <= 0) break;
    const lot = await MaterialLot.findByPk(a.lot_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lot || lot.product_id !== productId) continue;
    const n = Math.min(rest, Number(a.quantity) || 0);
    if (!n) continue;
    // Lô đã hết hạn trong lúc chờ: hàng trả về không bán lại được => vẫn ghi vào lô nhưng trừ khỏi tồn bán
    await lot.update({ quantity_left: lot.quantity_left + n }, { transaction });
    if (lot.hold_reason || lot.expiry_date < vnDate()) await Product.decrement('stock_quantity', { by: n, where: { id: productId }, transaction });
    rest -= n;
  }
  if (rest <= 0) return;
  const [latest] = await MaterialLot.findAll({ where: { product_id: productId, hold_reason: null, expiry_date: { [Op.gte]: vnDate() } }, order: [['expiry_date', 'DESC']], limit: 1, transaction, lock: transaction.LOCK.UPDATE });
  if (latest) { await latest.update({ quantity_left: latest.quantity_left + rest }, { transaction }); return; }
  const expiry = product.end_date ? vnDate(product.end_date) : null;
  if (!expiry || expiry < vnDate()) {
    // Không có lô còn hạn để ghi vào: không bán lại được, cần kiểm kho
    await Product.decrement('stock_quantity', { by: rest, where: { id: productId }, transaction });
    await MaterialLot.create({ product_id: productId, lot_no: RETURN_LOT_NO, expiry_date: expiry || vnDate(), quantity_received: rest, quantity_left: rest, hold_reason: 'EXPIRED', hold_at: new Date() }, { transaction });
    return;
  }
  await MaterialLot.create({ product_id: productId, lot_no: RETURN_LOT_NO, manufacture_date: product.start_date ? vnDate(product.start_date) : null, expiry_date: expiry, quantity_received: rest, quantity_left: rest }, { transaction });
};

// Hủy / hoàn đơn: cộng lại kho theo các dòng đơn (kèm lô đã xuất)
const restoreOrderStock = async (orderDetails, transaction) => {
  for (const d of orderDetails) await putBack(d.product_id, d.quantity, d.lot_allocations, transaction);
};

// Mỹ phẩm có tồn kho nhưng chưa thuộc lô nào (dữ liệu trước khi theo lô) => gom vào lô tồn đầu kỳ, NSX / HSD lấy theo sản phẩm cũ
const syncOpeningLots = async () => {
  const products = await Product.findAll({ where: { type: 'PRODUCT' }, attributes: ['id', 'stock_quantity', 'start_date', 'end_date'] });
  const rows = await MaterialLot.findAll({
    where: { product_id: products.map((p) => p.id), hold_reason: null },
    attributes: ['product_id', [sequelize.fn('SUM', sequelize.col('quantity_left')), 'left']], group: ['product_id'], raw: true,
  });
  const totals = Object.fromEntries(rows.map((r) => [r.product_id, Number(r.left)]));
  let created = 0;
  for (const p of products) {
    const gap = Number(p.stock_quantity || 0) - (totals[p.id] || 0);
    if (gap <= 0) continue;
    await MaterialLot.create({
      product_id: p.id, lot_no: OPENING_LOT_NO, manufacture_date: p.start_date ? vnDate(p.start_date) : null,
      expiry_date: vnDate(p.end_date || Date.now() + 365 * 86400000), quantity_received: gap, quantity_left: gap,
    });
    created += 1;
  }
  return created;
};

// Lô mỹ phẩm đã hết hạn còn hàng => tách khỏi hàng bán (trừ tồn kho bán), chờ quản lý hủy
const holdExpiredLots = async () => {
  const lots = await MaterialLot.findAll({
    where: { hold_reason: null, quantity_left: { [Op.gt]: 0 }, expiry_date: { [Op.lt]: vnDate() } },
    include: [{ model: Product, attributes: ['id', 'type'], where: { type: 'PRODUCT' } }],
  });
  for (const lot of lots) {
    await sequelize.transaction(async (t) => {
      const fresh = await MaterialLot.findByPk(lot.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!fresh || fresh.hold_reason || fresh.quantity_left <= 0) return;
      await Product.update({ stock_quantity: sequelize.literal(`GREATEST(stock_quantity - ${fresh.quantity_left}, 0)`) }, { where: { id: fresh.product_id }, transaction: t });
      await fresh.update({ hold_reason: 'EXPIRED', hold_at: new Date() }, { transaction: t });
    });
  }
  return lots.length;
};

// Quản lý hủy hàng của lô đang tách riêng (hết hạn / hỏng): về 0, có phiếu điều chỉnh
const disposeHeldLot = async (lotId, userId, reason) => {
  return sequelize.transaction(async (t) => {
    const lot = await MaterialLot.findByPk(lotId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!lot) throw bad('Không tìm thấy lô', 404);
    if (!lot.hold_reason) throw bad('Chỉ hủy được lô đang tách riêng (hết hạn)', 409);
    if (lot.quantity_left <= 0) throw bad('Lô này đã hết hàng', 409);
    await StockAdjustment.create({ product_id: lot.product_id, lot_id: lot.id, lot_no: lot.lot_no, quantity_before: lot.quantity_left, quantity_after: 0, reason, adjusted_by: userId }, { transaction: t });
    await lot.update({ quantity_left: 0 }, { transaction: t });
    return lot;
  });
};

// Lô đang bán (xuất trước) + các lô của danh sách sản phẩm, cho trang quản lý
const lotsByProduct = async (productIds) => {
  const lots = await MaterialLot.findAll({ where: { product_id: productIds, quantity_left: { [Op.gt]: 0 } }, order: [['expiry_date', 'ASC'], ['createdAt', 'ASC']], raw: true });
  const today = vnDate();
  const out = {};
  for (const l of lots) {
    const list = out[l.product_id] || (out[l.product_id] = []);
    list.push({ ...l, expired: l.expiry_date < today, sellable: !l.hold_reason && l.expiry_date >= today });
  }
  return out;
};

module.exports = { OPENING_LOT_NO, SYSTEM_USER, vnDate, takeStock, putBack, restoreOrderStock, syncOpeningLots, holdExpiredLots, disposeHeldLot, lotsByProduct, sellableLots };
