// Tệp gửi trong chat CSKH (ảnh / PDF, tải qua service-media POST /upload/chat => thư mục O2O_Chat trên Cloudinary).
// - normalize: chỉ nhận tệp của hệ thống (https://res.cloudinary.com/.../O2O_Chat/...), tối đa 5 tệp / tin nhắn.
// - Hết hạn lưu (CHAT_FILE_RETENTION_DAYS, mặc định 730 ngày = 2 năm): nhờ service-media xoá tệp, tin nhắn ghi "tệp đã hết hạn lưu".
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const MAX_FILES = 5;
const RETENTION_DAYS = Number(process.env.CHAT_FILE_RETENTION_DAYS || 730);
const MEDIA_URL = () => process.env.MEDIA_URL || 'http://localhost:4005';

const isChatFile = (url, type) => {
  try {
    const u = new URL(String(url));
    const [, , kind, upload] = u.pathname.split('/');
    return u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && upload === 'upload'
      && u.pathname.includes('/O2O_Chat/') && ((type === 'image' && kind === 'image') || (type === 'pdf' && kind === 'raw'));
  } catch { return false; }
};

const normalize = (list) => (Array.isArray(list) ? list : []).slice(0, MAX_FILES)
  .map((f) => ({
    url: String(f?.url || ''),
    type: f?.type === 'pdf' ? 'pdf' : 'image',
    name: String(f?.name || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 120) || (f?.type === 'pdf' ? 'tai-lieu.pdf' : 'anh'),
    size: Math.max(0, Number(f?.size) || 0),
  }))
  .filter((f) => isChatFile(f.url, f.type));

// Mỗi ngày: xoá tệp chat quá hạn lưu
const runRetention = async (ChatMessage) => {
  const before = new Date(Date.now() - RETENTION_DAYS * 86400000);
  const rows = await ChatMessage.findAll({ where: { createdAt: { [Op.lt]: before }, attachments: { [Op.ne]: null } }, limit: 500 });
  const withFiles = rows.filter((m) => Array.isArray(m.attachments) && m.attachments.length);
  if (!withFiles.length) return 0;
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
  const urls = withFiles.flatMap((m) => m.attachments.map((f) => f.url));
  for (let i = 0; i < urls.length; i += 50) {
    const res = await fetch(`${MEDIA_URL()}/upload/skin/delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ urls: urls.slice(i, i + 50) }), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error('service-media không xoá được tệp');
  }
  for (const m of withFiles) {
    await m.update({ attachments: null, content: `${m.content ? `${m.content} ` : ''}(${m.attachments.length} tệp đính kèm đã hết hạn lưu)` });
  }
  return withFiles.length;
};
const startRetentionJob = (ChatMessage) => {
  const tick = () => runRetention(ChatMessage)
    .then((n) => n && console.log(`[Chat] đã xoá tệp của ${n} tin nhắn quá ${RETENTION_DAYS} ngày`))
    .catch((e) => console.error('[Chat] chưa xoá được tệp quá hạn, thử lại lần sau:', e.message));
  setTimeout(tick, 60 * 1000);
  setInterval(tick, 24 * 3600 * 1000).unref();
};

module.exports = { normalize, isChatFile, runRetention, startRetentionJob, MAX_FILES };
