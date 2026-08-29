const express = require('express');
const { getMyProfile } = require('../controllers/profile.controller.js');
const { verifyToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();

// Để verifyToken ở giữa: Request -> Middleware (verifyToken) -> Controller (getMyProfile)
router.get('/me', verifyToken, getMyProfile);

module.exports = router;