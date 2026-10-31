const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 4000;

// 1. Cấu hình CORS: Cho phép Client và Admin gửi Header Authorization
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Log request để tiện theo dõi các luồng gọi qua Gateway
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware chuyển tiếp Header Authorization sang các Microservice phía sau
const handleProxyReq = (proxyReq, req, res) => {
    if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
    }
};

// 2. Định tuyến (Routing) đến các Microservices

// Tuyến Identity: Nhận request /api/identity/* -> chuyển sang service-identity
app.use('/api/identity', createProxyMiddleware({
    target: 'http://localhost:4001',
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/identity': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Booking: Nhận request /api/booking/* -> chuyển sang service-booking (Port 4002)
app.use('/api/booking', createProxyMiddleware({
    target: 'http://localhost:4002',
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/booking': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Commerce (Port 4003)
app.use('/api/commerce', createProxyMiddleware({
    target: 'http://localhost:4003',
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/commerce': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến AI Analysis (Port 4004)
app.use('/api/ai', createProxyMiddleware({
    target: 'http://localhost:4004',
    changeOrigin: true,
    xfwd: true, // gửi X-Forwarded-For => service biết IP thật của khách (dùng cho giới hạn lượt gọi)
    pathRewrite: { '^/api/ai': '' },
    onProxyReq: handleProxyReq
}));

// Tuyến Media (Port 4005)
app.use('/api/media', createProxyMiddleware({
    target: 'http://localhost:4005',
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
    console.log(`🌍 [API Gateway] đang chạy tại http://localhost:${PORT}`);
    console.log(`🚦 Tuyến /api/identity -> Chuyển đến Port 4001`);
    console.log(`🚦 Tuyến /api/booking  -> Chuyển đến Port 4002`);
    console.log(`🚦 Tuyến /api/commerce -> Chuyển đến Port 4003`);
    console.log(`🚦 Tuyến /api/ai       -> Chuyển đến Port 4004`);
    console.log(`🚦 Tuyến /api/media    -> Chuyển đến Port 4005`);
});