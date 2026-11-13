const { Op } = require('sequelize');
const { RefundClaim, BankTransaction } = require('../models');

// KIỂM SOÁT HOÀN TIỀN
// Nhân viên chuyển khoản hoàn với nội dung "HOAN <6 ký tự đầu mã lịch / đơn / giao dịch>" rồi bấm "đã hoàn".
// Khoản hoàn được xác minh tự động khi SePay báo tiền ra có đúng mã đó và đúng số tiền; không thấy thì nằm chờ để quản lý
// đối chiếu sao kê. Nhân viên nhập mã giao dịch bừa không làm khoản hoàn "đã xác minh" được.
const SOURCES = ['BANK_TX', 'APPOINTMENT', 'CONSULTATION', 'ORDER', 'RETURN'];
const OPEN = ['WAITING', 'DISPUTED'];

const transferCode = (sourceId) => String(sourceId || '').replace(/-/g, '').slice(0, 6).toUpperCase();
const CODE_RE = /(?<![a-z0-9])HOAN\s?([a-z0-9]{6})/i;

const cleanAccount = (v) => String(v || '').trim().slice(0, 200);
// Kiểm tra dữ liệu nhân viên nhập khi ghi "đã hoàn" (dùng chung cho mọi nơi hoàn tiền)
const validateClaimInput = ({ bank_ref, account }) => {
  const ref = String(bank_ref || '').trim();
  if (ref.length < 4 || ref.length > 50) return 'Nhập mã giao dịch chuyển khoản hoàn tiền (4 - 50 ký tự)';
  if (cleanAccount(account).length < 8) return 'Nhập tài khoản nhận hoàn: ngân hàng - số tài khoản - chủ tài khoản';
  return null;
};

// Khớp khoản hoàn đang chờ với giao dịch tiền ra chưa dùng: cùng mã, cùng số tiền, mỗi giao dịch chỉ khớp 1 khoản
const reconcile = async () => {
  const claims = await RefundClaim.findAll({ where: { status: { [Op.in]: OPEN } }, order: [['claimed_at', 'ASC']] });
  if (!claims.length) return 0;
  const outs = await BankTransaction.findAll({ where: { code_type: 'REFUND_OUT', matched_id: null }, order: [['received_at', 'ASC']] });
  let matched = 0;
  for (const claim of claims) {
    const out = outs.find((o) => !o.matched_id && o.code === claim.transfer_code && Number(o.amount) === Number(claim.amount));
    if (!out) continue;
    out.matched_id = claim.id;
    await BankTransaction.update({ matched_id: claim.id, status: 'MATCHED' }, { where: { id: out.id, matched_id: null } });
    await claim.update({ status: 'VERIFIED', verified_method: 'BANK', verified_at: new Date(), bank_tx_id: out.id });
    matched += 1;
  }
  return matched;
};

// Ghi 1 lần "đã hoàn". Lỗi ghi không làm hỏng nghiệp vụ hoàn tiền (đã lưu ở bảng gốc) nhưng phải báo ra log
const recordClaim = async ({ source, source_id, customer_id, amount, bank_ref, account, claimed_by }) => {
  if (!SOURCES.includes(source) || !(Number(amount) > 0)) throw new Error('Khoản hoàn không hợp lệ');
  const claim = await RefundClaim.create({
    source, source_id, transfer_code: transferCode(source_id), customer_id: customer_id || null, amount: Number(amount),
    bank_ref: String(bank_ref || '').trim().slice(0, 50), account: cleanAccount(account), claimed_by, claimed_at: new Date(),
  });
  await reconcile();
  return claim;
};

// SePay báo tiền ra. Lưu vào sổ (để khớp cả khi nhân viên bấm "đã hoàn" sau khi chuyển)
const recordOutgoing = async ({ externalId, amount, content, receivedAt, referenceCode }) => {
  const match = String(content || '').match(CODE_RE);
  await BankTransaction.create({
    external_id: externalId ? String(externalId) : null, amount, content: String(content || '').slice(0, 500),
    code_type: 'REFUND_OUT', code: match ? match[1].toUpperCase() : null, status: 'OUT',
    reason: match ? null : 'Tiền ra không có mã HOAN', received_at: receivedAt ? new Date(receivedAt) : new Date(),
    reference_code: referenceCode ? String(referenceCode).slice(0, 50) : null,
  });
  if (match) await reconcile();
};

module.exports = { SOURCES, OPEN, transferCode, validateClaimInput, recordClaim, recordOutgoing, reconcile };
