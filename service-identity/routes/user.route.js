const express = require('express');
const { getAllUsers } = require('../controllers/user.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Chuỗi phòng thủ: Request -> verifyToken -> authorizeRoles -> getAllUsers
router.get(
  '/', 
  verifyToken, 
  authorizeRoles('ADMIN', 'GEN_MANAGER'), 
  getAllUsers
);

module.exports = router;