// Quên mật khẩu bằng mã OTP gửi về email.
// - Luôn trả cùng một câu trả lời dù email có đăng ký hay không (không cho dò email nào có tài khoản).
// - Mã 6 số sinh bằng crypto, chỉ lưu HMAC của mã (lộ DB cũng không lấy được mã), hạn 15 phút, dùng 1 lần.
// - Nhập sai quá 5 lần => hủy mã, phải yêu cầu mã mới. Gửi lại mã cách nhau ít nhất 60 giây.
// - Gateway giới hạn số lần gọi theo IP (api-gateway/index.js).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, sequelize } = require('../models');
const { queueEmail } = require('../services/email');

const OTP_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const MIN_PASSWORD = 6;
const GENERIC = `Nếu email đã đăng ký tài khoản, mã xác nhận đã được gửi tới hộp thư. Mã có hiệu lực ${OTP_MINUTES} phút.`;
const INVALID = 'Mã xác nhận không đúng hoặc đã hết hạn';

const hmac = (userId, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${otp}`).digest('hex');
const findByEmail = (email) => User.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), email) });
const normEmail = (v) => String(v || '').trim().toLowerCase().slice(0, 254);
const fmt = (d) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

// POST /auth/forgot-password { email }
const forgotPassword = async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Email không hợp lệ' });
    const user = await findByEmail(email);
    if (user && user.status === 'ACTIVE') {
      const sentAt = user.reset_password_expires ? new Date(user.reset_password_expires).getTime() - OTP_MINUTES * 60000 : 0;
      // Vừa gửi mã chưa đủ 60 giây: không gửi thêm (vẫn trả câu chung)
      if (Date.now() - sentAt >= RESEND_SECONDS * 1000) {
        const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await user.update({ reset_password_token: hmac(user.id, otp), reset_password_expires: new Date(Date.now() + OTP_MINUTES * 60000), reset_password_attempts: 0 });
        await queueEmail({ template: 'OTP_RESET', user_id: user.id, key: `OTP_RESET:${user.id}:${Date.now()}`, data: { otp, minutes: OTP_MINUTES } })
          .catch((e) => console.warn('[OTP] Không gửi được email:', e.message));
      }
    }
    res.status(200).json({ message: GENERIC, resend_after: RESEND_SECONDS });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi xử lý quên mật khẩu' });
  }
};

// POST /auth/reset-password { email, otp, new_password }
const resetPassword = async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const password = String(req.body?.new_password || '');
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Mã xác nhận gồm 6 chữ số' });
    if (password.length < MIN_PASSWORD || password.length > 100) return res.status(400).json({ message: `Mật khẩu mới từ ${MIN_PASSWORD} đến 100 ký tự` });
    const user = await findByEmail(email);
    if (!user || !user.reset_password_token || !user.reset_password_expires || new Date(user.reset_password_expires) < new Date()) {
      return res.status(400).json({ message: INVALID });
    }
    if (user.reset_password_attempts >= MAX_ATTEMPTS) {
      return res.status(400).json({ message: `Đã nhập sai quá ${MAX_ATTEMPTS} lần, vui lòng yêu cầu mã mới` });
    }
    const expected = Buffer.from(user.reset_password_token);
    const given = Buffer.from(hmac(user.id, otp));
    const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!ok) {
      const attempts = user.reset_password_attempts + 1;
      // Sai đủ 5 lần => hủy mã luôn
      await user.update(attempts >= MAX_ATTEMPTS ? { reset_password_token: null, reset_password_expires: null, reset_password_attempts: attempts } : { reset_password_attempts: attempts });
      return res.status(400).json({ message: attempts >= MAX_ATTEMPTS ? `Đã nhập sai ${MAX_ATTEMPTS} lần, mã bị hủy. Vui lòng yêu cầu mã mới` : `${INVALID}. Còn ${MAX_ATTEMPTS - attempts} lần thử` });
    }
    await user.update({ password_hash: await bcrypt.hash(password, 10), reset_password_token: null, reset_password_expires: null, reset_password_attempts: 0 });
    // Báo cho chủ tài khoản biết mật khẩu vừa đổi (phát hiện người lạ đổi mật khẩu)
    queueEmail({ template: 'PASSWORD_CHANGED', user_id: user.id, key: `PASSWORD_CHANGED:${user.id}:${Date.now()}`, data: { at: fmt(new Date()) } }).catch(() => {});
    res.status(200).json({ message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật mật khẩu' });
  }
};

module.exports = { forgotPassword, resetPassword };
