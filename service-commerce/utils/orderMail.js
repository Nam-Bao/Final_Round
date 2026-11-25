// Email đơn hàng gửi khách (qua service-identity). Chỉ đơn giao hàng: đơn nhận tại quầy khách đã có hóa đơn in.
const { Order, OrderDetail, Product } = require('../models');
const { sendEmail } = require('./mail');

const PICKUP_ADDRESS = 'Nhận tại quầy phòng khám GlowSkin';
const isDelivery = (order) => order && !order.appointment_id && order.shipping_address !== PICKUP_ADDRESS;
const payable = (o) => Number(o.total_amount) - Number(o.discount_amount || 0) + Number(o.shipping_fee || 0);

// Đơn đã đặt (COD) / đã nhận tiền chuyển khoản
const orderPlaced = async (orderId) => {
  const o = await Order.findByPk(orderId, { include: [{ model: OrderDetail, include: [{ model: Product, attributes: ['name'] }] }] });
  if (!isDelivery(o)) return null;
  return sendEmail('ORDER_PLACED', o.customer_id, `ORDER_PLACED:${o.id}`, {
    order_id: o.id, paid: ['VIETQR_SEPAY', 'POINTS'].includes(o.payment_method), payment_method: o.payment_method, points_used: o.points_used || 0,
    items: o.OrderDetails.map((d) => ({ name: d.Product?.name || 'Sản phẩm', quantity: d.quantity, price: Number(d.price) })),
    total: Number(o.total_amount), discount: Number(o.discount_amount || 0), shipping_fee: Number(o.shipping_fee || 0),
    recipient_name: o.recipient_name, shipping_phone: o.shipping_phone, shipping_address: o.shipping_address,
  });
};
const orderShipping = (o) => (isDelivery(o) && o.tracking_code ? sendEmail('ORDER_SHIPPING', o.customer_id, `ORDER_SHIPPING:${o.id}`, { order_id: o.id, tracking_code: o.tracking_code }) : null);
// refundPending: đơn chuyển khoản đã nhận tiền => phòng khám sẽ hoàn
const orderCancelled = (o, { initiator, reason, refundPending, voucherReturned, pointsRefunded }) => (isDelivery(o)
  ? sendEmail('ORDER_CANCELLED', o.customer_id, `ORDER_CANCELLED:${o.id}`, { order_id: o.id, initiator, reason, refund_pending: !!refundPending, refund_amount: payable(o), voucher_returned: !!voucherReturned && !!o.promotion_id, points_refunded: Number(pointsRefunded || 0) })
  : null);
const orderRefunded = (o, ref) => sendEmail('ORDER_REFUNDED', o.customer_id, `ORDER_REFUNDED:${o.id}`, { order_id: o.id, amount: Number(o.refund_amount), ref });
const returnUpdate = (ret, extra) => sendEmail('RETURN_UPDATE', ret.customer_id, `RETURN_${extra.status}:${ret.id}`, { order_id: ret.order_id, ...extra });

module.exports = { orderPlaced, orderShipping, orderCancelled, orderRefunded, returnUpdate };
