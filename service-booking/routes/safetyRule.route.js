const express = require('express');
const c = require('../controllers/safetyRule.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
// Chỉ QUẢN LÝ CHUNG duyệt / quản lý quy tắc (admin không tham gia); bác sĩ xem xét và đề xuất
const manager = [verifyToken, authorizeRoles('GEN_MANAGER')];
const doctor = [verifyToken, authorizeRoles('DOCTOR')];
const both = [verifyToken, authorizeRoles('GEN_MANAGER', 'DOCTOR')];

// Quy tắc chống chỉ định (gateway: /api/booking/safety-rules/...)
router.get('/meta', ...both, c.getMeta);
router.get('/reviews/mine', ...doctor, c.myReviews);
router.get('/proposals/mine', ...doctor, c.myProposals);
router.post('/preview-target', ...both, c.previewTarget);
router.post('/test', ...both, c.testRule);
router.get('/', ...both, c.listRules);                       // bác sĩ: chỉ quy tắc đang áp dụng
router.post('/', ...both, c.createRule);                     // quản lý soạn / bác sĩ đề xuất
router.get('/:id', ...both, c.getRule);
router.put('/:id', ...both, c.updateRule);
router.post('/:id/revise', ...both, c.reviseRule);           // sửa / ngưng quy tắc đang áp dụng (tạo bản mới)
router.post('/:id/propose', ...doctor, c.proposeRule);
router.post('/:id/request-changes', ...manager, c.requestChanges);
router.post('/:id/submit', ...manager, c.submitRule);
router.post('/:id/reviewers', ...manager, c.replaceReviewer);
router.post('/:id/review', ...doctor, c.reviewRule);
router.post('/:id/approve', ...manager, c.approveRule);
router.post('/:id/reject', ...manager, c.rejectRule);

module.exports = router;
