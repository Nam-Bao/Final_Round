// Gửi email qua SMTP (nodemailer). Cấu hình trong .env:
//   MAIL_MODE=smtp | log   (log: không gửi thật, ghi email ra thư mục MAIL_LOG_DIR để xem khi test / demo không có mạng)
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
// Chưa khai báo SMTP_HOST thì tự chuyển sang chế độ log.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const mode = () => (process.env.MAIL_MODE === 'smtp' && process.env.SMTP_HOST ? 'smtp' : 'log');
const LOG_DIR = () => path.resolve(process.env.MAIL_LOG_DIR || path.join(__dirname, '..', 'mail-outbox'));

let transport = null;
const smtp = () => {
  transport ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true cho cổng 465
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transport;
};

const from = () => process.env.MAIL_FROM || (process.env.SMTP_USER ? `GlowSkin <${process.env.SMTP_USER}>` : 'GlowSkin <no-reply@glowskin.local>');

// { to, subject, html, text } => { mode, id }
const send = async ({ to, subject, html, text, key }) => {
  if (mode() === 'smtp') {
    const info = await smtp().sendMail({ from: from(), to, subject, html, text });
    return { mode: 'smtp', id: info.messageId };
  }
  const dir = LOG_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(key || Date.now()).replace(/[^\w.-]+/g, '_').slice(0, 120);
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safe}.html`);
  fs.writeFileSync(file, `<!-- To: ${to}\nSubject: ${subject} -->\n${html}`);
  return { mode: 'log', id: file };
};

module.exports = { send, mode };
