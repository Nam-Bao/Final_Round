// Nhập hàng: nhà cung cấp, đơn đặt hàng (email + PDF cho nhà cung cấp), biên bản nhận hàng, kiểm kho tuần, lô hàng
const express = require('express');
const c = require('../controllers/purchasing.controller.js');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const managers = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER')];
const stock = [verifyToken, authorizeRoles('ADMIN', 'GEN_MANAGER', 'SALES')]; // NVBH nhận hàng, kiểm kho

router.get('/suppliers', ...stock, c.listSuppliers);
router.post('/suppliers', ...managers, c.createSupplier);
router.put('/suppliers/:id', ...managers, c.updateSupplier);

router.get('/orders', ...stock, c.listPurchaseOrders);
router.post('/orders', ...managers, c.createPurchaseOrder);
router.get('/orders/:id/pdf', ...stock, c.purchaseOrderPdf);
router.post('/orders/:id/resend', ...managers, c.resendPurchaseOrder);
router.put('/orders/:id/cancel', ...managers, c.cancelPurchaseOrder);
router.post('/orders/:id/receipts', ...stock, c.receiveGoods);

router.get('/receipts', ...stock, c.listReceipts);
router.put('/receipts/:id/review', ...managers, c.reviewReceipt);

router.get('/stock-counts/template', ...stock, c.stockCountTemplate);
router.get('/stock-counts', ...stock, c.listStockCounts);
router.post('/stock-counts', ...stock, c.submitStockCount);
router.put('/stock-counts/:id/review', ...managers, c.reviewStockCount);

router.get('/products/:id/lots', ...managers, c.productLots);
router.put('/lots/:id/dispose', ...managers, c.disposeLot);

module.exports = router;
