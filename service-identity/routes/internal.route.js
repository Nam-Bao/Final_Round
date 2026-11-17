// Đường nội bộ cho các service khác (token hệ thống { sys: true }), không dành cho người dùng
const express = require('express');
const { systemOnly } = require('../controllers/printInfo.controller.js');
const { queueEmail } = require('../services/email');

const router = express.Router();

// POST /internal/email { template, user_id, key, data } — xếp email vào nhật ký và gửi (trùng key thì bỏ qua)
router.post('/email', systemOnly, async (req, res) => {
  try {
    const { template, user_id, key, data } = req.body || {};
    res.json(await queueEmail({ template, user_id, key: String(key || ''), data: data && typeof data === 'object' ? data : {} }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
