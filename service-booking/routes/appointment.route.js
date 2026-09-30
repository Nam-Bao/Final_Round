const express = require('express');
const { getMyTodayAppointments } = require('../controllers/appointment.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chỉ Bác sĩ mới được kéo danh sách hàng đợi của mình
router.get('/my-today', verifyToken, authorizeRoles('DOCTOR'), getMyTodayAppointments);

module.exports = router;