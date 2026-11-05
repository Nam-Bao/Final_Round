const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const c = require('../controllers/consultation.controller.js');

const customer = [verifyToken, authorizeRoles('CUSTOMER')];
const expert = [verifyToken, authorizeRoles('EXPERT')];
const staff = [verifyToken, authorizeRoles(...c.STAFF_ROLES)];
const manager = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// 1. Công khai: giờ trống, điểm đánh giá & nhận xét của chuyên gia
router.get('/slots', c.getAvailableConsultSlots);
router.get('/expert-stats', c.getPublicExpertStats);
router.get('/reviews', c.getPublicConsultReviews);

// 2. Đường dẫn tĩnh (đặt trước /:id)
router.get('/mine', customer, c.getMyConsultations);
router.get('/expert/mine', expert, c.getExpertConsultations);
router.get('/expert/stats', expert, c.getMyExpertStats);
router.get('/stats', manager, c.getConsultStats);
router.get('/payouts', manager, c.getPayouts);
router.post('/payouts/close', manager, c.closePayouts);
router.put('/payouts/:id/paid', manager, c.markPayoutPaid);
router.get('/shifts', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'EXPERT'), c.getExpertShifts);
router.post('/shifts', manager, c.createExpertShifts);
router.delete('/shifts/:id', manager, c.deleteExpertShift);
router.get('/', staff, c.getAllConsultations);
router.post('/', customer, c.createConsultation);

// 3. Theo từng lịch tư vấn
router.get('/:id/check-payment', customer, c.checkConsultPayment);
router.delete('/:id/unpaid', customer, c.abandonUnpaidConsultation);
router.get('/:id/video-token', verifyToken, authorizeRoles('CUSTOMER', 'EXPERT'), c.getConsultVideoToken);
router.put('/:id/cancel', verifyToken, authorizeRoles('CUSTOMER', ...c.STAFF_ROLES), c.cancelConsultation);
router.post('/:id/review', customer, c.reviewConsultation);
router.put('/:id/result', expert, c.saveConsultResult);
router.put('/:id/reschedule', customer, c.rescheduleConsultation);
router.put('/:id/confirm-payment', staff, c.confirmConsultPayment);
router.put('/:id/review-visibility', manager, c.setReviewVisibility);
router.put('/:id/refund', staff, c.confirmConsultRefund);

module.exports = router;
