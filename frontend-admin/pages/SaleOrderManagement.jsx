import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, XCircle, Clock, MapPin, Eye, Phone, Zap } from 'lucide-react';
import axios from 'axios';

const STATUS_MAP = {
  UNPAID: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700', icon: Clock },
  PROCESSING: { label: 'Đang chuẩn bị', color: 'bg-blue-100 text-blue-700', icon: Package },
  SHIPPING: { label: 'Đang giao hàng', color: 'bg-indigo-100 text-indigo-700', icon: Truck },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CANCELLED: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: XCircle }
};

export default function SaleOrderManagement() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // State quản lý việc bấm nút test Webhook
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await axios.get('http://localhost:4000/api/commerce/orders/admin');
      const data = res.data.data || [];
      setOrders(data);
      
      // Nếu đang mở 1 đơn hàng, cập nhật lại dữ liệu mới nhất cho đơn đó
      if (selectedOrder) {
        const updatedSelected = data.find(o => o.id === selectedOrder.id);
        if (updatedSelected) setSelectedOrder(updatedSelected);
      }
    } catch (error) {
      console.error('Lỗi tải đơn hàng:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleUpdateStatus = async (orderId, newStatus) => {
    if (!window.confirm(`Bạn muốn chuyển đơn hàng sang trạng thái: ${STATUS_MAP[newStatus].label}?`)) return;
    try {
      await axios.put(`http://localhost:4000/api/commerce/orders/admin/${orderId}/status`, { status: newStatus });
      alert('Cập nhật trạng thái thành công!');
      fetchOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Lỗi cập nhật trạng thái');
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cảnh báo: Việc này sẽ hủy đơn và tự động cộng lại tồn kho. Bạn có chắc chắn?')) return;
    try {
      await axios.put(`http://localhost:4000/api/commerce/orders/admin/${orderId}/cancel`);
      alert('Đã hủy đơn và hoàn kho!');
      fetchOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Lỗi hủy đơn');
    }
  };

  // ==========================================
  // HÀM TEST: BẮN WEBHOOK GIẢ LẬP
  // ==========================================
  const handleSimulateWebhook = async (trackingCode) => {
    setIsSimulating(true);
    try {
      const payload = {
        OrderCode: trackingCode,
        Status: 'delivered' // Giả lập trạng thái Shipper giao thành công
      };
      
      // Bắn trực tiếp vào API Webhook của backend
      await axios.post('http://localhost:4000/api/commerce/orders/ghn-webhook', payload);
      
      alert('Tín hiệu Webhook đã được nhận thành công! Đơn hàng sẽ tự nhảy sang Hoàn Thành.');
      fetchOrders(); // Tải lại danh sách
    } catch (error) {
      console.error('Lỗi giả lập Webhook:', error);
      alert('Lỗi gửi Webhook: ' + (error.response?.data?.message || error.message));
    } finally {
      setIsSimulating(false);
    }
  };

  const filteredOrders = activeTab === 'ALL' ? orders : orders.filter(o => o.status === activeTab);

  if (loading) return <div className="p-10 text-center text-slate-500">Đang tải dữ liệu...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 flex gap-6 min-h-screen bg-slate-50">
      
      {/* CỘT TRÁI: DANH SÁCH ĐƠN HÀNG */}
      <div className="flex-1 flex flex-col">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Quản lý Đơn hàng (E-commerce)</h1>
        
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap ${activeTab === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'}`}>
            Tất cả ({orders.length})
          </button>
          {Object.keys(STATUS_MAP).map(key => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap flex items-center gap-2 ${activeTab === key ? STATUS_MAP[key].color.replace('text-', 'bg-').replace('100', '600') + ' text-white' : 'bg-white text-slate-600 border'}`}>
              {STATUS_MAP[key].label} ({orders.filter(o => o.status === key).length})
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b">
              <tr>
                <th className="p-4">Mã Đơn</th>
                <th className="p-4">Khách hàng</th>
                <th className="p-4">Ngày đặt</th>
                <th className="p-4">Tổng tiền</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan="6" className="p-10 text-center text-slate-500">Không có đơn hàng nào.</td></tr>
              ) : (
                filteredOrders.map(order => {
                  const StatusIcon = STATUS_MAP[order.status].icon;
                  // Tính tổng tiền = Tiền hàng - Khuyến mãi + Phí vận chuyển
                  const finalTotal = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);

                  return (
                    <tr key={order.id} className={`border-b transition cursor-pointer ${selectedOrder?.id === order.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`} onClick={() => setSelectedOrder(order)}>
                      <td className="p-4 font-mono text-xs text-slate-500">{order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-800">{order.recipient_name}</p>
                        <p className="text-slate-500 text-xs flex items-center gap-1 mt-1"><Phone className="w-3 h-3"/> {order.shipping_phone}</p>
                      </td>
                      <td className="p-4 text-slate-600">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td className="p-4 font-bold text-blue-600">{finalTotal.toLocaleString('vi-VN')} ₫</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 w-fit ${STATUS_MAP[order.status].color}`}>
                          <StatusIcon className="w-3.5 h-3.5"/> {STATUS_MAP[order.status].label}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button className="p-2 text-slate-400 hover:text-blue-600 bg-white rounded-lg border shadow-sm"><Eye className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CỘT PHẢI: CHI TIẾT ĐƠN HÀNG */}
      <div className="w-[400px] flex flex-col shrink-0">
        {selectedOrder ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden sticky top-6">
            <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Chi tiết đơn hàng</h3>
                <p className="text-xs font-mono text-slate-500 mt-1">#{selectedOrder.id}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_MAP[selectedOrder.status].color}`}>
                {STATUS_MAP[selectedOrder.status].label}
              </span>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-6">
              {/* Thông tin giao hàng */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Thông tin nhận hàng</h4>
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-sm border border-slate-100">
                  <p><span className="text-slate-500 w-20 inline-block">Người nhận:</span> <span className="font-bold">{selectedOrder.recipient_name}</span></p>
                  <p><span className="text-slate-500 w-20 inline-block">Điện thoại:</span> <span>{selectedOrder.shipping_phone}</span></p>
                  <p className="flex items-start gap-1 mt-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5"/>
                    <span className="text-slate-700 leading-snug">{selectedOrder.shipping_address}</span>
                  </p>
                </div>
                
                {/* KHỐI HIỂN THỊ MÃ VẬN ĐƠN & NÚT TEST WEBHOOK */}
                {selectedOrder.tracking_code && (
                  <div className="mt-3 bg-blue-50/80 border border-blue-200 p-4 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-800 text-sm font-medium flex items-center gap-2">
                        <Truck className="w-4 h-4" /> Mã vận đơn GHN:
                      </span>
                      <span className="font-mono font-bold text-blue-900 tracking-wider bg-white px-2.5 py-1 border border-blue-100 rounded-md shadow-sm">
                        {selectedOrder.tracking_code}
                      </span>
                    </div>
                    
                    {/* Khu vực Test giả lập Webhook */}
                    {selectedOrder.status !== 'COMPLETED' && selectedOrder.status !== 'CANCELLED' && (
                      <div className="pt-3 border-t border-blue-200/60 mt-1">
                        <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Công cụ Test Webhook (Dev Only):
                        </p>
                        <button 
                          onClick={() => handleSimulateWebhook(selectedOrder.tracking_code)}
                          disabled={isSimulating}
                          className="w-full py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex justify-center items-center gap-2"
                        >
                          {isSimulating ? (
                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            'Giả lập Shipper đã giao thành công'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sản phẩm */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Sản phẩm ({selectedOrder.OrderDetails?.length || 0})</h4>
                <div className="space-y-3">
                  {selectedOrder.OrderDetails?.map(detail => (
                    <div key={detail.id} className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                        <img src={Array.isArray(detail.Product?.image_url) ? detail.Product.image_url[0] : (detail.Product?.image_url || 'https://placehold.co/100')} alt="" className="w-full h-full object-cover"/>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800 line-clamp-1">{detail.Product?.name}</p>
                        <p className="text-xs text-slate-500">SL: x{detail.quantity}</p>
                      </div>
                      <p className="text-sm font-medium text-slate-800">{(Number(detail.price) * detail.quantity).toLocaleString()} ₫</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thanh toán đã bổ sung phí ship */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-sm mb-2 text-slate-600">
                  <span>Tiền hàng</span>
                  <span>{Number(selectedOrder.total_amount).toLocaleString()} ₫</span>
                </div>
                <div className="flex justify-between text-sm mb-2 text-slate-600">
                  <span>Phí vận chuyển (GHN)</span>
                  <span>{Number(selectedOrder.shipping_fee || 0).toLocaleString()} ₫</span>
                </div>
                <div className="flex justify-between text-sm mb-4 text-green-600">
                  <span>Giảm giá (Voucher)</span>
                  <span>- {Number(selectedOrder.discount_amount).toLocaleString()} ₫</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-slate-800 bg-slate-50 p-3 rounded-lg border">
                  <span>Khách cần trả</span>
                  <span className="text-blue-600">
                    {(Number(selectedOrder.total_amount) - Number(selectedOrder.discount_amount) + Number(selectedOrder.shipping_fee || 0)).toLocaleString()} ₫
                  </span>
                </div>
              </div>
            </div>

            {/* Khối Nút Thao Tác Nghiệp Vụ */}
            <div className="p-5 border-t bg-slate-50 space-y-3">
              {selectedOrder.status === 'UNPAID' && (
                <button onClick={() => handleUpdateStatus(selectedOrder.id, 'PROCESSING')} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-sm">
                  Xác nhận & Gửi Đơn Vị Vận Chuyển (GHN)
                </button>
              )}
              
              {selectedOrder.status === 'PROCESSING' && (
                <button onClick={() => handleUpdateStatus(selectedOrder.id, 'SHIPPING')} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-sm">
                  Chuyển trạng thái Đang Giao
                </button>
              )}
              
              {/* Nút hủy đơn */}
              {['UNPAID', 'PROCESSING', 'SHIPPING'].includes(selectedOrder.status) && (
                <button onClick={() => handleCancelOrder(selectedOrder.id)} className="w-full py-3 bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 font-bold rounded-xl transition">
                  Hủy đơn & Hoàn lại tồn kho
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-2xl border border-slate-200 border-dashed h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <Package className="w-12 h-12 mb-4 text-slate-300"/>
            <p className="font-medium">Chọn một đơn hàng bên danh sách để xem chi tiết và thao tác</p>
          </div>
        )}
      </div>
    </div>
  );
}