const express = require('express');
const { getActivePackages, getAllPackagesForAdmin, createPackage, updatePackage, deletePackage } = require('../controllers/package.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js'); // File này bạn đã copy từ service-identity sang

const { getMyPackages, bookNextSession, cancelMySession } = require('../controllers/customerPackage.controller.js');

const router = express.Router();

// Khách: gói đã mua, đặt / hủy buổi liệu trình tiếp theo
router.get('/mine', verifyToken, authorizeRoles('CUSTOMER'), getMyPackages);
router.post('/mine/:id/sessions', verifyToken, authorizeRoles('CUSTOMER'), bookNextSession);
router.delete('/mine/sessions/:sessionId', verifyToken, authorizeRoles('CUSTOMER'), cancelMySession);

router.get('/', getActivePackages);
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'MANAGER', 'QUANLY'), getAllPackagesForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPackage);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePackage);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePackage);

module.exports = router;