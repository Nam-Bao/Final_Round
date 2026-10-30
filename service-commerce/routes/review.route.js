const express = require('express');
const { getAllProductReviews, getProductReviews, getMyReviews, createReview } = require('../controllers/review.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', getAllProductReviews);
router.get('/product/:productId', getProductReviews);
router.get('/mine', verifyToken, authorizeRoles('CUSTOMER'), getMyReviews);
router.post('/', verifyToken, authorizeRoles('CUSTOMER'), createReview);

module.exports = router;
