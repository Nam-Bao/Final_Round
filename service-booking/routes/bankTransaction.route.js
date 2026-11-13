const express = require('express');
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize, BankTransaction, RefundClaim, Appointment, Consultation } = require('../models');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifyInternal } = require('../middlewares/webhook.middleware.js');
const { isDuplicateTransaction, recordTransaction } = require('../utils/bankLog');
const { OPEN, recordClaim, validateClaimInput, reconcile } = require('../utils/refunds');

const router = express.Router();
const staff = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT')];
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];
const ACTIONS = ['REFUNDED', 'MANUAL', 'IGNORED'];
// Khoản CSKH còn phải xử lý: chuyển thiếu, không khớp, chuyển thừa
const OPEN_STATUSES = ['PARTIAL', 'UNMATCHED', 'OVERPAID'];
const GATEWAY = 'http://localhost:4000/api/identity/users';

// Khách hàng (tên, SĐT, email) theo id. Lỗi thì trả rỗng: trang vẫn hiện được giao dịch
const loadPeople = async (authorization, withStaff) => {
  const get = (path) => axios.get(`${GATEWAY}/${path}`, { headers: { Authorization: authorization } }).then((r) => r.data.data || []).catch(() => []);
  const [customers, employees] = await Promise.all([get('customers'), withStaff ? get('employees') : []]);
  const people = {};
  customers.forEach((u) => { people[u.id] = { name: u.Profile?.full_name || 'Khách hàng', phone: u.Profile?.phone || '', email: u.email || '' }; });
  employees.forEach((u) => { people[u.id] = { name: u.Profile?.full_name || u.email, phone: u.Profile?.phone || '', email: u.email || '' }; });
  return people;
};

// Giao dịch có mã lịch / tư vấn nhưng chưa biết khách (giữ chỗ đã hết hạn, bản ghi cũ): tìm lịch theo 6 ký tự đầu, mọi trạng thái
const findCustomersByCode = async (rows) => {
  const result = {};
  const lookup = async (Model, type) => {
    const codes = [...new Set(rows.filter((r) => !r.customer_id && r.code_type === type && r.code).map((r) => r.code.toLowerCase()))];
    if (!codes.length) return;
    const found = await Model.findAll({
      where: { [Op.or]: codes.map((c) => sequelize.where(sequelize.cast(sequelize.col('id'), 'text'), { [Op.like]: `${c}%` })) },
      attributes: ['id', 'customer_id'], raw: true,
    });
    codes.forEach((c) => {
      const owners = [...new Set(found.filter((f) => f.id.startsWith(c)).map((f) => f.customer_id))];
      if (owners.length === 1) result[`${type}:${c}`] = owners[0]; // trùng mã giữa 2 khách thì không đoán
    });
  };
  await lookup(Appointment, 'APPOINTMENT');
  await lookup(Consultation, 'CONSULTATION');
  return result;
};

