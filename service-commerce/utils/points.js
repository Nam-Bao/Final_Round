// Điểm GlowSkin cho đơn mỹ phẩm: sổ điểm nằm ở service-booking, commerce gọi API nội bộ (token hệ thống).
// Mỗi đơn chỉ trừ điểm 1 lần, mỗi khoản hoàn chỉ cộng 1 lần (booking chặn trùng theo loại + mã tham chiếu).
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BOOKING = () => `${process.env.GATEWAY_URL || 'http://localhost:4000'}/api/booking/points/internal`;
const headers = () => ({ Authorization: `Bearer ${jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' })}` });

class PointsError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const wrap = (error) => {
  if (error.response) return new PointsError(error.response.data?.message || 'Lỗi Điểm GlowSkin', error.response.status, { code: error.response.data?.code, balance: error.response.data?.balance, needed: error.response.data?.needed });
  return new PointsError('Không kết nối được hệ thống Điểm GlowSkin, vui lòng thử lại', 503);
};

// { balance, value_vnd }
const balance = (customerId) => axios.get(`${BOOKING()}/balance/${customerId}`, { headers: headers(), timeout: 8000 }).then((r) => r.data.data).catch((e) => { throw wrap(e); });
// Trừ điểm cho đơn (gọi lại cùng mã đơn không trừ lần 2)
const spend = ({ customerId, points, orderId, note }) => axios.post(`${BOOKING()}/spend`, { customer_id: customerId, points, reference_id: orderId, note }, { headers: headers(), timeout: 10000 })
  .then((r) => r.data.data).catch((e) => { throw wrap(e); });
// Cộng điểm: type ORDER_CANCEL | ORDER_REFUND | RETURN_REFUND | EXCHANGE_DIFF
const credit = ({ customerId, points, type, referenceType = 'ORDER', referenceId, note, amountVnd, orderId }) => (points > 0
  ? axios.post(`${BOOKING()}/credit`, { customer_id: customerId, points, type, reference_type: referenceType, reference_id: referenceId, note, amount_vnd: amountVnd, order_id: orderId }, { headers: headers(), timeout: 10000 })
    .then((r) => r.data.data).catch((e) => { throw wrap(e); })
  : Promise.resolve(null));

// Giá theo điểm: làm tròn lên để không thiếu tiền
const toPointsCeil = (vnd, valueVnd) => Math.ceil(Number(vnd || 0) / valueVnd);
const toPointsFloor = (vnd, valueVnd) => Math.floor(Number(vnd || 0) / valueVnd);

module.exports = { PointsError, balance, spend, credit, toPointsCeil, toPointsFloor };
