const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 4000;

// 1. Cấu hình CORS: Bắt buộc phải có để Frontend (port 3000, 3001) gọi được API
app.use(cors());

// Middleware log requests để bạn dễ debug khi code
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 2. Định tuyến (Routing) đến các Microservices

// -> Bất kỳ request nào bắt đầu bằng /api/identity sẽ được đẩy sang port 4001
app.use('/api/identity', createProxyMiddleware({ 
  target: 'http://localhost:4001', 
  changeOrigin: true,
  pathRewrite: { '^/api/identity': '' } // Cắt bỏ chữ /api/identity trước khi gửi sang service con
}));

// -> Đẩy sang Booking (Port 4002)
app.use('/api/booking', createProxyMiddleware({ 
  target: 'http://localhost:4002', 
  changeOrigin: true,
  pathRewrite: { '^/api/booking': '' }
}));

// -> Đẩy sang Commerce (Port 4003)
app.use('/api/commerce', createProxyMiddleware({ 
  target: 'http://localhost:4003', 
  changeOrigin: true,
  pathRewrite: { '^/api/commerce': '' }
}));

// -> Đẩy sang AI Analysis (Port 4004)
app.use('/api/ai', createProxyMiddleware({ 
  target: 'http://localhost:4004', 
  changeOrigin: true,
  pathRewrite: { '^/api/ai': '' }
}));

// Route mặc định kiểm tra sức khỏe của Gateway
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
});