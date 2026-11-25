const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { sequelize, PointTransaction } = require('../models');
const points = require('../utils/points');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const summary = async (customerId) => {
  const balance = await points.balanceOf(customerId); // trừ điểm hết hạn trước khi trả số dư
  const [rows, soon] = await Promise.all([
    PointTransaction.findAll({ where: { customer_id: customerId }, order: [['createdAt', 'DESC']], limit: 100, raw: true }),
    points.expiringSoon(customerId),
  ]);
  return {
    balance,
    balance_vnd: points.toVnd(balance),
    value_vnd: points.POINT_VALUE_VND,
    clinic_refund_bonus_percent: points.CLINIC_REFUND_BONUS_PERCENT,
    expire_months: points.EXPIRE_MONTHS,
    expiring_soon: soon, // { points, date }: hết hạn trong 30 ngày tới
    history: rows.map((r) => ({
      id: r.id, delta: r.delta, type: r.type, type_label: points.TYPE_LABELS[r.type] || r.type,
      reference_type: r.reference_type, reference_id: r.reference_id, note: r.note, created_at: r.createdAt,
      expires_at: r.delta > 0 ? (r.expires_at || dayjs(r.createdAt).add(points.EXPIRE_MONTHS, 'month').toDate()) : null,
    })),
  };
};

// [PUBLIC] GET /points/config — tỷ lệ quy đổi, hạn dùng (trang sản phẩm hiện giá theo điểm)
const getConfig = (req, res) => res.json({ data: { value_vnd: points.POINT_VALUE_VND, expire_months: points.EXPIRE_MONTHS } });

