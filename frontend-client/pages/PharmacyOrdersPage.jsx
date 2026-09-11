import React, { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, Trash2 } from 'lucide-react';

export default function PharmacyOrdersPage() {
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);

  // Lấy dữ liệu giỏ hàng từ Local Storage khi trang vừa load
  useEffect(() => { 
    setCart(JSON.parse(localStorage.getItem('cartItems')) || []); 
  }, []);
  
  const totalCart = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Xử lý thanh toán
  const handleCheckout = () => {
    setOrders([{ id: `ORD-${Date.now().toString().slice(-4)}`, items: cart, total: totalCart, status: 'ORDER_PAID' }, ...orders]);
    setCart([]); 
    localStorage.removeItem('cartItems');
  };

  // Xử lý xóa/hủy giỏ hàng
  const handleClearCart = () => {
    setCart([]);
    localStorage.removeItem('cartItems');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {cart.length > 0 && (
        <div className="card bg-base-100 shadow-xl border border-primary p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-primary flex items-center gap-2">
              <ShoppingBag/> Giỏ Hàng Từ Đơn Thuốc
            </h2>
            <button onClick={handleClearCart} className="btn btn-sm btn-ghost text-error">
              <Trash2 className="w-4 h-4 mr-1"/> Xóa giỏ hàng
            </button>
          </div>
          
          {cart.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name} x{item.qty}</span>
              <span className="font-bold">{(item.price * item.qty).toLocaleString()} đ</span>
            </div>
          ))}
          
          <div className="flex justify-between font-bold text-lg border-t pt-4">
            <span>Tổng thanh toán:</span>
            <span className="text-primary">{totalCart.toLocaleString()} đ</span>
          </div>
          <button onClick={handleCheckout} className="btn btn-primary w-full">
            <CreditCard className="w-4 h-4 mr-2"/> Thanh toán VNPAY
          </button>
        </div>
      )}
      
      <h2 className="text-2xl font-bold pt-4">Lịch Sử Đơn Hàng</h2>
      {orders.length === 0 ? (
        <div className="text-center py-10 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Bạn chưa có đơn hàng dược mỹ phẩm nào.</p>
        </div>
      ) : (
        orders.map(order => (
          <div key={order.id} className="card bg-base-100 shadow border border-base-200 p-6 space-y-4">
            <div className="flex justify-between font-bold border-b pb-2">
              <span>Mã: #{order.id}</span>
              <span className="badge badge-info text-white">{order.status}</span>
            </div>
            <ul className="steps steps-horizontal w-full text-xs">
              <li className={`step ${['ORDER_PAID', 'PROCESSING', 'SHIPPING', 'DELIVERED'].includes(order.status) ? 'step-primary' : ''}`}>Đã thanh toán</li>
              <li className={`step ${['PROCESSING', 'SHIPPING', 'DELIVERED'].includes(order.status) ? 'step-primary' : ''}`}>Đóng gói</li>
              <li className={`step ${['SHIPPING', 'DELIVERED'].includes(order.status) ? 'step-primary' : ''}`}>Đang giao</li>
              <li className={`step ${order.status === 'DELIVERED' ? 'step-primary' : ''}`}>Đã nhận</li>
            </ul>
          </div>
        ))
      )}
    </div>
  );
}