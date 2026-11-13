// GET /tasks/mine — việc đang chờ của NVBH / quản lý (chuông thông báo trang quản trị). Đếm thẳng từ dữ liệu.
const express = require('express');
const { Op } = require('sequelize');
const { Order, OrderReturn, InventoryRequest } = require('../models');
const { verifyToken } = require('../middlewares/auth.middleware.js');

const router = express.Router();
const task = (key, label, count, path, topic) => ({ key, label, count, path, topic });

router.get('/mine', verifyToken, async (req, res) => {
  try {
    const { id, role } = req.user;
    const data = [];
    if (role === 'SALES') {
      const [approve, refund, review, returns] = await Promise.all([
        // Chờ NVBH duyệt: COD chưa duyệt, hoặc chuyển khoản đã nhận tiền (CK chưa trả thì là việc của khách)
        Order.count({ where: { [Op.or]: [{ status: 'UNPAID', payment_method: 'COD' }, { status: 'PAID' }] } }),
        Order.count({ where: { refund_status: 'PENDING' } }),
        Order.count({ where: { cancel_review: 'PENDING' } }),
        OrderReturn.count({ where: { status: { [Op.in]: ['PENDING', 'RECEIVED'] } } }),
      ]);
      data.push(
        task('orders-approve', 'Đơn hàng chờ duyệt', approve, '/sales-management', 'orders'),
        task('orders-refund', 'Đơn hủy chờ hoàn tiền', refund, '/sales-management', 'orders'),
        task('orders-review', 'Đơn hoàn hàng cần xem xét', review, '/sales-management', 'orders'),
        task('returns', 'Yêu cầu trả hàng cần xử lý', returns, '/returns', 'returns'),
      );
    }
    if (['GEN_MANAGER', 'ADMIN'].includes(role)) {
      const purchase = await InventoryRequest.count({ where: { type: 'PURCHASE_ORDER', status: 'PENDING', requester_id: { [Op.ne]: id } } });
      data.push(task('purchase-requests', 'Đề xuất nhập hàng chờ duyệt', purchase, '/materials', 'purchase-requests'));
    }
    res.status(200).json({ data });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

module.exports = router;
