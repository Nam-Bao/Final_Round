const express = require('express');
const { getPublicReviews } = require('../controllers/review.controller');

const router = express.Router();

// GET /reviews hoặc /api/booking/reviews
router.get('/', getPublicReviews);

module.exports = router;