const express = require('express');
const c = require('../controllers/safety.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { verifyInternal } = require('../middlewares/webhook.middleware.js');

const router = express.Router();
const staff = [verifyToken, authorizeRoles('DOCTOR', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN')];

// Sàng lọc an toàn và cảnh báo chống chỉ định khi kê đơn (gateway: /api/booking/safety/...)
router.get('/flags', ...staff, c.getFlags);
router.get('/patients/:id', ...staff, c.getPatientSafety);
router.put('/patients/:id', ...staff, c.savePatientSafety);
router.post('/check', ...staff, c.checkSafety);
router.post('/ai-review', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), c.aiReview); // AI rà soát đơn + gợi ý thay thế

// Bán mỹ phẩm tại quầy: NVBH hỏi nhanh khách khi đơn có hoạt chất cần lưu ý; commerce ghi câu trả lời vào hồ sơ khách sau khi tạo đơn
router.post('/counter-check', verifyToken, authorizeRoles('SALES', 'GEN_MANAGER', 'ADMIN'), c.counterCheck);
router.post('/counter-report', verifyInternal, c.counterReport);

module.exports = router;
