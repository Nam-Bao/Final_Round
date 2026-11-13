const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const { consultChat } = require('../controllers/consultChat.controller');
const { verifyToken, optionalAuth, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { reviewPrescription, SafetyReviewError } = require('../services/safetyReview');
const { rateLimit } = require('../middlewares/rateLimit.middleware.js');
const { analysisQuota, getQuota } = require('../middlewares/analysisQuota.middleware.js');

// Quy tắc: chưa đăng nhập vẫn chat với chatbot AI và quét da 1 lần (theo IP, 24 giờ);
// đăng nhập thì quét 3 lượt/ngày (xem analysisQuota). Chat với CSKH bắt buộc đăng nhập (kiểm tra ở socket).
// Mỗi lượt gọi tốn tiền Roboflow/Gemini => vẫn giới hạn số lượt.
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
// Chatbot tư vấn trên web khách (gateway: POST /api/ai/chat) - trả lời dạng stream
router.post('/chat', optionalAuth, chatLimiter, consultChat);

// Endpoint: POST /api/ai/safety-review — service-booking gửi dữ liệu ca khám đã gom, AI rà soát đơn kê (bác sĩ tham khảo)
const safetyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, guestMax: 0, userMax: 60, message: 'Đã dùng AI rà soát quá nhiều lần, vui lòng thử lại sau' });
router.post('/safety-review', verifyToken, authorizeRoles('DOCTOR', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN'), safetyLimiter, async (req, res) => {
  try {
    const { patient, prescription, rule_warnings } = req.body || {};
    if (!patient || !Array.isArray(prescription) || !prescription.length) return res.status(400).json({ message: 'Chưa có mục nào trong đơn để rà soát' });
    const data = await reviewPrescription({ patient, prescription, rule_warnings: rule_warnings || [] });
    res.status(200).json({ data });
  } catch (error) {
    if (error instanceof SafetyReviewError) return res.status(503).json({ message: error.message });
    console.error('❌ [AI rà soát đơn]', error.message);
    res.status(500).json({ message: 'Lỗi AI rà soát đơn' });
  }
});

module.exports = router;
