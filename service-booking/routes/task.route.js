const express = require('express');
const { getMyTasks } = require('../controllers/task.controller');
const { verifyToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();
router.get('/mine', verifyToken, getMyTasks); // việc đang chờ người dùng xử lý (chuông thông báo)

module.exports = router;
