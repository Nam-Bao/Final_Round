// GIẢ LẬP GHN báo trạng thái vận đơn khi chạy trên máy cá nhân (GHN thật không gọi được localhost).
// Gửi đúng dữ liệu GHN gửi tới webhook của hệ thống. Dùng cho cả đơn giao hàng và đơn lấy hàng hoàn trả.
// CHỈ DÙNG KHI TEST.
//
// Cách dùng (chạy ở thư mục gốc dự án, các service đang chạy):
//   node devops/gia-lap-ghn.js <mã vận đơn> <trạng thái> [email nhân viên bán hàng] [mật khẩu]
// Trạng thái:
//   picked    : shipper đã lấy hàng            (đơn chuyển sang Đang giao)
//   delivered : giao thành công                (đơn Hoàn thành / hàng hoàn trả đã về kho)
//   cancel    : GHN hủy vận đơn                (đơn bị hủy, cộng kho, trả lượt voucher / hoàn trả quay về Đã duyệt)
//   returned  : GHN hoàn hàng về kho           (đơn bị hủy, cộng kho; đơn có voucher chờ nhân viên xác định nguyên nhân)
// Nếu service-commerce/.env có GHN_WEBHOOK_SECRET thì không cần email, mật khẩu.
const fs = require('fs');
const path = require('path');

const GATEWAY = 'http://localhost:4000';
const STATUSES = { picked: 'Shipper đã lấy hàng', delivered: 'Giao thành công', cancel: 'GHN hủy vận đơn', returned: 'GHN hoàn hàng về kho' };
const [orderCode, status, email, password] = process.argv.slice(2);
if (!orderCode || !STATUSES[status]) {
  console.log('Cách dùng: node devops/gia-lap-ghn.js <mã vận đơn> <picked|delivered|cancel|returned> [email] [mật khẩu]');
  console.log('Ví dụ:     node devops/gia-lap-ghn.js GYM8VMQA delivered banhang1@gmail.com matkhau');
  process.exit(1);
}

const readSecret = () => {
  const file = path.join(__dirname, '..', 'service-commerce', '.env');
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*GHN_WEBHOOK_SECRET\s*=/.test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
};

(async () => {
  const secret = readSecret();
  let url = `${GATEWAY}/api/commerce/orders/ghn-webhook`;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) url += `?token=${encodeURIComponent(secret)}`;
  else {
    if (!email || !password) {
      console.log('Chưa có GHN_WEBHOOK_SECRET trong service-commerce/.env: thêm email và mật khẩu tài khoản nhân viên bán hàng vào cuối lệnh.');
      process.exit(1);
    }
    const login = await fetch(`${GATEWAY}/api/identity/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email, password }) }).catch(() => null);
    const data = await login?.json().catch(() => ({}));
    if (!login?.ok || !data?.token) {
      console.log(`Đăng nhập không được: ${data?.message || 'gateway chưa chạy?'}`);
      process.exit(1);
    }
    headers.Authorization = `Bearer ${data.token}`;
  }
  console.log(`Giả lập GHN: vận đơn ${orderCode} - ${STATUSES[status]}`);
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ OrderCode: orderCode, Status: status, Time: new Date().toISOString() }) });
    const body = await r.json().catch(() => ({}));
    console.log(`  HTTP ${r.status}${body.message ? ` - ${body.message}` : ''}`);
    if (r.ok) console.log('Xong. Tải lại trang quản lý đơn hàng để xem trạng thái mới.');
  } catch (e) {
    console.log(`  Không gọi được (${e.message}). Service đã chạy chưa?`);
  }
})();
