const express = require('express');
const { getShifts, createShifts, deleteShift, getMyShifts, createShiftRequest, getShiftRequests, handleShiftRequest, getMyShiftRequests } = require('../controllers/shift.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// 1. NHÓM QUYỀN ADMIN & QUẢN LÝ
router.get('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getShifts);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createShifts);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deleteShift);
router.get('/requests', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getShiftRequests);
router.put('/requests/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), handleShiftRequest);

// 2. NHÓM QUYỀN NHÂN VIÊN (Bác sĩ, Tư vấn viên, Kỹ thuật viên, Sale)
const employeeRoles = ['DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES'];
router.get('/my-shifts', verifyToken, authorizeRoles(...employeeRoles), getMyShifts);
router.post('/request-off', verifyToken, authorizeRoles(...employeeRoles), createShiftRequest);
router.get('/my-requests', verifyToken, authorizeRoles(...employeeRoles), getMyShiftRequests);

module.exports = router;