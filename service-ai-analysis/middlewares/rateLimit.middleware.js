// Giới hạn số lượt gọi trong 1 khung thời gian (lưu trong RAM, đủ cho 1 instance).
// Người đã đăng nhập tính theo user id, khách vãng lai tính theo IP thật (gateway chuyển qua X-Forwarded-For).
const rateLimit = ({ windowMs, guestMax, userMax, message }) => {
  const hits = new Map(); // key -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();
    const key = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`;
    const max = req.user?.id ? userMax : guestMax;

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (hits.size > 10000) { // dọn bớt key hết hạn để không phình bộ nhớ
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
};

module.exports = { rateLimit };
