const express = require('express');
const c = require('../controllers/hr.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Hồ sơ nhân sự (có CCCD, ngân hàng, thuế): chỉ Admin / Quản lý
router.get('/records', ...managers, c.listRecords);
router.post('/records', ...managers, c.createRecord);
router.get('/records/:userId', ...managers, c.getRecord);
router.put('/records/:userId', ...managers, c.updateRecord);
router.delete('/records/:userId', ...managers, c.deleteRecord);

module.exports = router;
