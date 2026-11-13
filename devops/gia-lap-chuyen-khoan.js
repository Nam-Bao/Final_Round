// GIẢ LẬP SePay báo "đã nhận chuyển khoản" khi chạy trên máy cá nhân (SePay thật không gọi được localhost).
// Gửi đúng dữ liệu SePay gửi, tới đúng webhook của hệ thống, kèm khoá xác thực SePay trong .env của từng service.
// CHỈ DÙNG KHI TEST: tiền không thật sự chuyển, hệ thống chỉ ghi nhận như đã nhận tiền.
//
// Cách dùng (chạy ở thư mục Final_Round, các service đang chạy):
//   node devops/gia-lap-chuyen-khoan.js "<nội dung chuyển khoản>" <số tiền>
// Nội dung lấy đúng như hiện dưới mã QR trên trang thanh toán:
//   Cọc lịch khám        : node devops/gia-lap-chuyen-khoan.js "O2O 1A2B3C" 100000
//   Cọc tư vấn chuyên gia : node devops/gia-lap-chuyen-khoan.js "TV 1A2B3C" 50000
//   Đơn mỹ phẩm VietQR    : node devops/gia-lap-chuyen-khoan.js "SP 1A2B3C" 450000
// Thêm chữ "ra" ở cuối = giả lập TIỀN RA (phòng khám chuyển hoàn cho khách), dùng để xác minh khoản hoàn tiền:
//   Hoàn tiền            : node devops/gia-lap-chuyen-khoan.js "HOAN 1A2B3C" 50000 ra
const fs = require('fs');
const path = require('path');

const [content, amountArg, direction] = process.argv.slice(2);
const outgoing = direction === 'ra';
const amount = Number(amountArg);
if (!content || !Number.isFinite(amount) || amount <= 0) {
  console.log('Cách dùng: node devops/gia-lap-chuyen-khoan.js "<nội dung chuyển khoản>" <số tiền>');
  console.log('Ví dụ:     node devops/gia-lap-chuyen-khoan.js "O2O 1A2B3C" 100000');
  console.log('Tiền ra:   node devops/gia-lap-chuyen-khoan.js "HOAN 1A2B3C" 50000 ra');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const readKey = (service) => {
  const file = path.join(root, service, '.env');
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*SEPAY_API_KEY\s*=/.test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : null;
};

// SePay gửi mọi giao dịch tới cả 2 webhook; mỗi webhook tự lọc mã của mình (O2O / TV ở đặt lịch, SP ở mỹ phẩm)
const TARGETS = [
  { service: 'service-booking', url: 'http://localhost:4000/api/booking/appointments/sepay-webhook', label: 'Đặt lịch / tư vấn' },
  { service: 'service-commerce', url: 'http://localhost:4000/api/commerce/orders/sepay-webhook', label: 'Mỹ phẩm' },
];

(async () => {
  const body = {
    id: Date.now(), gateway: 'TPBank', transactionDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
    accountNumber: 'GIA_LAP', content, transferType: outgoing ? 'out' : 'in', transferAmount: amount, referenceCode: `GIALAP${Date.now()}`,
  };
  console.log(`Giả lập ${outgoing ? 'TIỀN RA (chuyển hoàn cho khách)' : 'chuyển khoản vào'} ${amount.toLocaleString('vi-VN')}đ, nội dung "${content}"`);
  for (const t of TARGETS) {
    const key = readKey(t.service);
    if (!key) { console.log(`  - ${t.label}: thiếu SEPAY_API_KEY trong ${t.service}/.env, bỏ qua`); continue; }
    try {
      const r = await fetch(t.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${key}` }, body: JSON.stringify(body) });
      console.log(`  - ${t.label}: HTTP ${r.status}`);
    } catch (e) {
      console.log(`  - ${t.label}: không gọi được (${e.message}). Service đã chạy chưa?`);
    }
  }
  console.log(outgoing
    ? 'Xong. Khoản hoàn có cùng mã HOAN và cùng số tiền chuyển sang "Đã xác minh" (trang Đối soát tiền > Hoàn tiền chờ xác minh).'
    : 'Xong. Trang thanh toán tự kiểm tra lại sau vài giây và chuyển sang "Đã thanh toán" nếu mã + số tiền khớp.');
})();
