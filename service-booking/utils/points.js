// ĐIỂM GLOWSKIN: cọc của lịch khách hủy đúng hạn được đổi thành điểm thay vì CSKH chuyển khoản tay; khách dùng điểm để trả
// cọc lịch khám / phí tư vấn, mua mỹ phẩm (theo giá niêm yết). Điểm không đổi ra tiền mặt, không chuyển cho người khác.
// Quy đổi: 1 điểm = POINT_VALUE_VND đồng (mặc định 100đ, theo ví dụ của giảng viên: 100.000đ = 1.000 điểm).
// HẠN DÙNG: mỗi lần cộng điểm có hạn POINT_EXPIRE_MONTHS tháng (mặc định 12). Tiêu điểm theo nguyên tắc điểm sắp hết hạn dùng trước;
// điểm quá hạn chưa dùng được trừ bằng 1 dòng EXPIRE (cron mỗi đêm, và kiểm tra lại ngay trước mỗi lần tiêu / xem số dư).
const { Op } = require('sequelize');
const { sequelize, PointTransaction } = require('../models');

const read = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const POINT_VALUE_VND = Math.max(1, Math.round(read('POINT_VALUE_VND', 100)));
// Phòng khám hủy lịch mà khách chọn nhận điểm thay vì tiền: cộng thêm % (lỗi của phòng khám)
const CLINIC_REFUND_BONUS_PERCENT = Math.round(read('POINT_CLINIC_REFUND_BONUS_PERCENT', 10));
const EXPIRE_MONTHS = Math.max(1, Math.round(read('POINT_EXPIRE_MONTHS', 12)));
const EXPIRING_SOON_DAYS = 30; // báo khách điểm sắp hết hạn

class PointError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const toPoints = (vnd) => Math.floor(Number(vnd || 0) / POINT_VALUE_VND);
const pointsToPay = (vnd) => Math.ceil(Number(vnd || 0) / POINT_VALUE_VND); // trả bằng điểm: làm tròn lên để không thiếu tiền
const toVnd = (points) => Number(points || 0) * POINT_VALUE_VND;
const addMonths = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; };
const expiryOf = (row) => new Date(row.expires_at || addMonths(row.createdAt, EXPIRE_MONTHS));

// Khóa sổ điểm của 1 khách trong transaction: 2 lần trừ điểm cùng lúc không tiêu được 2 lần cùng số điểm
const lock = (customerId, transaction) => sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `points:${customerId}` }, transaction });

const sumDelta = async (customerId, transaction) => Number(await PointTransaction.sum('delta', { where: { customer_id: customerId }, transaction })) || 0;

// Diễn lại sổ điểm theo thời gian để biết mỗi lần cộng điểm còn lại bao nhiêu:
// lần tiêu dùng điểm CÒN HẠN tại thời điểm tiêu, ưu tiên điểm hết hạn sớm nhất; dòng EXPIRE trừ đúng lần cộng nó trỏ tới.
// Trả [{ id, remaining, expires_at }] (chỉ các lần cộng còn dư).
const lotsOf = async (customerId, transaction) => {
  const rows = await PointTransaction.findAll({ where: { customer_id: customerId }, order: [['createdAt', 'ASC'], ['id', 'ASC']], transaction, raw: true });
  const lots = [];
  for (const r of rows) {
    if (r.delta > 0) { lots.push({ id: r.id, remaining: r.delta, expires_at: expiryOf(r) }); continue; }
    if (r.type === 'EXPIRE') { const lot = lots.find((l) => l.id === r.reference_id); if (lot) lot.remaining = Math.max(0, lot.remaining + r.delta); continue; }
    let need = -r.delta;
    const at = new Date(r.createdAt);
    const usable = lots.filter((l) => l.remaining > 0).sort((a, b) => a.expires_at - b.expires_at);
    // Còn hạn lúc tiêu trước; dữ liệu cũ bất thường (tiêu khi chỉ còn điểm quá hạn) thì trừ tiếp vào lô cũ nhất cho khớp số dư
    for (const l of [...usable.filter((x) => x.expires_at > at), ...usable.filter((x) => x.expires_at <= at)]) {
      if (need <= 0) break;
      const take = Math.min(need, l.remaining);
      l.remaining -= take; need -= take;
    }
  }
  return lots.filter((l) => l.remaining > 0);
};

