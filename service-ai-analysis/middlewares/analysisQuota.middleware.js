const { AiAnalysis } = require('../models');

// Hạn mức phân tích da (mỗi lượt gọi Roboflow tốn tiền):
// - Khách vãng lai: GUEST_LIMIT lượt / GUEST_WINDOW_HOURS giờ, tính theo IP
// - Khách đã đăng nhập: USER_LIMIT lượt / ngày (reset lúc 00:00)
// Đếm từ MongoDB (chỉ lượt thành công) => khởi động lại service không bị reset, phân tích lỗi không mất lượt.
const GUEST_LIMIT = Number(process.env.AI_GUEST_LIMIT || 1);
const GUEST_WINDOW_HOURS = Number(process.env.AI_GUEST_WINDOW_HOURS || 24);
const USER_LIMIT = Number(process.env.AI_USER_DAILY_LIMIT || 5);

const isMember = (req) => req.user?.role === 'CUSTOMER';

const getQuota = async (req) => {
  if (isMember(req)) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const used = await AiAnalysis.countDocuments({ customer_id: req.user.id, status: 'success', createdAt: { $gte: startOfDay } });
    return { isGuest: false, limit: USER_LIMIT, used, remaining: Math.max(0, USER_LIMIT - used), period: 'day' };
  }
  const since = new Date(Date.now() - GUEST_WINDOW_HOURS * 60 * 60 * 1000);
  const used = await AiAnalysis.countDocuments({ customer_id: 'GUEST_ANALYSIS', client_ip: req.ip, status: 'success', createdAt: { $gte: since } });
  return { isGuest: true, limit: GUEST_LIMIT, used, remaining: Math.max(0, GUEST_LIMIT - used), period: `${GUEST_WINDOW_HOURS}h` };
};

// Đang có 1 lượt phân tích chạy cho cùng tài khoản/IP => chặn lượt song song (tránh bấm nhiều lần lách hạn mức)
const inFlight = new Set();

const analysisQuota = async (req, res, next) => {
  const key = isMember(req) ? `u:${req.user.id}` : `ip:${req.ip}`;
  if (inFlight.has(key)) {
    return res.status(429).json({ success: false, message: 'Ảnh trước đang được phân tích, vui lòng đợi' });
  }
  try {
    const quota = await getQuota(req);
    if (quota.remaining <= 0) {
      return res.status(429).json({
        success: false,
        code: quota.isGuest ? 'GUEST_QUOTA_EXCEEDED' : 'DAILY_QUOTA_EXCEEDED',
        message: quota.isGuest
          ? 'Khách vãng lai chỉ được phân tích 1 lần. Vui lòng đăng nhập/đăng ký để phân tích thêm (5 lần mỗi ngày).'
          : `Bạn đã dùng hết ${quota.limit} lượt phân tích hôm nay, vui lòng quay lại vào ngày mai.`,
        quota
      });
    }
  } catch (err) {
    return res.status(503).json({ success: false, message: 'Không kiểm tra được hạn mức, vui lòng thử lại' });
  }
  inFlight.add(key);
  res.on('finish', () => inFlight.delete(key));
  res.on('close', () => inFlight.delete(key));
  next();
};

module.exports = { analysisQuota, getQuota };
