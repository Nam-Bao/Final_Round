const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');
const c = require('../controllers/points.controller.js');

const router = express.Router();

router.get('/config', c.getConfig);
router.get('/me', verifyToken, authorizeRoles('CUSTOMER'), c.getMyPoints);
// NVBH cần xem điểm khi khách trả bằng điểm tại quầy
router.get('/customers/:id', verifyToken, authorizeRoles('CONSULTANT', 'SALES', 'GEN_MANAGER', 'ADMIN'), c.getCustomerPoints);
// Báo cáo điểm: phát ra / đã dùng / hết hạn / đang lưu hành
router.get('/report', verifyToken, authorizeRoles('GEN_MANAGER', 'ADMIN'), c.report);

// Nội bộ cho service-commerce (token hệ thống): mua mỹ phẩm bằng điểm, hoàn điểm
router.get('/internal/balance/:id', c.systemOnly, c.internalBalance);
router.post('/internal/spend', c.systemOnly, c.internalSpend);
router.post('/internal/credit', c.systemOnly, c.internalCredit);

module.exports = router;
