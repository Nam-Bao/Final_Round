const express = require('express');
const { TIMING, CONSULT_FEE } = require('../utils/timing');

const router = express.Router();

// [PUBLIC] GET /config/timing — các mốc thời gian chờ đang áp dụng, frontend dùng để ẩn / hiện nút cho khớp server
router.get('/timing', (req, res) => res.json({ data: { ...TIMING, consultFee: CONSULT_FEE } }));

module.exports = router;
