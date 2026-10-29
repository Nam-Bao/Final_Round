import React, { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, Trash2, PackageCheck, Truck, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

export default function PharmacyOrdersPage() {
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Lấy customer_id từ localStorage (Fallback UUID chuẩn nếu chưa đăng nhập)
  const userStr = localStorage.getItem('user') || localStorage.getItem('customer');
  const user = userStr ? JSON.parse(userStr) : null;
  const customerId = user ? (user.id || user.customer_id) : '34db86b5-5cd8-4ba7-979f-29d95f87a8b3';

  useEffect(() => { 
    // Lấy giỏ hàng từ Local Storage (nếu có)
    setCart(JSON.parse(localStorage.getItem('cartItems')) || []); 

    // Lấy Lịch sử đơn hàng thật từ Backend PostgreSQL
    fetchOrdersFromBackend();
  }, [customerId]);

  const fetchOrdersFromBackend = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`http://localhost:4000/api/commerce/orders?customer_id=${customerId}`);
      // Lấy mảng đơn hàng từ API backend
      setOrders(res.data.data || res.data.orders || []);
    } catch (err) {
      console.error('Lỗi tải lịch sử đơn hàng từ Backend:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const totalCart = cart.reduce((s, i) => s + (Number(i.price || 0) * (i.qty || i.quantity || 1)), 0);

  // Xử lý thanh toán đơn hàng (Gọi API Backend)
  const handleCheckout = async () => {
    try {
      const payload = {
        customer_id: customerId,
        recipient_name: user?.full_name || user?.name || 'Khách hàng',
        shipping_phone: user?.phone || '0901234567',
        shipping_address: user?.address || '343/5F Tô Hiến Thành, P.12, Q.10, TP.HCM',
        payment_method: 'COD',
        save_address_to_book: false
      };

      const res = await axios.post('http://localhost:4000/api/commerce/orders/checkout', payload);
      
      if (res.data?.success) {
        alert('🎉 Đặt hàng và tạo đơn thành công!');
        setCart([]); 
        localStorage.removeItem('cartItems');
        fetchOrdersFromBackend(); // Tải lại danh sách đơn hàng thực tế
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xử lý thanh toán');
    }
  };

  // Xử lý xóa/hủy giỏ hàng
  const handleClearCart = () => {
    setCart([]);
    localStorage.removeItem('cartItems');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* KHU VỰC GIỎ HÀNG TỪ ĐƠN THUỐC / SHOP */}
      {cart.length > 0 && (
        <div className="card bg-white shadow-xl border border-teal-500 p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <h2 className="text-xl font-bold text-teal-600 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6"/> Giỏ Hàng Mua Sắm Dược Mỹ Phẩm
            </h2>
            <button onClick={handleClearCart} className="btn btn-sm btn-ghost text-red-500 flex items-center hover:bg-red-50 p-2 rounded-lg">
              <Trash2 className="w-4 h-4 mr-1"/> Xóa giỏ hàng
            </button>
          </div>
          
          <div className="space-y-2">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-100">
                <span className="text-slate-700 font-medium">{item.name} x{item.qty || item.quantity || 1}</span>
                <span className="font-bold text-slate-800">
                  {(Number(item.price || 0) * (item.qty || item.quantity || 1)).toLocaleString()} ₫
                </span>
              </div>
            ))}
          </div>
          
          <div className="flex justify-between font-bold text-lg border-t pt-4">
            <span className="text-slate-700">Tổng thanh toán:</span>
            <span className="text-teal-600">{totalCart.toLocaleString()} ₫</span>
          </div>

          <button onClick={handleCheckout} className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl flex items-center justify-center transition shadow-md">
            <CreditCard className="w-5 h-5 mr-2"/> Xác Nhận Thanh Toán Đơn Hàng
          </button>
        </div>
      )}
      
      {/* KHU VỰC LỊCH SỬ ĐƠN HÀNG THẬT TỪ POSTGRESQL */}
      <h2 className="text-2xl font-bold text-slate-800 pt-4">Lịch Sử Đơn Hàng Dược Mỹ Phẩm</h2>
      
      {loading ? (
        <div className="text-center py-10 bg-white rounded-2xl border text-slate-500">
          Đang tải lịch sử đơn hàng từ máy chủ...
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border border-slate-200">
          <p className="text-slate-400">Bạn chưa có đơn hàng dược mỹ phẩm nào.</p>
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} className="bg-white shadow-sm border border-slate-200 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center font-bold border-b pb-3">
              <div>
                <span className="text-slate-800">Mã đơn: #{order.id?.substring(0, 8)}</span>
                <span className="text-xs text-slate-400 font-normal ml-3">
                  {new Date(order.createdAt).toLocaleDateString('vi-VN')} {new Date(order.createdAt).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
              <span className="px-3 py-1 bg-teal-100 text-teal-800 text-xs font-bold rounded-full">
                {order.status || 'PAID'}
              </span>
            </div>

            {/* Chi tiết sản phẩm trong đơn */}
            <div className="space-y-2 bg-slate-50 p-4 rounded-xl">
              {(order.OrderDetails || order.OrderItems || []).map((detail, dIdx) => (
                <div key={dIdx} className="flex justify-between text-sm">
                  <span className="text-slate-700">{detail.Product?.name || 'Sản phẩm Mỹ phẩm'} x{detail.quantity}</span>
                  <span className="font-semibold text-slate-800">
                    {(Number(detail.price || 0) * detail.quantity).toLocaleString()} ₫
                  </span>
                </div>
              ))}
              <div className="text-right border-t pt-2 font-bold text-teal-600">
                Tổng cộng: {Number(order.total_amount || 0).toLocaleString()} ₫
              </div>
            </div>

            {/* Thanh tiến trình đơn hàng */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs pt-2 border-t">
              <div className="flex flex-col items-center text-teal-600 font-semibold">
                <CheckCircle2 className="w-5 h-5 mb-1" />
                <span>Đã thanh toán</span>
              </div>
              <div className={`flex flex-col items-center ${['PROCESSING', 'SHIPPING', 'COMPLETED', 'PAID'].includes(order.status) ? 'text-teal-600 font-semibold' : 'text-slate-300'}`}>
                <PackageCheck className="w-5 h-5 mb-1" />
                <span>Đóng gói</span>
              </div>
              <div className={`flex flex-col items-center ${['SHIPPING', 'COMPLETED'].includes(order.status) ? 'text-teal-600 font-semibold' : 'text-slate-300'}`}>
                <Truck className="w-5 h-5 mb-1" />
                <span>Đang giao</span>
              </div>
              <div className={`flex flex-col items-center ${order.status === 'COMPLETED' ? 'text-teal-600 font-semibold' : 'text-slate-300'}`}>
                <CheckCircle2 className="w-5 h-5 mb-1" />
                <span>Đã nhận</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}