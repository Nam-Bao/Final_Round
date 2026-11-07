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
router.get('/purchase-requests', ...managers, c.listPurchaseRequests);
router.post('/purchase-requests', ...managers, c.createPurchaseRequest);
router.put('/purchase-requests/:id/decision', ...managers, c.decidePurchaseRequest);
router.put('/purchase-requests/:id/ordered', ...managers, c.markPurchaseOrdered);
router.put('/purchase-requests/:id/receive', ...managers, c.receivePurchaseRequest);

module.exports = router;
