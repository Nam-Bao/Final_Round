const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const { getMyPoints, getCustomerPoints } = require('../controllers/points.controller.js');

const router = express.Router();

router.get('/me', verifyToken, authorizeRoles('CUSTOMER'), getMyPoints);
router.get('/customers/:id', verifyToken, authorizeRoles('CONSULTANT', 'GEN_MANAGER', 'ADMIN'), getCustomerPoints);

module.exports = router;
