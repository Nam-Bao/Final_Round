import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Clock, PackageCheck, Truck, CheckCircle2, XCircle, MapPin, CreditCard, Star } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import ReviewModal from '../components/ReviewModal';

// Khớp với luồng duyệt đơn của Nhân viên bán hàng (SaleOrderManagement)
const ORDER_STEPS = [
  { status: 'UNPAID', label: 'Chờ duyệt', icon: Clock },
  { status: 'PROCESSING', label: 'Đang chuẩn bị', icon: PackageCheck },
  { status: 'SHIPPING', label: 'Đang giao', icon: Truck },
  { status: 'COMPLETED', label: 'Đã nhận', icon: CheckCircle2 },
];

const STATUS_BADGE = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPING: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const PAYMENT_LABEL = { COD: 'Thanh toán khi nhận hàng (COD)', VIETQR_SEPAY: 'Chuyển khoản VietQR' };

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

export default function PharmacyOrdersPage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [orders, setOrders] = useState([]);
  const [myReviews, setMyReviews] = useState({}); // { `${order_id}:${product_id}`: review }
  const [reviewTarget, setReviewTarget] = useState(null); // { order_id, product_id, name }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        const [res, reviewRes] = await Promise.all([
          axios.get(`http://localhost:4000/api/commerce/orders`, { headers }),
          axios.get(`http://localhost:4000/api/commerce/reviews/mine`, { headers }).catch(() => ({ data: { data: [] } })),
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
  }, [user?.id, token]);

  const handleSubmitReview = async ({ rating, comment }) => {
    const { order_id, product_id } = reviewTarget;
    const res = await axios.post('http://localhost:4000/api/commerce/reviews', { order_id, product_id, rating, comment }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setMyReviews((prev) => ({ ...prev, [`${order_id}:${product_id}`]: res.data.data }));
    setReviewTarget(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Lịch Sử Đơn Hàng Dược Mỹ Phẩm</h2>
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
          const finalAmount = Number(order.total_amount || 0) - Number(order.discount_amount || 0);
          const isCancelled = order.status === 'CANCELLED';
          const currentStep = ORDER_STEPS.findIndex((s) => s.status === order.status);
          const statusLabel = isCancelled ? 'Đã hủy' : ORDER_STEPS[currentStep]?.label || order.status;

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
                  <div className="flex justify-between font-bold text-teal-600 text-base"><span>Thành tiền</span><span>{formatVnd(finalAmount)}</span></div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-sm text-slate-600">
                <div className="flex gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /><span><b>{order.recipient_name}</b> · {order.shipping_phone}<br />{order.shipping_address}</span></div>
                <div className="flex gap-2"><CreditCard className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" /><span>{PAYMENT_LABEL[order.payment_method] || order.payment_method}</span></div>
              </div>

              {/* Thanh tiến trình đơn hàng */}
              {isCancelled ? (
                <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-semibold pt-3 border-t">
                  <XCircle className="w-5 h-5" /> Đơn hàng đã bị hủy
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 text-center text-xs pt-3 border-t">
                  {ORDER_STEPS.map((step, idx) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.status} className={`flex flex-col items-center ${idx <= currentStep ? 'text-teal-600 font-semibold' : 'text-slate-300'}`}>
                        <Icon className="w-5 h-5 mb-1" />
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
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