// POST /bank-transactions/order-log — service-commerce báo kết quả đối soát mã đơn mỹ phẩm "SP xxxxxx" (khoá nội bộ)
router.post('/order-log', verifyInternal, async (req, res) => {
  try {
    const { externalId, amount, content, receivedAt, code, matched_id, status, reason, customer_id, referenceCode } = req.body;
    if (!['MATCHED', ...OPEN_STATUSES].includes(status) || !(Number(amount) > 0)) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    if (await isDuplicateTransaction(externalId)) return res.status(200).json({ success: true });
    await recordTransaction({ externalId, amount: Number(amount), content, receivedAt, code_type: 'ORDER', code, matched_id, status, reason, customer_id, referenceCode });
    res.status(200).json({ success: true });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// POST /bank-transactions/refund-claim — service-commerce báo nhân viên đã hoàn tiền đơn hủy / hàng hoàn trả (khoá nội bộ)
router.post('/refund-claim', verifyInternal, async (req, res) => {
  try {
    const { source, source_id, customer_id, amount, bank_ref, account, claimed_by } = req.body;
    if (!['ORDER', 'RETURN'].includes(source) || !source_id) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    await recordClaim({ source, source_id, customer_id, amount, bank_ref, account, claimed_by });
    res.status(200).json({ success: true });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// GET /bank-transactions?status=OPEN|MATCHED|RESOLVED — OPEN = tiền cần xử lý (thiếu, thừa, không có lịch)
router.get('/', ...staff, async (req, res) => {
  try {
    const status = String(req.query.status || 'OPEN');
    const where = status === 'OPEN' ? { status: { [Op.in]: OPEN_STATUSES } } : { status, code_type: { [Op.ne]: 'REFUND_OUT' } };
    const rows = await BankTransaction.findAll({ where, order: [['received_at', 'DESC']], limit: 300, raw: true });
    const [byCode, people, claims] = await Promise.all([
      findCustomersByCode(rows),
      loadPeople(req.headers.authorization, ['ADMIN', 'GEN_MANAGER'].includes(req.user.role)),
      RefundClaim.findAll({ where: { source: 'BANK_TX', source_id: rows.map((r) => r.id) }, raw: true }),
    ]);
    const data = rows.map((r) => {
      const customerId = r.customer_id || byCode[`${r.code_type}:${String(r.code || '').toLowerCase()}`] || null;
      const claim = claims.find((c) => c.source_id === r.id);
      return {
        ...r, customer_id: customerId, customer: customerId ? people[customerId] || null : null,
        resolved_by_name: people[r.resolved_by]?.name || null, refund_status: claim?.status || null,
      };
    });
    res.status(200).json({ data, open: await BankTransaction.count({ where: { status: { [Op.in]: OPEN_STATUSES } } }) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// PUT /bank-transactions/:id/resolve { action, ref, note, amount, account } — hoàn tiền / đã xử lý tay / không phải tiền của khách
router.put('/:id/resolve', ...staff, async (req, res) => {
  try {
    const action = req.body.action;
    const ref = String(req.body.ref || '').trim().slice(0, 50);
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!ACTIONS.includes(action)) return res.status(400).json({ message: 'Chọn cách xử lý' });
    if (note.length < 10) return res.status(400).json({ message: 'Ghi rõ nội dung xử lý (ít nhất 10 ký tự)' });
    const tx = await BankTransaction.findByPk(req.params.id);
    if (!tx || !OPEN_STATUSES.includes(tx.status)) return res.status(400).json({ message: 'Giao dịch này không còn chờ xử lý' });
    let refundAmount = 0;
    if (action === 'REFUNDED') {
      const invalid = validateClaimInput({ bank_ref: ref, account: req.body.account });
      if (invalid) return res.status(400).json({ message: invalid });
      refundAmount = Math.round(Number(req.body.amount));
      if (!(refundAmount > 0) || refundAmount > Number(tx.amount)) return res.status(400).json({ message: `Số tiền hoàn phải từ 1đ đến ${Number(tx.amount).toLocaleString('vi-VN')}đ` });
    }
    const [count] = await BankTransaction.update(
      { status: 'RESOLVED', resolved_action: action, resolved_ref: ref || null, resolved_note: note, resolved_by: req.user.id, resolved_at: new Date() },
      { where: { id: tx.id, status: { [Op.in]: OPEN_STATUSES } } }
    );
    if (!count) return res.status(400).json({ message: 'Giao dịch này không còn chờ xử lý' });
    if (action === 'REFUNDED') {
      const customerId = tx.customer_id || (await findCustomersByCode([tx.get({ plain: true })]))[`${tx.code_type}:${String(tx.code || '').toLowerCase()}`];
      await recordClaim({ source: 'BANK_TX', source_id: tx.id, customer_id: customerId, amount: refundAmount, bank_ref: ref, account: req.body.account, claimed_by: req.user.id });
      return res.status(200).json({ message: 'Đã ghi nhận hoàn tiền. Khoản hoàn sẽ được đối chiếu với giao dịch tiền ra của ngân hàng.' });
    }
    res.status(200).json({ message: 'Đã ghi nhận xử lý giao dịch' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// ===== KIỂM SOÁT HOÀN TIỀN =====
// GET /bank-transactions/refunds?status=OPEN|VERIFIED — OPEN: chưa thấy tiền ra trên ngân hàng (chờ hoặc quản lý đánh dấu sai lệch)
router.get('/refunds', ...staff, async (req, res) => {
  try {
    await reconcile();
    const status = req.query.status === 'VERIFIED' ? ['VERIFIED'] : OPEN;
    const rows = await RefundClaim.findAll({ where: { status: { [Op.in]: status } }, order: [['claimed_at', 'DESC']], limit: 300, raw: true });
    const outs = await BankTransaction.findAll({ where: { id: rows.map((r) => r.bank_tx_id).filter(Boolean) }, attributes: ['id', 'content', 'received_at', 'reference_code'], raw: true });
    const people = await loadPeople(req.headers.authorization, ['ADMIN', 'GEN_MANAGER'].includes(req.user.role));
    const data = rows.map((r) => ({
      ...r, content: `HOAN ${r.transfer_code}`, customer: people[r.customer_id] || null,
      claimed_by_name: people[r.claimed_by]?.name || null, verified_by_name: people[r.verified_by]?.name || null,
      bank_tx: outs.find((o) => o.id === r.bank_tx_id) || null,
    }));
    const open = await RefundClaim.count({ where: { status: { [Op.in]: OPEN } } });
    res.status(200).json({ data, open });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// PUT /bank-transactions/refunds/:id/review { result: VERIFIED | DISPUTED, note } — quản lý đối chiếu sao kê
// VERIFIED: đã thấy tiền ra trên sao kê (khi SePay không báo được, VD chuyển từ tài khoản khác). DISPUTED: không thấy tiền ra,
// khoản hoàn vẫn mở cho tới khi ngân hàng báo tiền ra đúng mã + số tiền, hoặc quản lý xác nhận lại.
router.put('/refunds/:id/review', ...managers, async (req, res) => {
  try {
    const result = req.body.result;
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!['VERIFIED', 'DISPUTED'].includes(result)) return res.status(400).json({ message: 'Chọn kết quả đối chiếu' });
    if (note.length < 10) return res.status(400).json({ message: 'Ghi rõ kết quả đối chiếu sao kê (ít nhất 10 ký tự)' });
    const claim = await RefundClaim.findByPk(req.params.id);
    if (!claim || !OPEN.includes(claim.status)) return res.status(400).json({ message: 'Khoản hoàn này không còn chờ đối chiếu' });
    if (claim.claimed_by === req.user.id) return res.status(403).json({ message: 'Không tự đối chiếu khoản hoàn do chính mình ghi nhận' });
    await claim.update(result === 'VERIFIED'
      ? { status: 'VERIFIED', verified_method: 'MANAGER', verified_by: req.user.id, verified_at: new Date(), manager_note: note }
      : { status: 'DISPUTED', verified_by: req.user.id, manager_note: note });
    res.status(200).json({ message: result === 'VERIFIED' ? 'Đã xác nhận khoản hoàn khớp sao kê' : 'Đã đánh dấu sai lệch, khoản hoàn tiếp tục chờ tiền ra' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

module.exports = router;
