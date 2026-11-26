// Nhờ service-identity gửi email cho khách (identity giữ email người dùng, chống gửi trùng theo key, ghi nhật ký).
// Không chờ, không ném lỗi: email lỗi không được làm hỏng nghiệp vụ. (File giống nhau ở service-booking, service-commerce, service-ai-analysis.)
// template: tên mẫu ở service-identity/utils/mailTemplates.js; key: khóa chống gửi trùng; data: dữ liệu dựng email (mã, không gửi dữ liệu y tế)
const jwt = require('jsonwebtoken');

const IDENTITY_URL = process.env.IDENTITY_URL || 'http://localhost:4001';

const sendEmail = (template, user_id, key, data = {}) => {
  if (!user_id || !process.env.JWT_SECRET) return Promise.resolve(null);
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '2m' });
  return fetch(`${IDENTITY_URL}/internal/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ template, user_id, key, data }),
    signal: AbortSignal.timeout(20000),
  }).then((r) => r.json()).catch((e) => { console.warn(`[EMAIL] Không gửi được ${template}:`, e.message); return null; });
};

module.exports = { sendEmail };

// Gửi email tới người nhận ngoài hệ thống (nhà cung cấp: to_email + to_name) hoặc mọi nhân viên của 1 vai trò (to_role).
// attachments: [{ filename, content (Buffer), contentType }]. Trả kết quả của identity ({ status }) hoặc null khi lỗi.
const sendEmailTo = ({ template, key, data = {}, to_email, to_name, to_role, attachments = [] }) => {
  if (!process.env.JWT_SECRET || (!to_email && !to_role)) return Promise.resolve(null);
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '2m' });
  return fetch(`${IDENTITY_URL}/internal/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ template, key, data, to_email, to_name, to_role, attachments: attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.content).toString('base64') })) }),
    signal: AbortSignal.timeout(30000),
  }).then((r) => r.json()).catch((e) => { console.warn(`[EMAIL] Không gửi được ${template}:`, e.message); return null; });
};

module.exports.sendEmailTo = sendEmailTo;
