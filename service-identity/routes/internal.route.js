// Đường nội bộ cho các service khác (token hệ thống { sys: true }), không dành cho người dùng
const express = require('express');
const { systemOnly } = require('../controllers/printInfo.controller.js');
const { queueEmail } = require('../services/email');
const { User } = require('../models');

const router = express.Router();

// POST /internal/email { template, key, data, user_id | to_email + to_name | to_role, attachments? } — xếp email vào nhật ký và gửi (trùng key thì bỏ qua)
// to_role: gửi cho mọi nhân viên đang làm của vai trò đó (vd GEN_MANAGER), mỗi người 1 email (key:mã người)
const STAFF_ROLES = ['ADMIN', 'GEN_MANAGER', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES'];
router.post('/email', systemOnly, async (req, res) => {
  try {
    const { template, user_id, key, data, to_email, to_name, to_role, attachments } = req.body || {};
    const payload = { template, data: data && typeof data === 'object' ? data : {}, attachments };
    if (to_role) {
      if (!STAFF_ROLES.includes(to_role)) return res.status(400).json({ message: 'Vai trò không hợp lệ' });
      const users = await User.findAll({ where: { role: to_role, status: 'ACTIVE' }, attributes: ['id'] });
      const results = [];
      for (const u of users) results.push(await queueEmail({ ...payload, user_id: u.id, key: `${String(key || '')}:${u.id}`.slice(0, 200) }));
      return res.json({ status: 'QUEUED', count: results.length, results });
    }
    res.json(await queueEmail({ ...payload, user_id, to_email, to_name, key: String(key || '') }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
