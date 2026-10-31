const crypto = require('crypto');

// So sánh chuỗi bí mật theo thời gian hằng (tránh dò key qua thời gian phản hồi)
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

// Webhook SePay: cấu hình "Chứng thực = API Key" trên my.sepay.vn, SePay gửi header "Authorization: Apikey <KEY>".
// Key phải trùng SEPAY_API_KEY trong .env. Chưa cấu hình key => từ chối tất cả (không mở cửa cho webhook giả).
const verifySepay = (req, res, next) => {
  const expected = process.env.SEPAY_API_KEY;
  if (!expected) {
    console.error('❌ [SEPAY WEBHOOK] Chưa cấu hình SEPAY_API_KEY trong .env => từ chối webhook');
    return res.status(503).json({ success: false, message: 'Webhook chưa được cấu hình' });
  }
  const header = req.header('Authorization') || '';
  const [scheme, key] = header.split(' ');
  if (!/^apikey$/i.test(scheme || '') || !key || !safeEqual(key, expected)) {
    console.warn('⚠️ [SEPAY WEBHOOK] Sai API key, bỏ qua request từ', req.ip);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

module.exports = { verifySepay, safeEqual };
