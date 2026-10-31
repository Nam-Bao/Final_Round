const jwt = require('jsonwebtoken');

// Bắt buộc đăng nhập: chatbot và phân tích ảnh tốn phí API (Gemini, Roboflow) và xử lý ảnh khuôn mặt
const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập để sử dụng tính năng này' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
  }
};

module.exports = { verifyToken };
