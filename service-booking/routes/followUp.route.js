const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { getCallLists, saveCall, getCallHistory } = require('../controllers/followUp.controller.js');

const router = express.Router();
const staff = [verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN')];

router.get('/calls', ...staff, getCallLists);
router.get('/calls/history', ...staff, getCallHistory);
router.post('/calls', ...staff, saveCall);

module.exports = router;
