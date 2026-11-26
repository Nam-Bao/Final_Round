const express = require('express');
const c = require('../controllers/material.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];

// Vật tư nội bộ + tình trạng tồn kho (KTV xem để biết còn bao nhiêu)
router.get('/', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'TECHNICIAN'), c.listMaterials);
router.put('/:id/spec', ...managers, c.upsertSpec);

// Lô vật tư + kiểm kê
router.get('/:id/lots', ...managers, c.getLots);
router.put('/:id/stock-count', ...managers, c.countStock);

// Định mức theo dịch vụ / gói
router.get('/norms', verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'TECHNICIAN'), c.getNorms);
router.get('/norms/all', ...managers, c.listAllNorms);
router.put('/norms', ...managers, c.saveNorms);

// Phiếu xuất vật tư theo buổi (service-booking gọi khi KTV hoàn thành buổi) + lịch sử
router.post('/usage', verifyToken, authorizeRoles('TECHNICIAN'), c.recordUsage);
router.get('/usage', ...managers, c.listUsage);

// Đề xuất nhập hàng
// Đề xuất nhập hàng: quản lý, NVBH (mỹ phẩm), KTV (vật tư) tạo; quản lý duyệt (không tự duyệt đề xuất của mình).
// Đặt hàng + nhận hàng chuyển sang /purchasing (đơn đặt hàng gửi nhà cung cấp, biên bản nhận hàng)
const proposers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'SALES', 'TECHNICIAN')];
router.get('/purchase-requests', ...proposers, c.listPurchaseRequests);
router.post('/purchase-requests', ...proposers, c.createPurchaseRequest);
router.put('/purchase-requests/:id/decision', ...managers, c.decidePurchaseRequest);

module.exports = router;
