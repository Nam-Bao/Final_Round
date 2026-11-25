const express = require('express');
const router = express.Router();
const aiAnalysisController = require('../controllers/aiAnalysis.controller');
const analysisReview = require('../controllers/analysisReview.controller');
const queue = require('../controllers/skinReviewQueue.controller');
const chatbot = require('../controllers/chatbot.controller');
const { verifyToken, optionalAuth, authorizeRoles, systemOnly } = require('../middlewares/auth.middleware.js');
const clinic = require('../controllers/clinicScan.controller');
const face = require('../controllers/face.controller');
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
// Lịch sử soi da + bác sĩ xác nhận / hiệu chỉnh kết quả AI
const staffRoles = authorizeRoles('DOCTOR', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN');
router.get('/analyses/mine', verifyToken, authorizeRoles('CUSTOMER'), analysisReview.listMine);
router.get('/analyses/profile/:profileId', verifyToken, staffRoles, analysisReview.listByProfile);
router.get('/analyses/profile/:profileId/pending', verifyToken, staffRoles, analysisReview.latestPending);
router.put('/analyses/:id/review', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), analysisReview.saveReview);
// Xác nhận làm sau: giao việc khi hoàn tất khám, trang danh sách, giao lại, việc đang chờ, dữ liệu huấn luyện
router.post('/analyses/profile/:profileId/assign', verifyToken, authorizeRoles('DOCTOR'), queue.assignLatest);
router.put('/analyses/:id/assign-to', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN'), queue.reassign);
router.get('/reviews', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), queue.listReviews);
router.get('/tasks/mine', verifyToken, queue.tasksMine);
router.get('/training/stats', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN'), queue.trainingStats);
// Khách: rút lại đồng ý dùng ảnh để huấn luyện, nhắc kết quả bác sĩ đã xem lại
router.put('/analyses/consent/withdraw', verifyToken, authorizeRoles('CUSTOMER'), queue.withdrawConsent);
router.get('/analyses/mine/unseen', verifyToken, authorizeRoles('CUSTOMER'), queue.unseenCount);
router.post('/analyses/mine/seen', verifyToken, authorizeRoles('CUSTOMER'), queue.markSeen);
router.delete('/analyses/:id', verifyToken, authorizeRoles('CUSTOMER'), queue.deleteMine);
// Sàng lọc AI ảnh CSKH chụp tại phòng khám (booking gọi bằng token hệ thống) + bác sĩ ghi nhận khách đồng ý dùng ảnh cải thiện AI
router.post('/analyses/clinic', systemOnly, clinic.scanClinic);
router.put('/analyses/:id/training-consent', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), clinic.recordTrainingConsent);
// Ảnh gốc khuôn mặt nhân viên + xác thực ảnh chấm công (booking gọi /faces/verify bằng token hệ thống)
const faceStaff = authorizeRoles('DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN');
const faceManager = authorizeRoles('GEN_MANAGER', 'ADMIN');
router.get('/faces/me', verifyToken, faceStaff, face.myFace);
router.post('/faces/enroll', verifyToken, faceStaff, face.enroll);
router.delete('/faces/me', verifyToken, faceStaff, face.revokeMine);
router.post('/faces/verify', systemOnly, face.verify);
router.get('/faces', verifyToken, faceManager, face.list);
router.post('/faces/:userId/review', verifyToken, faceManager, face.review);
router.get('/faces/:userId/reference', verifyToken, faceManager, face.reference);
router.delete('/faces/:userId', verifyToken, faceManager, face.remove);

// Endpoint: GET /api/ai/quota - trang phân tích hỏi trước khi cho tải ảnh lên (khỏi upload rồi mới bị từ chối)
router.get('/quota', optionalAuth, async (req, res) => {
  try { res.status(200).json({ success: true, data: await getQuota(req) }); }
  catch (err) { res.status(503).json({ success: false, message: 'Không kiểm tra được hạn mức' }); }
});
// Chatbot tư vấn trên web khách (gateway: POST /api/ai/chat): RAG trên kho kiến thức, trả JSON kèm nguồn trích dẫn.
// Dữ liệu riêng (lịch hẹn, điểm, đơn hàng) chỉ xem khi khách đồng ý trong phiên chat (/chat/consent)
router.post('/chat', optionalAuth, chatLimiter, chatbot.chat);
const customerOnly = [verifyToken, authorizeRoles('CUSTOMER')];
router.get('/chat/consent', customerOnly, chatbot.listConsent);
router.post('/chat/consent', customerOnly, chatbot.grantConsent);
router.delete('/chat/consent', customerOnly, chatbot.revokeConsent);
// Kho kiến thức RAG (chatbot + AI rà soát đơn): quản lý xem tình trạng, nạp lại ngay
router.get('/knowledge/status', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN'), chatbot.knowledgeStatus);
router.post('/knowledge/reindex', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN'), chatbot.reindex);
// Trợ lý AI cho nhân viên (RAG): CSKH gợi ý câu trả lời khi chat với khách; soạn quy tắc an toàn thì tìm quy tắc trùng / mâu thuẫn
const assistLimiter = rateLimit({ windowMs: 60 * 60 * 1000, guestMax: 0, userMax: 120, message: 'Đã dùng trợ lý AI quá nhiều lần, vui lòng thử lại sau' });
router.post('/assist/reply-draft', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER'), assistLimiter, chatbot.draftReply);
router.post('/assist/similar-rules', verifyToken, authorizeRoles('GEN_MANAGER', 'DOCTOR'), assistLimiter, chatbot.similarRules);
const staffAll = authorizeRoles('DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES', 'EXPERT', 'GEN_MANAGER', 'ADMIN');
router.post('/assist/handbook', verifyToken, staffAll, assistLimiter, chatbot.handbookAsk); // sổ tay quy trình nội bộ
router.get('/assist/handbook/topics', verifyToken, staffAll, chatbot.handbookTopics);
router.post('/assist/product-advice', verifyToken, authorizeRoles('SALES', 'GEN_MANAGER', 'ADMIN'), assistLimiter, chatbot.productAdvice); // NVBH tư vấn tại quầy

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
