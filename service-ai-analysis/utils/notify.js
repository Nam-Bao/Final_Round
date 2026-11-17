// Báo cho trang quản trị biết dữ liệu đã đổi (thông báo real-time, xem service-identity/notify.socket.js).
// Gộp các lần báo trong 300ms thành 1 lần gửi. Lỗi gửi thì bỏ qua: số việc vẫn đúng khi người dùng tải lại trang.
// (Giống utils/notify.js ở service-booking, chỉ dùng hàm notify.)
const jwt = require('jsonwebtoken');

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:4001';
const pending = new Set();
let timer = null;

const flush = () => {
  const topics = [...pending];
  pending.clear();
  timer = null;
  if (!topics.length || !process.env.JWT_SECRET) return;
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
  fetch(`${IDENTITY_URL}/notify/emit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ topics }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
};

const notify = (...topics) => {
  topics.flat().filter(Boolean).forEach((t) => pending.add(t));
  if (!timer) timer = setTimeout(flush, 300);
};

module.exports = { notify };
