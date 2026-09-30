const express = require('express');
const { getActivePackages, getAllPackagesForAdmin, createPackage, updatePackage, deletePackage } = require('../controllers/package.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js'); // File này bạn đã copy từ service-identity sang

const router = express.Router();

router.get('/', getActivePackages);
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllPackagesForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createPackage);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updatePackage);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deletePackage);

module.exports = router;