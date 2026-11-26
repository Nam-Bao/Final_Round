const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { getPatientRecord } = require('../controllers/patientRecord.controller');

const router = express.Router();
// Sổ y bạ đầy đủ (gateway: GET /api/booking/patient-record/:profileId). Bác sĩ chỉ xem hồ sơ đã có lịch khám với mình
router.get('/:profileId', verifyToken, authorizeRoles('DOCTOR', 'GEN_MANAGER', 'ADMIN'), getPatientRecord);

module.exports = router;
