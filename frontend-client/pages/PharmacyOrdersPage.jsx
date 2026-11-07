import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Clock, PackageCheck, Truck, CheckCircle2, XCircle, MapPin, CreditCard, Star, Undo2 } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import ReviewModal from '../components/ReviewModal';
import ReturnRequestModal from '../components/ReturnRequestModal';

// Khớp với luồng duyệt đơn của Nhân viên bán hàng (SaleOrderManagement):
// Chờ duyệt (COD) / Đã thanh toán (chuyển khoản) -> Đã duyệt -> Đang đóng gói -> Đang giao -> Đã nhận
const ORDER_STEPS = [
  { status: 'UNPAID', label: 'Chờ duyệt', icon: Clock },
  { status: 'CONFIRMED', label: 'Đã duyệt', icon: CheckCircle2 },
  { status: 'PROCESSING', label: 'Đang đóng gói', icon: PackageCheck },
  { status: 'SHIPPING', label: 'Đang giao', icon: Truck },
  { status: 'COMPLETED', label: 'Đã nhận', icon: CheckCircle2 },
];
// Đơn chuyển khoản đã nhận tiền (PAID) vẫn đang ở bước chờ NVBH duyệt
const stepIndexOf = (status) => (status === 'PAID' ? 0 : ORDER_STEPS.findIndex((s) => s.status === status));
const STATUS_LABEL = { PAID: 'Đã thanh toán, chờ duyệt', CANCELLED: 'Đã hủy' };

const STATUS_BADGE = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PAID: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-cyan-100 text-cyan-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPING: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const PAYMENT_LABEL = { COD: 'Thanh toán khi nhận hàng (COD)', VIETQR_SEPAY: 'Chuyển khoản VietQR' };
const COUNTER_PAYMENT_LABEL = 'Thanh toán tại phòng khám';
const PICKUP_ADDRESS = 'Nhận tại quầy phòng khám GlowSkin'; // địa chỉ server ghi cho đơn nhận tại quầy

