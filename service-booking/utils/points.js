// ĐIỂM GLOWSKIN (đợt 1): cọc của lịch khách hủy đúng hạn được đổi thành điểm thay vì CSKH chuyển khoản tay,
// khách dùng điểm để trả cọc lịch khám / tư vấn lần sau. Điểm không đổi ra tiền mặt, không chuyển cho người khác.
// Quy đổi: 1 điểm = POINT_VALUE_VND đồng (mặc định 100đ, theo ví dụ của giảng viên: 100.000đ = 1.000 điểm).
const { sequelize, PointTransaction } = require('../models');

const read = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const POINT_VALUE_VND = Math.max(1, Math.round(read('POINT_VALUE_VND', 100)));
// Phòng khám hủy lịch mà khách chọn nhận điểm thay vì tiền: cộng thêm % (lỗi của phòng khám)
const CLINIC_REFUND_BONUS_PERCENT = Math.round(read('POINT_CLINIC_REFUND_BONUS_PERCENT', 10));

class PointError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const toPoints = (vnd) => Math.floor(Number(vnd || 0) / POINT_VALUE_VND);
const pointsToPay = (vnd) => Math.ceil(Number(vnd || 0) / POINT_VALUE_VND); // trả cọc: làm tròn lên để không thiếu tiền
const toVnd = (points) => Number(points || 0) * POINT_VALUE_VND;

// Khóa sổ điểm của 1 khách trong transaction: 2 lần trừ điểm cùng lúc không tiêu được 2 lần cùng số điểm
const lock = (customerId, transaction) => sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `points:${customerId}` }, transaction });

const balanceOf = async (customerId, transaction) => Number(await PointTransaction.sum('delta', { where: { customer_id: customerId }, transaction })) || 0;

// Ghi 1 dòng sổ điểm. Trùng (type, reference_id) => đã ghi rồi, không cộng / trừ lần 2
const add = (row, transaction) => PointTransaction.create({ ...row, value_vnd: toVnd(Math.abs(row.delta)) }, { transaction });

// Cộng điểm (trong transaction của nghiệp vụ hủy / hoàn cọc)
const credit = async ({ customerId, points, type, referenceType, referenceId, note, createdBy }, transaction) => {
  if (!(points > 0)) return null;
  await lock(customerId, transaction);
  return add({ customer_id: customerId, delta: points, type, reference_type: referenceType, reference_id: referenceId, note, created_by: createdBy || null }, transaction);
};

// Trừ điểm; không đủ => PointError 409 (cả nghiệp vụ rollback)
const spend = async ({ customerId, points, type, referenceType, referenceId, note }, transaction) => {
  await lock(customerId, transaction);
  const balance = await balanceOf(customerId, transaction);
  if (balance < points) throw new PointError(`Không đủ điểm: cần ${points.toLocaleString('vi-VN')} điểm, bạn đang có ${balance.toLocaleString('vi-VN')} điểm`, 409, { code: 'NOT_ENOUGH_POINTS', balance, needed: points });
  return add({ customer_id: customerId, delta: -points, type, reference_type: referenceType, reference_id: referenceId, note }, transaction);
};

const TYPE_LABELS = {
  CANCEL_REFUND: 'Hủy lịch đúng hạn, cọc đổi thành điểm',
  CLINIC_REFUND: 'Phòng khám hủy lịch, hoàn cọc bằng điểm',
  SPEND_APPOINTMENT: 'Trả cọc lịch khám',
  SPEND_CONSULTATION: 'Trả phí tư vấn chuyên gia',
  ADJUST: 'Điều chỉnh',
};

module.exports = { POINT_VALUE_VND, CLINIC_REFUND_BONUS_PERCENT, PointError, toPoints, pointsToPay, toVnd, balanceOf, credit, spend, TYPE_LABELS };
