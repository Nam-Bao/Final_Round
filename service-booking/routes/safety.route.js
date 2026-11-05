const express = require('express');
const c = require('../controllers/safety.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const staff = [verifyToken, authorizeRoles('DOCTOR', 'CONSULTANT', 'GEN_MANAGER', 'ADMIN')];

// Sàng lọc an toàn và cảnh báo chống chỉ định khi kê đơn (gateway: /api/booking/safety/...)
router.get('/flags', ...staff, c.getFlags);
router.get('/patients/:id', ...staff, c.getPatientSafety);
router.put('/patients/:id', ...staff, c.savePatientSafety);
router.post('/check', ...staff, c.checkSafety);

module.exports = router;
