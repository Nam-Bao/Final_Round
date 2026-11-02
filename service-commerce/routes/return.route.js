const express = require('express');
const router = express.Router();
const c = require('../controllers/return.controller');
const { verifyToken, authorizeRoles } = require('../middlewares/auth.middleware.js');

const customerOnly = [verifyToken, authorizeRoles('CUSTOMER')];
// NVBH quản lý hoàn trả; Quản lý/Admin được thao tác thay khi cần
const salesStaff = [verifyToken, authorizeRoles('SALES', 'ADMIN', 'GEN_MANAGER')];

router.get('/policy', c.getReturnPolicy);

// Khách: gửi / hủy yêu cầu (trạng thái xem kèm trong danh sách đơn GET /orders)
router.post('/', customerOnly, c.createReturn);
router.put('/:id/cancel', customerOnly, c.cancelReturn);

// NVBH: Chờ duyệt -> Đã duyệt -> GHN lấy hàng -> Kho đã nhận -> Đã hoàn tiền (hoặc Từ chối)
router.get('/admin', salesStaff, c.getReturnsForAdmin);
router.put('/admin/:id/approve', salesStaff, c.approveReturn);
router.put('/admin/:id/reject', salesStaff, c.rejectReturn);
router.put('/admin/:id/pickup', salesStaff, c.createReturnPickup);
router.put('/admin/:id/cancel-pickup', salesStaff, c.cancelReturnPickup);
router.put('/admin/:id/receive', salesStaff, c.receiveReturn);
router.put('/admin/:id/refund', salesStaff, c.refundReturn);

module.exports = router;
