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

// Gọi nội bộ giữa các service: header X-Internal-Key phải trùng INTERNAL_API_KEY trong .env của cả 2 bên.
// Không dùng chung SEPAY_API_KEY vì mỗi webhook SePay có key riêng.
const verifyInternal = (req, res, next) => {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    console.error('❌ [NỘI BỘ] Chưa cấu hình INTERNAL_API_KEY trong .env => từ chối yêu cầu');
    return res.status(503).json({ message: 'Chưa cấu hình khoá nội bộ' });
  }
  if (!safeEqual(req.header('X-Internal-Key') || '', expected)) return res.status(401).json({ message: 'Unauthorized' });
  next();
};

module.exports = { verifySepay, verifyInternal, safeEqual };
