const express = require('express');
const { getPublicReviews, getDoctorStats, getMyReviews, createReview, getPublicServiceReviews, getMyServiceReviews, createServiceReview } = require('../controllers/review.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// GET /reviews?doctor_id= (gateway: /api/booking/reviews)
router.get('/', getPublicReviews);
router.get('/doctor-stats', getDoctorStats);
router.get('/mine', verifyToken, authorizeRoles('CUSTOMER'), getMyReviews);
router.post('/', verifyToken, authorizeRoles('CUSTOMER'), createReview);

// Đánh giá dịch vụ lẻ / buổi liệu trình
router.get('/services', getPublicServiceReviews);
router.get('/services/mine', verifyToken, authorizeRoles('CUSTOMER'), getMyServiceReviews);
router.post('/services', verifyToken, authorizeRoles('CUSTOMER'), createServiceReview);

module.exports = router;
