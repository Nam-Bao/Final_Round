// GET /tasks/mine — việc đang chờ của NVBH / quản lý (chuông thông báo trang quản trị). Đếm thẳng từ dữ liệu.
const express = require('express');
const { Op } = require('sequelize');
const { Order, OrderReturn, InventoryRequest, PurchaseOrder, GoodsReceipt, StockCount, MaterialLot, Product } = require('../models');
const { isoWeek } = require('../controllers/purchasing.controller.js');
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
      // Nhập hàng: đơn đặt hàng đang chờ hàng về; kiểm kho tuần chưa làm
      const [incoming, countedThisWeek] = await Promise.all([
        PurchaseOrder.count({ where: { status: { [Op.in]: ['SENT', 'PARTIAL'] } } }),
        StockCount.count({ where: { week: isoWeek() } }),
      ]);
      data.push(
        task('goods-incoming', 'Đơn đặt hàng chờ nhận hàng', incoming, '/purchasing', 'purchase-orders'),
        task('stock-count', 'Kiểm kho mỹ phẩm tuần này', countedThisWeek ? 0 : 1, '/purchasing', 'stock-counts'),
      );
    }
    if (['GEN_MANAGER', 'ADMIN'].includes(role)) {
      const [purchase, toOrder, receipts, counts, held] = await Promise.all([
        InventoryRequest.count({ where: { type: 'PURCHASE_ORDER', status: 'PENDING' } }),
        InventoryRequest.count({ where: { type: 'PURCHASE_ORDER', status: 'APPROVED', ordered_at: null, received_at: null } }),
        GoodsReceipt.count({ where: { status: 'PENDING_REVIEW', received_by: { [Op.ne]: id } } }),
        StockCount.count({ where: { status: 'PENDING_REVIEW', counted_by: { [Op.ne]: id } } }),
        MaterialLot.count({ where: { hold_reason: { [Op.ne]: null }, quantity_left: { [Op.gt]: 0 } }, include: [{ model: Product, attributes: [], where: { type: 'PRODUCT' } }] }),
      ]);
      data.push(
        task('purchase-requests', 'Đề xuất nhập hàng chờ duyệt', purchase, '/purchasing', 'purchase-requests'),
        task('purchase-to-order', 'Đề xuất đã duyệt chờ đặt hàng', toOrder, '/purchasing', 'purchase-requests'),
        task('receipts-review', 'Biên bản nhận hàng cần kiểm tra', receipts, '/purchasing', 'goods-receipts'),
        task('counts-review', 'Kiểm kho lệch cần kiểm tra', counts, '/purchasing', 'stock-counts'),
        task('lots-held', 'Lô mỹ phẩm hết hạn chờ hủy', held, '/inventory', 'purchase-orders'),
      );
    }
    res.status(200).json({ data });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
});

module.exports = router;