// [CUSTOMER] GET /points/me — số dư + lịch sử Điểm GlowSkin của mình
const getMyPoints = async (req, res) => {
  try {
    res.json({ data: await summary(req.user.id) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] GET /points/customers/:id — CSKH / NVBH xem điểm của khách khi tư vấn, thu tiền, bán tại quầy
const getCustomerPoints = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ message: 'Mã khách không hợp lệ' });
    res.json({ data: await summary(req.params.id) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// ===== API nội bộ cho service-commerce (token hệ thống): mua mỹ phẩm bằng điểm, hoàn điểm khi hủy / trả hàng =====
const systemOnly = (req, res, next) => {
  try {
    const payload = jwt.verify(String(req.header('Authorization') || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    if (payload.sys !== true) return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch { res.status(401).json({ message: 'Unauthorized' }); }
};
const fail = (res, error) => (error instanceof points.PointError
  ? res.status(error.status).json({ message: error.message, ...error.extra })
  : res.status(500).json({ message: 'Lỗi server', error: error.message }));

// GET /points/internal/balance/:id
const internalBalance = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ message: 'Mã khách không hợp lệ' });
    res.json({ data: { balance: await points.balanceOf(req.params.id), value_vnd: points.POINT_VALUE_VND } });
  } catch (error) { fail(res, error); }
};

// POST /points/internal/spend { customer_id, points, reference_id, note } — trừ điểm mua đơn mỹ phẩm. Gọi lại cùng mã đơn => không trừ lần 2.
const internalSpend = async (req, res) => {
  try {
    const { customer_id: customerId, reference_id: referenceId, note } = req.body || {};
    const amount = parseInt(req.body?.points, 10);
    if (!UUID_RE.test(customerId || '') || !UUID_RE.test(referenceId || '') || !(amount > 0)) return res.status(400).json({ message: 'Dữ liệu trừ điểm không hợp lệ' });
    const row = await sequelize.transaction(async (t) => {
      const existed = await PointTransaction.findOne({ where: { type: 'SPEND_ORDER', reference_id: referenceId }, transaction: t });
      if (existed) return existed;
      return points.spend({ customerId, points: amount, type: 'SPEND_ORDER', referenceType: 'ORDER', referenceId, note: String(note || '').slice(0, 500) }, t);
    });
    res.json({ data: { id: row.id, points: -row.delta, balance: await points.balanceOf(customerId) } });
  } catch (error) { fail(res, error); }
};

// POST /points/internal/credit { customer_id, points, type, reference_type, reference_id, note, amount_vnd, order_id }
// — hoàn điểm khi hủy đơn / trả hàng, cộng chênh lệch đổi hàng. Gọi lại cùng (type, reference_id) => không cộng lần 2.
const internalCredit = async (req, res) => {
  try {
    const { customer_id: customerId, type, reference_type: referenceType, reference_id: referenceId, note, amount_vnd: amountVnd, order_id: orderId } = req.body || {};
    const amount = parseInt(req.body?.points, 10);
    if (!points.COMMERCE_CREDIT_TYPES.includes(type) || !UUID_RE.test(customerId || '') || !UUID_RE.test(referenceId || '') || !(amount > 0)) {
      return res.status(400).json({ message: 'Dữ liệu cộng điểm không hợp lệ' });
    }
    let created = false;
    const row = await sequelize.transaction(async (t) => {
      const existed = await PointTransaction.findOne({ where: { type, reference_id: referenceId }, transaction: t });
      if (existed) return existed;
      created = true;
      return points.credit({ customerId, points: amount, type, referenceType: ['ORDER', 'RETURN'].includes(referenceType) ? referenceType : 'ORDER', referenceId, note: String(note || '').slice(0, 500) }, t);
    });
    if (created) points.notifyCredit({ customerId, points: amount, kind: type, source: referenceType === 'RETURN' ? 'RETURN' : 'ORDER', sourceId: referenceId, amountVnd, orderId }).catch(() => {});
    res.json({ data: { id: row.id, points: row.delta } });
  } catch (error) { fail(res, error); }
};

// [MANAGER] GET /points/report?from=YYYY-MM-DD&to=YYYY-MM-DD — điểm phát ra / đã dùng / hết hạn trong kỳ, điểm đang lưu hành
const report = async (req, res) => {
  try {
    const to = req.query.to ? dayjs(req.query.to) : dayjs();
    const from = req.query.from ? dayjs(req.query.from) : to.subtract(29, 'day');
    if (!from.isValid() || !to.isValid() || from.isAfter(to)) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ' });
    await points.expireAll(); // số liệu lưu hành đã trừ điểm hết hạn
    const range = { createdAt: { [Op.between]: [from.startOf('day').toDate(), to.endOf('day').toDate()] } };
    const [byType, outstanding, holders, rows, soon] = await Promise.all([
      PointTransaction.findAll({ where: range, attributes: ['type', [sequelize.fn('SUM', sequelize.col('delta')), 'points'], [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['type'], raw: true }),
      PointTransaction.sum('delta'),
      sequelize.query('SELECT COUNT(*)::int AS n FROM (SELECT customer_id FROM "PointTransactions" GROUP BY customer_id HAVING SUM(delta) > 0) x', { type: sequelize.QueryTypes.SELECT }),
      PointTransaction.findAll({ where: range, order: [['createdAt', 'DESC']], limit: 1000, raw: true }),
      // Điểm có thể hết hạn trong 30 ngày tới (ước tính: lần cộng sắp hết hạn, chưa trừ phần đã tiêu)
      PointTransaction.sum('delta', { where: { delta: { [Op.gt]: 0 }, expires_at: { [Op.between]: [new Date(), dayjs().add(points.EXPIRING_SOON_DAYS, 'day').toDate()] } } }),
    ]);
    const types = byType.map((r) => ({ type: r.type, label: points.TYPE_LABELS[r.type] || r.type, points: Number(r.points), count: Number(r.count), value_vnd: points.toVnd(Math.abs(Number(r.points))) }));
    const sum = (f) => types.filter(f).reduce((s, r) => s + r.points, 0);
    const issued = sum((r) => r.points > 0);
    const expired = -sum((r) => r.type === 'EXPIRE');
    const spent = -sum((r) => r.points < 0 && r.type !== 'EXPIRE');
    res.json({
      data: {
        from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD'), value_vnd: points.POINT_VALUE_VND, expire_months: points.EXPIRE_MONTHS,
        totals: {
          issued, issued_vnd: points.toVnd(issued), spent, spent_vnd: points.toVnd(spent), expired, expired_vnd: points.toVnd(expired),
          // Điểm đang lưu hành = khoản phòng khám đang nợ khách (quy ra tiền)
          outstanding: Number(outstanding) || 0, outstanding_vnd: points.toVnd(Number(outstanding) || 0), holders: holders[0]?.n || 0,
          expiring_30d_estimate: Number(soon) || 0,
        },
        by_type: types,
        rows: rows.map((r) => ({ id: r.id, customer_id: r.customer_id, type: r.type, type_label: points.TYPE_LABELS[r.type] || r.type, delta: r.delta, reference_type: r.reference_type, reference_id: r.reference_id, note: r.note, created_at: r.createdAt })),
      },
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { getConfig, getMyPoints, getCustomerPoints, systemOnly, internalBalance, internalSpend, internalCredit, report };