// Ghi dòng EXPIRE cho điểm quá hạn chưa dùng của 1 khách (gọi trong transaction đã khóa sổ của khách)
const expireLocked = async (customerId, transaction) => {
  const now = new Date();
  let expired = 0;
  for (const lot of (await lotsOf(customerId, transaction)).filter((l) => l.expires_at <= now)) {
    const [, created] = await PointTransaction.findOrCreate({
      where: { type: 'EXPIRE', reference_id: lot.id },
      defaults: { customer_id: customerId, delta: -lot.remaining, value_vnd: toVnd(lot.remaining), reference_type: 'POINT', note: `${lot.remaining.toLocaleString('vi-VN')} điểm hết hạn ngày ${lot.expires_at.toLocaleDateString('vi-VN')}` },
      transaction,
    });
    if (created) expired += lot.remaining;
  }
  return expired;
};

// Số dư (đã trừ điểm hết hạn)
const balanceOf = async (customerId, transaction) => {
  if (transaction) { await lock(customerId, transaction); await expireLocked(customerId, transaction); return sumDelta(customerId, transaction); }
  return sequelize.transaction(async (t) => { await lock(customerId, t); await expireLocked(customerId, t); return sumDelta(customerId, t); });
};

// Điểm sắp hết hạn trong EXPIRING_SOON_DAYS ngày: { points, date (hạn gần nhất) }
const expiringSoon = async (customerId) => {
  const limit = new Date(Date.now() + EXPIRING_SOON_DAYS * 86400000);
  const lots = (await lotsOf(customerId)).filter((l) => l.expires_at > new Date() && l.expires_at <= limit);
  return { points: lots.reduce((s, l) => s + l.remaining, 0), date: lots.length ? lots.sort((a, b) => a.expires_at - b.expires_at)[0].expires_at : null };
};

// Ghi 1 dòng sổ điểm. Trùng (type, reference_id) => đã ghi rồi, không cộng / trừ lần 2
const add = (row, transaction) => PointTransaction.create({ ...row, value_vnd: toVnd(Math.abs(row.delta)) }, { transaction });

// Cộng điểm (trong transaction của nghiệp vụ). Mỗi lần cộng có hạn dùng riêng EXPIRE_MONTHS tháng.
const credit = async ({ customerId, points, type, referenceType, referenceId, note, createdBy }, transaction) => {
  if (!(points > 0)) return null;
  await lock(customerId, transaction);
  return add({ customer_id: customerId, delta: points, type, reference_type: referenceType, reference_id: referenceId, note, created_by: createdBy || null, expires_at: addMonths(new Date(), EXPIRE_MONTHS) }, transaction);
};

// Trừ điểm (điểm quá hạn bị trừ trước khi kiểm tra); không đủ => PointError 409 (cả nghiệp vụ rollback)
const spend = async ({ customerId, points, type, referenceType, referenceId, note }, transaction) => {
  await lock(customerId, transaction);
  await expireLocked(customerId, transaction);
  const balance = await sumDelta(customerId, transaction);
  if (balance < points) throw new PointError(`Không đủ điểm: cần ${points.toLocaleString('vi-VN')} điểm, bạn đang có ${balance.toLocaleString('vi-VN')} điểm`, 409, { code: 'NOT_ENOUGH_POINTS', balance, needed: points });
  return add({ customer_id: customerId, delta: -points, type, reference_type: referenceType, reference_id: referenceId, note }, transaction);
};

// Phòng khám hủy / chuyên gia vắng: hoàn bằng điểm, cộng thêm CLINIC_REFUND_BONUS_PERCENT
const clinicRefundPoints = (vnd) => { const base = toPoints(vnd); return base + Math.floor(base * CLINIC_REFUND_BONUS_PERCENT / 100); };

