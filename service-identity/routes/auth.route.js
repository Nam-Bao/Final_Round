const express = require('express');
const { register, login } = require('../controllers/auth.controller.js');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
// Quên mật khẩu: gửi mã OTP về email, nhập mã + mật khẩu mới
const { forgotPassword, resetPassword } = require('../controllers/passwordReset.controller.js');
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;