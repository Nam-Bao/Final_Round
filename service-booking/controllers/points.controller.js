const { PointTransaction } = require('../models');
const points = require('../utils/points');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summary = async (customerId) => {
  const [balance, rows] = await Promise.all([
    points.balanceOf(customerId),
    PointTransaction.findAll({ where: { customer_id: customerId }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
  ]);
  return {
    balance,
    balance_vnd: points.toVnd(balance),
    value_vnd: points.POINT_VALUE_VND,
    clinic_refund_bonus_percent: points.CLINIC_REFUND_BONUS_PERCENT,
    history: rows.map((r) => ({
      id: r.id, delta: r.delta, type: r.type, type_label: points.TYPE_LABELS[r.type] || r.type,
      reference_type: r.reference_type, reference_id: r.reference_id, note: r.note, created_at: r.createdAt,
    })),
  };
};

// [CUSTOMER] GET /points/me — số dư + lịch sử Điểm GlowSkin của mình
const getMyPoints = async (req, res) => {
  try {
    res.json({ data: await summary(req.user.id) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] GET /points/customers/:id — CSKH xem điểm của khách khi tư vấn, thu tiền
const getCustomerPoints = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ message: 'Mã khách không hợp lệ' });
    res.json({ data: await summary(req.params.id) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { getMyPoints, getCustomerPoints };
