const { BankTransaction } = require('../models');

// Sổ giao dịch ngân hàng: ghi lại mọi khoản tiền vào, kể cả khoản không khớp được lịch nào (cần nhân viên xử lý)

// SePay có thể gửi lại cùng 1 giao dịch
const isDuplicateTransaction = async (externalId) => (externalId ? !!(await BankTransaction.findOne({ where: { external_id: String(externalId) } })) : false);

const recordTransaction = ({ externalId, amount, content, receivedAt, code_type, code, matched_id, status, reason }) => BankTransaction.create({
  external_id: externalId ? String(externalId) : null,
  amount,
  content: String(content || '').slice(0, 500),
  code_type, code, matched_id, status, reason,
  received_at: receivedAt ? new Date(receivedAt) : new Date(),
});

module.exports = { isDuplicateTransaction, recordTransaction };
