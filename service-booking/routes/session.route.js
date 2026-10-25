const express = require('express');
const { getTechnicianQueues, updateSessionStatus, getMySessions, getPatientSessions } = require('../controllers/session.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/technician-queues', verifyToken, authorizeRoles('TECHNICIAN'), getTechnicianQueues);
router.get('/my-sessions', verifyToken, authorizeRoles('CUSTOMER'), getMySessions);
router.get('/patient/:patientProfileId', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'CONSULTANT', 'DOCTOR'), getPatientSessions);
router.put('/:id/status', verifyToken, authorizeRoles('TECHNICIAN'), updateSessionStatus);

module.exports = router;