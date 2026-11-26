const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Nạp .env nếu có (Node >= 20.12, không cần thư viện dotenv). Trên máy chủ thì biến môi trường do nền tảng cung cấp.
try { process.loadEnvFile(); } catch { /* không có .env => dùng biến môi trường / giá trị mặc định */ }

const app = express();
const PORT = Number(process.env.PORT) || 4000;
// Địa chỉ các service phía sau; mặc định chạy chung một máy
const TARGETS = {
    identity: process.env.IDENTITY_URL || 'http://localhost:4001',
    booking: process.env.BOOKING_URL || 'http://localhost:4002',
    commerce: process.env.COMMERCE_URL || 'http://localhost:4003',
    ai: process.env.AI_URL || 'http://localhost:4004',
    media: process.env.MEDIA_URL || 'http://localhost:4005',
};
// Web được gọi API (CORS), cách nhau dấu phẩy, vd https://glowskin.vercel.app,https://admin-glowskin.vercel.app
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map((s) => s.trim()).filter(Boolean);

// 1. Cấu hình CORS: Cho phép Client và Admin gửi Header Authorization
app.use(cors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Log request để tiện theo dõi các luồng gọi qua Gateway
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Giới hạn số request theo IP (lưu trong bộ nhớ, đủ cho 1 instance gateway).
// Đặt ở gateway vì các service phía sau chỉ thấy IP của gateway.
// onlyFailures: chỉ đếm request lỗi (vd. đăng nhập sai) để nhân viên dùng chung IP phòng khám không bị chặn oan.
const rateLimit = ({ windowMs, max, message, onlyFailures = false }) => {
    const hits = new Map();
    setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
    }, windowMs).unref();

    return (req, res, next) => {
        const now = Date.now();
        let entry = hits.get(req.ip);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(req.ip, entry);
        }
        if (entry.count >= max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ message });
        }
        if (onlyFailures) {
            res.on('finish', () => { if (res.statusCode >= 400) entry.count++; });
        } else {
            entry.count++;
        }
        next();
    };
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
// Chống dò mật khẩu
app.post('/api/identity/auth/login', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, onlyFailures: true, message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút' }));
// Quên mật khẩu: chặn spam gửi mã và dò mã OTP theo IP
app.post('/api/identity/auth/forgot-password', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 5, message: 'Bạn yêu cầu mã quá nhiều lần, vui lòng thử lại sau 15 phút' }));
app.post('/api/identity/auth/reset-password', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 15, message: 'Bạn thử quá nhiều lần, vui lòng thử lại sau 15 phút' }));
app.post('/api/identity/auth/register', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, message: 'Bạn đăng ký quá nhiều lần, vui lòng thử lại sau' }));
// Upload ảnh và phân tích AI mở cho khách vãng lai (trang chủ) nên giới hạn để tránh lạm dụng Cloudinary / Roboflow
app.post(/^\/api\/media\/pages\/(banners|popups)\/[^/]+\/click$/, rateLimit({ windowMs: FIFTEEN_MINUTES, max: 60, message: 'Thao tác quá nhanh' }));
app.post('/api/media/upload', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30, message: 'Bạn tải ảnh quá nhiều, vui lòng thử lại sau ít phút' }));
app.post('/api/ai/chat', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 40, message: 'Bạn chat quá nhanh, vui lòng thử lại sau ít phút' }));
app.post('/api/ai/analyze', rateLimit({ windowMs: FIFTEEN_MINUTES, max: 20, message: 'Bạn phân tích quá nhiều lần, vui lòng thử lại sau ít phút' }));

// Middleware chuyển tiếp Header Authorization sang các Microservice phía sau
const handleProxyReq = (proxyReq, req, res) => {
    if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
    }
};

// 2. Định tuyến (Routing) đến các Microservices

// Tuyến Identity: Nhận request /api/identity/* -> chuyển sang service-identity
app.use('/api/identity', createProxyMiddleware({
    target: TARGETS.identity,
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/identity': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Booking: Nhận request /api/booking/* -> chuyển sang service-booking (Port 4002)
app.use('/api/booking', createProxyMiddleware({
    target: TARGETS.booking,
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/booking': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Commerce (Port 4003)
app.use('/api/commerce', createProxyMiddleware({
    target: TARGETS.commerce,
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/commerce': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến AI Analysis (Port 4004)
app.use('/api/ai', createProxyMiddleware({
    target: TARGETS.ai,
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/ai': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Media (Port 4005)
app.use('/api/media', createProxyMiddleware({
    target: TARGETS.media,
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/media': '' },
    onProxyReq: handleProxyReq
}));

// Route kiểm tra Gateway
app.get('/', (req, res) => {
    res.json({ message: 'O2O API Gateway đang hoạt động hoàn hảo 🚀' });
});

// 3. Khởi động Gateway
app.listen(PORT, () => {
    console.log(`🌍 [API Gateway] đang chạy tại cổng ${PORT}`);
    Object.entries(TARGETS).forEach(([k, url]) => console.log(`🚦 Tuyến /api/${k} -> ${url}`));
});
