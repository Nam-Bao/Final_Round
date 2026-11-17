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
