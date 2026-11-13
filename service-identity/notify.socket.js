// Thông báo real-time cho trang quản trị (namespace /notify).
// - Nhân viên đăng nhập kết nối bằng token; server KHÔNG gửi nội dung việc, chỉ gửi "chủ đề đã thay đổi" (VD: orders, appointments).
// - Trang quản trị nhận được thì tự tải lại số việc đang chờ (GET /tasks/mine của từng service) và dữ liệu trang đang mở.
// - Số việc tính từ dữ liệu thật trong DB => tải lại trang không mất, việc xử lý xong thì tự hết.
// Các service báo thay đổi qua POST /notify/emit, ký bằng JWT_SECRET chung (token hệ thống sống 1 phút).
const jwt = require('jsonwebtoken');

const STAFF_ROLES = ['ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES', 'EXPERT'];
const TOPIC_RE = /^[a-z0-9-]{2,40}$/;

module.exports = (io, app) => {
  const nsp = io.of('/notify');
  nsp.use((socket, next) => {
    try {
      const { id, role } = jwt.verify(socket.handshake.auth?.token || '', process.env.JWT_SECRET);
      if (!STAFF_ROLES.includes(role)) return next(new Error('Chỉ dành cho nhân viên'));
      socket.data.user = { id, role };
      next();
    } catch {
      next(new Error('Token không hợp lệ'));
    }
  });
  nsp.on('connection', (socket) => {
    socket.join(`role:${socket.data.user.role}`);
    socket.join(`user:${socket.data.user.id}`);
  });

  // [HỆ THỐNG] POST /notify/emit { topics: ['orders', ...] }
  app.post('/notify/emit', (req, res) => {
    try {
      const payload = jwt.verify(String(req.header('Authorization') || '').replace(/^Bearer /, ''), process.env.JWT_SECRET);
      if (payload.sys !== true) return res.status(403).json({ message: 'Forbidden' });
    } catch {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const topics = [...new Set((Array.isArray(req.body?.topics) ? req.body.topics : []).filter((t) => TOPIC_RE.test(String(t))))].slice(0, 20);
    if (topics.length) nsp.emit('changed', { topics, at: Date.now() });
    res.status(200).json({ ok: true });
  });
};
