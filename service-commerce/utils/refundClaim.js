const axios = require('axios');

// Báo service-booking: nhân viên đã ghi "đã hoàn tiền". Khoản hoàn được đối chiếu với giao dịch tiền ra của ngân hàng
// (nội dung "HOAN <6 ký tự đầu mã đơn / mã yêu cầu hoàn trả>") ở trang Đối soát tiền của quản lý.
const transferCode = (id) => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();

const accountOf = (v) => String(v || '').trim().slice(0, 200);
const validateClaimInput = ({ bank_ref, account }) => {
  const ref = String(bank_ref || '').trim();
  if (ref.length < 4 || ref.length > 50) return 'Nhập mã giao dịch chuyển khoản hoàn tiền (4 - 50 ký tự)';
  if (accountOf(account).length < 8) return 'Nhập tài khoản nhận hoàn: ngân hàng - số tài khoản - chủ tài khoản';
  return null;
};

const sendRefundClaim = (claim) => axios.post('http://localhost:4000/api/booking/bank-transactions/refund-claim', claim, {
  headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY },
}).catch((e) => console.error('❌ Không ghi được khoản hoàn để đối chiếu:', claim.source, claim.source_id, e.message));

module.exports = { transferCode, validateClaimInput, sendRefundClaim };
