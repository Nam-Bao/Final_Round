const express = require('express');
const { 
  getActiveServices, getAllServicesForAdmin, 
  createService, updateService, deleteService 
} = require('../controllers/spaService.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.get('/', getActiveServices);
router.get('/admin', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), getAllServicesForAdmin);
router.post('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), createService);
router.put('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), updateService);
router.delete('/:id', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER'), deleteService);

module.exports = router;