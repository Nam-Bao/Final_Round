// So ảnh chấm công với ảnh gốc khuôn mặt của nhân viên (service AI giữ dữ liệu khuôn mặt, booking chỉ lưu kết quả).
// Không chặn chấm công: lỗi / AI không trả lời => status ERROR, lượt chấm được gắn cờ để quản lý xem.
const axios = require('axios');
const jwt = require('jsonwebtoken');

const GATEWAY = () => process.env.GATEWAY_URL || 'http://localhost:4000';
// Các kết quả cần quản lý xác nhận (NO_REFERENCE: nhân viên chưa có ảnh gốc được duyệt => quản lý xem ảnh như trước, không gắn cờ)
const FLAGGED = ['REVIEW', 'NO_MATCH', 'NO_FACE', 'MULTI_FACE', 'ERROR'];

const verifyFace = async (userId, photoUrl) => {
  try {
    const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
    const res = await axios.post(`${GATEWAY()}/api/ai/faces/verify`, { user_id: userId, photo_url: photoUrl }, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    return { ...res.data.data, checked_at: new Date().toISOString() };
  } catch (e) {
    console.warn('Không so được khuôn mặt chấm công:', e.response?.data?.message || e.message);
    return { status: 'ERROR', checked_at: new Date().toISOString() };
  }
};

module.exports = { verifyFace, FLAGGED };
