const express = require('express');
const { getPublicReviews, getDoctorStats, getMyReviews, createReview } = require('../controllers/review.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// GET /reviews?doctor_id= (gateway: /api/booking/reviews)
router.get('/', getPublicReviews);
router.get('/doctor-stats', getDoctorStats);
router.get('/mine', verifyToken, authorizeRoles('CUSTOMER'), getMyReviews);
router.post('/', verifyToken, authorizeRoles('CUSTOMER'), createReview);

module.exports = router;
