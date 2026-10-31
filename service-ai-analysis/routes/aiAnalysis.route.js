const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const { optionalAuth } = require('../middlewares/auth.middleware.js');
const { rateLimit } = require('../middlewares/rateLimit.middleware.js');
const { analysisQuota, getQuota } = require('../middlewares/analysisQuota.middleware.js');

// Trang phân tích da và chatbot là công khai (khách vãng lai dùng được), nhưng mỗi lượt gọi tốn tiền
// Roboflow/Gemini => giới hạn số lượt. Phân tích da: vãng lai 1 lần, đăng nhập 5 lần/ngày (xem analysisQuota).
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, guestMax: 30, userMax: 120,
  message: 'Bạn đã gửi quá nhiều tin nhắn, vui lòng thử lại sau ít phút'
});

// Endpoint: POST /api/ai/analyze
router.post('/analyze', optionalAuth, analysisQuota, aiAnalysisController.analyzeFace);
// Endpoint: GET /api/ai/quota - trang phân tích hỏi trước khi cho tải ảnh lên (khỏi upload rồi mới bị từ chối)
router.get('/quota', optionalAuth, async (req, res) => {
  try { res.status(200).json({ success: true, data: await getQuota(req) }); }
  catch (err) { res.status(503).json({ success: false, message: 'Không kiểm tra được hạn mức' }); }
});
// Endpoint: POST /api/ai/chat (chatbot tư vấn - trước đây gọi Gemini thẳng từ trình duyệt, lộ API key)
router.post('/chat', optionalAuth, chatLimiter, aiAnalysisController.chat);

module.exports = router;