// Email báo khách vừa được cộng điểm (gọi SAU khi transaction đã commit).
// kind: CANCEL_REFUND | CLINIC_REFUND | ORDER_CANCEL | ORDER_REFUND | RETURN_REFUND | EXCHANGE_DIFF; source: APPOINTMENT | CONSULTATION | ORDER | RETURN
const notifyCredit = async ({ customerId, points: added, kind, source, sourceId, amountVnd, orderId }) => {
  if (!(added > 0)) return null;
  const { sendEmail } = require('./mail');
  const balance = await balanceOf(customerId).catch(() => null);
  return sendEmail('POINTS_CREDITED', customerId, `POINTS:${kind}:${source}:${sourceId}`, {
    points: added, kind, source, source_id: sourceId, order_id: orderId || null, amount_vnd: Number(amountVnd || 0), balance, value_vnd: POINT_VALUE_VND,
    bonus_percent: kind === 'CLINIC_REFUND' ? CLINIC_REFUND_BONUS_PERCENT : 0, expire_months: EXPIRE_MONTHS,
  });
};

// [CRON] Mỗi đêm: trừ điểm hết hạn của mọi khách có lần cộng đã quá hạn
const expireAll = async () => {
  const cutoff = addMonths(new Date(), -EXPIRE_MONTHS);
  const rows = await PointTransaction.findAll({
    where: { delta: { [Op.gt]: 0 }, [Op.or]: [{ expires_at: { [Op.lte]: new Date() } }, { expires_at: null, createdAt: { [Op.lte]: cutoff } }] },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('customer_id')), 'customer_id']], raw: true,
  });
  let total = 0;
  for (const { customer_id: id } of rows) total += await sequelize.transaction(async (t) => { await lock(id, t); return expireLocked(id, t); });
  if (total) console.log(`⏳ [ĐIỂM] Đã trừ ${total.toLocaleString('vi-VN')} điểm hết hạn`);
  return total;
};

// [CRON] Mỗi sáng: email khách có điểm hết hạn trong 30 ngày tới (mỗi lần cộng điểm báo 1 lần)
const notifyExpiring = async () => {
  const { sendEmail } = require('./mail');
  const limit = new Date(Date.now() + EXPIRING_SOON_DAYS * 86400000);
  const rows = await PointTransaction.findAll({ where: { delta: { [Op.gt]: 0 } }, attributes: [[sequelize.fn('DISTINCT', sequelize.col('customer_id')), 'customer_id']], raw: true });
  for (const { customer_id: id } of rows) {
    const lots = (await lotsOf(id)).filter((l) => l.expires_at > new Date() && l.expires_at <= limit);
    for (const lot of lots) {
      await sendEmail('POINTS_EXPIRING', id, `POINTS_EXPIRING:${lot.id}`, { points: lot.remaining, expires_at: lot.expires_at.toISOString().slice(0, 10), value_vnd: POINT_VALUE_VND });
    }
  }
};

const TYPE_LABELS = {
  CANCEL_REFUND: 'Hủy lịch đúng hạn, cọc đổi thành điểm',
  CLINIC_REFUND: 'Phòng khám hủy lịch, hoàn cọc bằng điểm',
  SPEND_APPOINTMENT: 'Trả cọc lịch khám',
  SPEND_CONSULTATION: 'Trả phí tư vấn chuyên gia',
  SPEND_ORDER: 'Mua mỹ phẩm bằng điểm',
  ORDER_CANCEL: 'Hủy đơn mỹ phẩm, nhận hoàn bằng điểm',
  ORDER_REFUND: 'Hoàn điểm đơn mỹ phẩm bị hủy',
  RETURN_REFUND: 'Hoàn điểm hàng trả lại',
  EXCHANGE_DIFF: 'Chênh lệch khi đổi sang sản phẩm rẻ hơn',
  EXPIRE: 'Điểm hết hạn',
  ADJUST: 'Điều chỉnh',
};
// Loại cộng điểm commerce được phép ghi qua API nội bộ
const COMMERCE_CREDIT_TYPES = ['ORDER_CANCEL', 'ORDER_REFUND', 'RETURN_REFUND', 'EXCHANGE_DIFF'];

module.exports = {
  POINT_VALUE_VND, CLINIC_REFUND_BONUS_PERCENT, EXPIRE_MONTHS, EXPIRING_SOON_DAYS, PointError, toPoints, pointsToPay, toVnd, lock,
  balanceOf, expiringSoon, credit, spend, clinicRefundPoints, notifyCredit, expireAll, notifyExpiring, TYPE_LABELS, COMMERCE_CREDIT_TYPES,
};
