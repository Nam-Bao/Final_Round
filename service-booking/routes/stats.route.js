const express = require('express');
const { getPublicStats } = require('../controllers/stats.controller');

const router = express.Router();

// GET /stats/public (gateway: /api/booking/stats/public)
router.get('/public', getPublicStats);

module.exports = router;