// Hoàn / trả hàng (quy định chi tiết do server kiểm tra; số ngày khớp RETURN_WINDOW_DAYS của service-commerce)
const RETURN_WINDOW_DAYS = 7;
const RETURN_STATUS = {
  PENDING: { label: 'Chờ nhân viên duyệt', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  APPROVED: { label: 'Đã duyệt, chờ nhân viên tạo đơn lấy hàng', color: 'bg-cyan-50 border-cyan-200 text-cyan-800' },
  PICKING: { label: 'GHN đang lấy hàng về kho', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
  RECEIVED: { label: 'Kho đã nhận hàng, đang kiểm tra', color: 'bg-blue-50 border-blue-200 text-blue-800' },
  REFUNDED: { label: 'Đã hoàn tiền', color: 'bg-green-50 border-green-200 text-green-800' },
  REJECTED: { label: 'Yêu cầu bị từ chối', color: 'bg-red-50 border-red-200 text-red-700' },
};
// Yêu cầu đáng hiển thị: bỏ qua các yêu cầu khách đã tự hủy
const latestReturn = (order) => (order.OrderReturns || [])
  .filter((r) => r.status !== 'CANCELLED')
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
const canRequestReturn = (order) => order.status === 'COMPLETED' && !!order.tracking_code && !latestReturn(order)
  && Date.now() <= new Date(order.updatedAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

const getProductImage = (img) => {
  if (!img) return 'https://placehold.co/100x100?text=No+Image';
  if (Array.isArray(img)) return img[0] || 'https://placehold.co/100x100?text=No+Image';
  try {
    const parsed = JSON.parse(img);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return img;
  }
};

// Câu mô tả tình trạng hiện tại, hiển thị dưới thanh tiến trình
const progressMessage = (order) => {
  switch (order.status) {
    case 'UNPAID':
      return order.payment_method === 'VIETQR_SEPAY' ? 'Đơn đang chờ bạn chuyển khoản, nhân viên sẽ duyệt ngay khi nhận được tiền.' : 'Nhân viên đang kiểm tra và duyệt đơn của bạn.';
    case 'PAID': return 'Đã nhận thanh toán, nhân viên đang kiểm tra và duyệt đơn.';
    case 'CONFIRMED': return 'Đơn đã được duyệt, kho sẽ đóng gói trong thời gian sớm nhất.';
    case 'PROCESSING': return 'Kho đang đóng gói, chờ GHN đến lấy hàng.';
    case 'SHIPPING': return 'GHN đang giao hàng đến bạn.';
    case 'COMPLETED': return 'Giao hàng thành công. Cảm ơn bạn đã mua sắm tại GlowSkin!';
    default: return '';
  }
};

// Thanh các bước nối nhau: bước đã qua tô đầy, bước hiện tại có vòng sáng, bước sau để xám
function OrderProgress({ order, isCounterOrder, currentStep }) {
  if (isCounterOrder) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
        <CheckCircle2 className="w-5 h-5 shrink-0" /> Đã thanh toán và nhận hàng tại phòng khám
      </div>
    );
  }
  if (order.status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm font-semibold">
        <XCircle className="w-5 h-5 shrink-0" /> Đơn hàng đã bị hủy{order.cancel_reason ? `: ${order.cancel_reason}` : ''}
        {order.refund_status === 'PENDING' && <span className="font-normal">. Phòng khám sẽ hoàn {Number(order.refund_amount).toLocaleString('vi-VN')}đ, vui lòng liên hệ CSKH để cung cấp tài khoản nhận tiền.</span>}
        {order.refund_status === 'REFUNDED' && <span className="font-normal">. Đã hoàn {Number(order.refund_amount).toLocaleString('vi-VN')}đ, mã giao dịch {order.refund_ref}.</span>}
      </div>
    );
  }

  const lastIdx = ORDER_STEPS.length - 1;
  return (
    <div className="bg-gradient-to-b from-teal-50/70 to-white border border-teal-100 rounded-xl px-3 sm:px-5 pt-4 pb-3">
      <div className="flex items-start">
        {ORDER_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const done = idx < currentStep || (idx === currentStep && idx === lastIdx);
          const current = idx === currentStep && !done;
          return (
            <React.Fragment key={step.status}>
              <div className="flex flex-col items-center w-14 sm:w-20 min-w-0 shrink">
                <div className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-full flex items-center justify-center transition ${
                  done ? 'bg-teal-600 text-white shadow-sm'
                    : current ? 'bg-white text-teal-600 border-2 border-teal-500 ring-4 ring-teal-100'
                      : 'bg-white text-slate-300 border border-slate-200'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`mt-1.5 text-[10px] sm:text-xs text-center leading-tight ${
                  done ? 'text-teal-700 font-medium' : current ? 'text-teal-700 font-bold' : 'text-slate-400'}`}>
                  {step.label}
                </span>
              </div>
              {idx < lastIdx && (
                <div className={`flex-1 min-w-1 h-1 rounded-full mt-4 mx-0.5 ${idx < currentStep ? 'bg-teal-500' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-teal-100/70 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600">{progressMessage(order)}</span>
        {order.tracking_code && (
          <span className="text-slate-500">Mã vận đơn GHN: <b className="text-slate-700">{order.tracking_code}</b></span>
        )}
      </div>
    </div>
  );
}

export default function PharmacyOrdersPage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [orders, setOrders] = useState([]);
  const [myReviews, setMyReviews] = useState({}); // { `${order_id}:${product_id}`: review }
  const [reviewTarget, setReviewTarget] = useState(null); // { order_id, product_id, name }
  const [loading, setLoading] = useState(true);
  const [returnTarget, setReturnTarget] = useState(null); // đơn đang mở form hoàn trả
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        const [res, reviewRes] = await Promise.all([
          axios.get(`/api/commerce/orders`, { headers }),
          axios.get(`/api/commerce/reviews/mine`, { headers }).catch(() => ({ data: { data: [] } })),
        ]);
        setOrders(res.data.data || []);
        setMyReviews(Object.fromEntries((reviewRes.data.data || []).map((r) => [`${r.order_id}:${r.product_id}`, r])));
      } catch (err) {
        console.error('Lỗi tải lịch sử đơn hàng:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user?.id, token, reloadKey]);

  const handleCancelReturn = async (id) => {
    if (!window.confirm('Hủy yêu cầu hoàn trả này?')) return;
    try {
      await axios.put(`/api/commerce/returns/${id}/cancel`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setReloadKey((k) => k + 1);
    } catch (err) {
      alert(err.response?.data?.message || 'Không hủy được yêu cầu');
    }
  };

  const handleSubmitReview = async ({ rating, comment }) => {
    const { order_id, product_id } = reviewTarget;
    const res = await axios.post('/api/commerce/reviews', { order_id, product_id, rating, comment }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setMyReviews((prev) => ({ ...prev, [`${order_id}:${product_id}`]: res.data.data }));
    setReviewTarget(null);
  };

  return (
    <div className="max-w-4xl mx-auto sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-xl sm:text-2xl font-bold text-secondary">Lịch Sử Đơn Hàng Dược Mỹ Phẩm</h2>
        <Link to="/shops" className="btn btn-sm btn-outline gap-2"><ShoppingBag className="w-4 h-4" /> Tiếp tục mua sắm</Link>
      </div>

      {loading ? (
        <div className="text-center py-10 bg-white rounded-2xl border text-slate-500">
          Đang tải lịch sử đơn hàng...
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 space-y-3">
          <p className="text-slate-400">Bạn chưa có đơn hàng dược mỹ phẩm nào.</p>
          <Link to="/shops" className="btn btn-primary btn-sm">Mua sắm ngay</Link>
        </div>
      ) : (
        orders.map((order) => {
          const details = order.OrderDetails || [];
          // Đơn mua tại quầy (sau buổi khám hoặc NVBH bán trực tiếp): đã thanh toán và nhận hàng tại phòng khám
          const isCounterOrder = !!order.appointment_id || order.shipping_address === PICKUP_ADDRESS;
          const shippingFee = Number(order.shipping_fee || 0);
          // Khớp số tiền server dùng khi tạo QR / thu hộ COD: tiền hàng - voucher + phí ship
          const finalAmount = Math.max(0, Number(order.total_amount || 0) - Number(order.discount_amount || 0)) + shippingFee;
          const currentStep = stepIndexOf(order.status);
          const ret = latestReturn(order);
          const statusLabel = isCounterOrder ? 'Đã nhận tại phòng khám' : STATUS_LABEL[order.status] || ORDER_STEPS[currentStep]?.label || order.status;

          return (
            <div key={order.id} className="bg-white shadow-sm border border-slate-200 p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-center font-bold border-b pb-3">
                <div>
                  <span className="text-slate-800">Mã đơn: #{order.id?.substring(0, 8).toUpperCase()}</span>
                  <span className="text-xs text-slate-400 font-normal ml-3">
                    {new Date(order.createdAt).toLocaleDateString('vi-VN')} {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${STATUS_BADGE[order.status] || 'bg-slate-100 text-slate-600'}`}>
                  {statusLabel}
                </span>
              </div>

              {/* Tiến trình đơn hàng */}
              <OrderProgress order={order} isCounterOrder={isCounterOrder} currentStep={currentStep} />

              {/* Chi tiết sản phẩm trong đơn */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl">
                {details.map((detail) => {
                  const myReview = myReviews[`${order.id}:${detail.product_id}`];
                  return (
                    <div key={detail.id} className="flex items-center gap-3 text-sm">
                      <img src={getProductImage(detail.Product?.image_url)} alt={detail.Product?.name} className="w-12 h-12 rounded-lg object-cover bg-white border" />
                      <div className="flex-1">
                        <span className="text-slate-700">{detail.Product?.name || 'Sản phẩm đã ngừng kinh doanh'} <span className="text-slate-400">x{detail.quantity}</span></span>
                        {/* Chỉ đơn đã nhận hàng mới được đánh giá */}
                        {order.status === 'COMPLETED' && detail.Product && (
                          myReview ? (
                            <div className="flex items-center gap-1 text-xs text-amber-500 mt-1">
                              <Star className="w-3 h-3 fill-current" /> Bạn đã đánh giá {myReview.rating}/5
                            </div>
                          ) : (
                            <button
                              onClick={() => setReviewTarget({ order_id: order.id, product_id: detail.product_id, name: detail.Product.name })}
                              className="btn btn-xs btn-outline btn-warning gap-1 mt-1"
                            >
                              <Star className="w-3 h-3" /> Đánh giá sản phẩm
                            </button>
                          )
                        )}
                      </div>
                      <span className="font-semibold text-slate-800">{formatVnd(Number(detail.price) * detail.quantity)}</span>
                    </div>
                  );
                })}
                <div className="border-t pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Tiền hàng</span><span>{formatVnd(order.total_amount)}</span></div>
                  {Number(order.discount_amount) > 0 && (
                    <div className="flex justify-between text-green-600"><span>Giảm giá (Voucher)</span><span>- {formatVnd(order.discount_amount)}</span></div>
                  )}
                  {!isCounterOrder && (
                    <div className="flex justify-between text-slate-600"><span>Phí vận chuyển</span><span>{shippingFee > 0 ? formatVnd(shippingFee) : 'Miễn phí'}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-teal-600 text-base"><span>Thành tiền</span><span>{formatVnd(finalAmount)}</span></div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-sm text-slate-600">
                <div className="flex gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /><span><b>{order.recipient_name}</b> · {order.shipping_phone}<br />{order.shipping_address}</span></div>
                <div className="flex gap-2"><CreditCard className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /><span>{isCounterOrder ? COUNTER_PAYMENT_LABEL : PAYMENT_LABEL[order.payment_method] || order.payment_method}</span></div>
              </div>

              {/* Hoàn / trả hàng */}
              {ret && (
                <div className={`border rounded-xl p-3 text-sm space-y-1 ${RETURN_STATUS[ret.status]?.color || ''}`}>
                  <div className="flex justify-between items-center font-semibold">
                    <span className="flex items-center gap-1.5"><Undo2 className="w-4 h-4" /> Hoàn trả: {RETURN_STATUS[ret.status]?.label || ret.status}</span>
                    {ret.status === 'PENDING' && (
                      <button onClick={() => handleCancelReturn(ret.id)} className="btn btn-xs btn-ghost text-red-500">Hủy yêu cầu</button>
                    )}
                  </div>
                  <p>Sản phẩm trả: {(ret.items || []).map((i) => `${i.name} x${i.quantity}`).join(', ')}</p>
                  <p>Số tiền hoàn dự kiến: <b>{formatVnd(ret.refund_amount)}</b></p>
                  {ret.tracking_code && <p>Mã vận đơn GHN lấy hàng: <b>{ret.tracking_code}</b></p>}
                  {ret.status === 'REFUNDED' && ret.refund_ref && <p>Mã giao dịch hoàn tiền: <b>{ret.refund_ref}</b></p>}
                  {ret.status === 'REJECTED' && ret.reject_reason && <p>Lý do: {ret.reject_reason}</p>}
                </div>
              )}
              {canRequestReturn(order) && (
                <div className="flex justify-end">
                  <button onClick={() => setReturnTarget(order)} className="btn btn-sm btn-outline gap-1">
                    <Undo2 className="w-4 h-4" /> Yêu cầu hoàn / trả hàng
                  </button>
                </div>
              )}

            </div>
          );
        })
      )}

      {returnTarget && (
        <ReturnRequestModal
          order={returnTarget}
          token={token}
          onClose={() => setReturnTarget(null)}
          onCreated={() => { setReturnTarget(null); setReloadKey((k) => k + 1); alert('Đã gửi yêu cầu hoàn trả, nhân viên sẽ phản hồi trong 24 giờ làm việc.'); }}
        />
      )}

      <ReviewModal
        isOpen={!!reviewTarget}
        title="Đánh giá sản phẩm"
        subtitle={reviewTarget?.name}
        onClose={() => setReviewTarget(null)}
        onSubmit={handleSubmitReview}
      />
    </div>
  );
}
