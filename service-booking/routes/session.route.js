const express = require('express');
const { getTechnicianQueues, updateSessionStatus } = require('../controllers/session.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/technician-queues', verifyToken, authorizeRoles('TECHNICIAN'), getTechnicianQueues);
router.put('/:id/status', verifyToken, authorizeRoles('TECHNICIAN'), updateSessionStatus);

module.exports = router;