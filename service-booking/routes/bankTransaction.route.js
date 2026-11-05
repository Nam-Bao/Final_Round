const express = require('express');
const { Op } = require('sequelize');
const { BankTransaction } = require('../models');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifySepay } = require('../middlewares/webhook.middleware.js');
const { isDuplicateTransaction, recordTransaction } = require('../utils/bankLog');

const router = express.Router();
const staff = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT')];
const ACTIONS = ['REFUNDED', 'MANUAL', 'IGNORED'];

// POST /bank-transactions/order-log — service-commerce báo kết quả đối soát mã đơn mỹ phẩm "SP xxxxxx" (cùng API key với webhook SePay)
router.post('/order-log', verifySepay, async (req, res) => {
  try {
    const { externalId, amount, content, receivedAt, code, matched_id, status, reason } = req.body;
    if (!['MATCHED', 'PARTIAL', 'UNMATCHED'].includes(status) || !(Number(amount) > 0)) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    if (await isDuplicateTransaction(externalId)) return res.status(200).json({ success: true });
    await recordTransaction({ externalId, amount: Number(amount), content, receivedAt, code_type: 'ORDER', code, matched_id, status, reason });
    res.status(200).json({ success: true });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// GET /bank-transactions?status=OPEN|MATCHED|RESOLVED — OPEN = tiền chưa khớp (thiếu tiền / không có lịch)
router.get('/', ...staff, async (req, res) => {
  try {
    const status = String(req.query.status || 'OPEN');
    const where = status === 'OPEN' ? { status: { [Op.in]: ['PARTIAL', 'UNMATCHED'] } } : { status };
    const data = await BankTransaction.findAll({ where, order: [['received_at', 'DESC']], limit: 300 });
    res.status(200).json({ data, open: await BankTransaction.count({ where: { status: { [Op.in]: ['PARTIAL', 'UNMATCHED'] } } }) });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

// PUT /bank-transactions/:id/resolve { action, ref, note } — hoàn tiền / đã xử lý tay / không phải tiền của khách
router.put('/:id/resolve', ...staff, async (req, res) => {
  try {
    const action = req.body.action;
    const ref = String(req.body.ref || '').trim().slice(0, 50);
    const note = String(req.body.note || '').trim().slice(0, 500);
    if (!ACTIONS.includes(action)) return res.status(400).json({ message: 'Chọn cách xử lý' });
    if (action === 'REFUNDED' && ref.length < 4) return res.status(400).json({ message: 'Hoàn tiền phải nhập mã giao dịch hoàn' });
    if (note.length < 10) return res.status(400).json({ message: 'Ghi rõ nội dung xử lý (ít nhất 10 ký tự)' });
    const [count] = await BankTransaction.update(
      { status: 'RESOLVED', resolved_action: action, resolved_ref: ref || null, resolved_note: note, resolved_by: req.user.id, resolved_at: new Date() },
      { where: { id: req.params.id, status: { [Op.in]: ['PARTIAL', 'UNMATCHED'] } } }
    );
    if (!count) return res.status(400).json({ message: 'Giao dịch này không còn chờ xử lý' });
    res.status(200).json({ message: 'Đã ghi nhận xử lý giao dịch' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

module.exports = router;
