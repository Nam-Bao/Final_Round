const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const { consultChat } = require('../controllers/consultChat.controller');
const { verifyToken } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.middleware.js');
const { analysisQuota, getQuota } = require('../middlewares/analysisQuota.middleware.js');

// Trang phân tích da và chatbot bắt buộc đăng nhập; mỗi lượt gọi tốn tiền Roboflow/Gemini
// => vẫn giới hạn số lượt (phân tích da: 5 lần/ngày, xem analysisQuota).
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 30, userMax: 120,
  message: 'Bạn đã gửi quá nhiều tin nhắn, vui lòng thử lại sau ít phút'
});

// Endpoint: POST /api/ai/analyze
router.post('/analyze', verifyToken, analysisQuota, aiAnalysisController.analyzeFace);
// Endpoint: GET /api/ai/quota - trang phân tích hỏi trước khi cho tải ảnh lên (khỏi upload rồi mới bị từ chối)
router.get('/quota', verifyToken, async (req, res) => {
  try { res.status(200).json({ success: true, data: await getQuota(req) }); }
  catch (err) { res.status(503).json({ success: false, message: 'Không kiểm tra được hạn mức' }); }
});
// Chatbot tư vấn trên web khách (gateway: POST /api/ai/chat) - trả lời dạng stream
router.post('/chat', verifyToken, chatLimiter, consultChat);

module.exports = router;
