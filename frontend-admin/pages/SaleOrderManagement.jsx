import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, XCircle, Clock, MapPin, Eye, Phone, Zap } from 'lucide-react';
import axios from 'axios';

// Luồng: Chờ duyệt (COD) / Đã thanh toán (CK) -> Đã duyệt -> Đang đóng gói -> Đang giao (tạo vận đơn GHN) -> Hoàn thành
const STATUS_MAP = {
  UNPAID: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700', icon: Clock },
  PAID: { label: 'Đã thanh toán - chờ duyệt', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle }, // SePay đã nhận tiền
  CONFIRMED: { label: 'Đã duyệt', color: 'bg-cyan-100 text-cyan-700', icon: CheckCircle },
  PROCESSING: { label: 'Đang đóng gói', color: 'bg-blue-100 text-blue-700', icon: Package },
  SHIPPING: { label: 'Đang giao hàng', color: 'bg-indigo-100 text-indigo-700', icon: Truck },
  COMPLETED: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  CANCELLED: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: XCircle }
};
const UNKNOWN_STATUS = { label: 'Không xác định', color: 'bg-slate-100 text-slate-600', icon: Clock };

// Đơn chuyển khoản chưa nhận tiền thì chưa phải "chờ duyệt" mà là "chờ thanh toán"
const timeSince = (date) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} giờ`;
  return `${Math.floor(minutes / 60 / 24)} ngày`;
};

const getStatusInfo = (order) => {
  if (order.status === 'UNPAID' && order.payment_method === 'VIETQR_SEPAY') {
    return { ...STATUS_MAP.UNPAID, label: 'Chờ thanh toán (CK)', color: 'bg-orange-100 text-orange-700' };
  }
  return STATUS_MAP[order.status] || { ...UNKNOWN_STATUS, label: order.status };
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

  const handleUpdateStatus = async (orderId, newStatus, confirmText) => {
    if (!window.confirm(confirmText || `Bạn muốn chuyển đơn hàng sang trạng thái: ${STATUS_MAP[newStatus].label}?`)) return;
    try {
      const res = await axios.put(`http://localhost:4000/api/commerce/orders/admin/${orderId}/status`, { status: newStatus });
      alert(res.data?.message || 'Cập nhật trạng thái thành công!'); // chuyển Đang giao sẽ kèm mã vận đơn GHN
      fetchOrders();
    } catch (error) {
      alert(error.response?.data?.message || 'Lỗi cập nhật trạng thái');
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cảnh báo: Việc này sẽ hủy đơn và tự động cộng lại tồn kho. Bạn có chắc chắn?')) return;
    try {
      const res = await axios.put(`http://localhost:4000/api/commerce/orders/admin/${orderId}/cancel`);
      alert(res.data?.message || 'Đã hủy đơn và hoàn kho!'); // có nhắc hoàn tiền nếu đơn đã chuyển khoản
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
    <div className="w-full p-6 flex flex-col lg:flex-row gap-6 min-h-screen bg-slate-50">
      
      {/* CỘT TRÁI: DANH SÁCH ĐƠN HÀNG */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Quản lý Đơn hàng (E-commerce)</h1>
        
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap ${activeTab === 'ALL' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'}`}>
            Tất cả ({orders.length})
          </button>
          {Object.keys(STATUS_MAP).map(key => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap flex items-center gap-2 ${activeTab === key ? STATUS_MAP[key].color.replace('text-', 'bg-').replace('100', '600') + ' text-white' : 'bg-white text-slate-600 border'}`}>
              {STATUS_MAP[key].label} ({orders.filter(o => o.status === key).length})
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto flex-1">
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
                  const statusInfo = getStatusInfo(order);
                  const StatusIcon = statusInfo.icon;
                  // Tính tổng tiền = Tiền hàng - Khuyến mãi + Phí vận chuyển
                  const finalTotal = Number(order.total_amount) - Number(order.discount_amount) + Number(order.shipping_fee || 0);

                  return (
                    <tr key={order.id} className={`border-b transition cursor-pointer ${selectedOrder?.id === order.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`} onClick={() => setSelectedOrder(order)}>
                      <td className="p-4 whitespace-nowrap font-mono text-xs text-slate-500">{order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-800">{order.recipient_name}</p>
                        <p className="text-slate-500 text-xs flex items-center gap-1 mt-1"><Phone className="w-3 h-3"/> {order.shipping_phone}</p>
                      </td>
                      <td className="p-4 whitespace-nowrap text-slate-600">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td className="p-4 whitespace-nowrap font-bold text-blue-600">{finalTotal.toLocaleString('vi-VN')} ₫</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 w-fit whitespace-nowrap ${statusInfo.color}`}>
                          <StatusIcon className="w-3.5 h-3.5"/> {statusInfo.label}
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
      <div className="w-full lg:w-[360px] xl:w-[400px] flex flex-col shrink-0">
        {selectedOrder ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden sticky top-6">
            <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Chi tiết đơn hàng</h3>
                <p className="text-xs font-mono text-slate-500 mt-1">#{selectedOrder.id}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusInfo(selectedOrder).color}`}>
                {getStatusInfo(selectedOrder).label}
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
                
                {/* KHỐI HIỂN THỊ MÃ VẬN ĐƠN (chỉ có từ bước Đang giao) */}
                {selectedOrder.tracking_code && (
                  <div className="mt-3 bg-blue-50/80 border border-blue-200 p-4 rounded-xl flex items-center justify-between">
                    <span className="text-blue-800 text-sm font-medium flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Mã vận đơn GHN:
                    </span>
                    <span className="font-mono font-bold text-blue-900 tracking-wider bg-white px-2.5 py-1 border border-blue-100 rounded-md shadow-sm">
                      {selectedOrder.tracking_code}
                    </span>
                  </div>
                )}
              </div>

              {/* Hình thức thanh toán */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Hình thức thanh toán</h4>
                <div className="bg-slate-50 p-4 rounded-xl text-sm border border-slate-100 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">
                    {selectedOrder.payment_method === 'VIETQR_SEPAY' ? 'Chuyển khoản (VietQR - SePay)' : 'Thanh toán khi nhận hàng (COD)'}
                  </span>
                  {selectedOrder.payment_method === 'VIETQR_SEPAY' ? (
                    selectedOrder.status === 'UNPAID'
                      ? <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-orange-100 text-orange-700 whitespace-nowrap">Chưa nhận tiền</span>
                      : selectedOrder.status !== 'CANCELLED' && <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap">Đã nhận tiền</span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${selectedOrder.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {selectedOrder.status === 'COMPLETED' ? 'Đã thu tiền' : 'Thu khi giao hàng'}
                    </span>
                  )}
                </div>

                {/* Lý do đơn chuyển khoản còn chờ: SePay chỉ xác nhận khi nội dung có "SP <6 ký tự đầu mã đơn>" và số tiền đủ */}
                {selectedOrder.status === 'UNPAID' && selectedOrder.payment_method === 'VIETQR_SEPAY' && (
                  <div className="mt-3 bg-orange-50 border border-orange-100 p-4 rounded-xl text-sm text-orange-800 space-y-2">
                    <p className="font-bold">Vì sao đơn đang chờ thanh toán?</p>
                    <p>
                      Hệ thống chưa nhận được giao dịch hợp lệ từ SePay (đặt cách đây {timeSince(selectedOrder.createdAt)}).
                      Đơn chỉ tự chuyển sang "Đã thanh toán" khi khách chuyển đúng:
                    </p>
                    <div className="bg-white border border-orange-100 rounded-lg p-3 space-y-1">
                      <p>Nội dung: <span className="font-mono font-bold">SP {selectedOrder.id.slice(0, 6).toUpperCase()}</span></p>
                      <p>Số tiền tối thiểu: <span className="font-bold">{(Number(selectedOrder.total_amount) - Number(selectedOrder.discount_amount) + Number(selectedOrder.shipping_fee || 0)).toLocaleString('vi-VN')} ₫</span></p>
                    </div>
                    <p className="text-xs">Nguyên nhân thường gặp: khách chưa chuyển khoản, ghi sai/thiếu nội dung, hoặc chuyển thiếu tiền. Hãy liên hệ khách qua SĐT {selectedOrder.shipping_phone} và đối soát sao kê nếu khách báo đã chuyển.</p>
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
              {/* Mỗi trạng thái chỉ hiện ĐÚNG 1 nút cho bước kế tiếp */}
              {selectedOrder.status === 'UNPAID' && selectedOrder.payment_method === 'VIETQR_SEPAY' && (
                <p className="text-sm text-orange-700 bg-orange-50 border border-orange-100 p-3 rounded-xl">
                  Chưa thể duyệt: đơn đang chờ khách chuyển khoản (xem lý do ở mục Hình thức thanh toán).
                </p>
              )}

              {/* 1. Kiểm tra & duyệt: COD duyệt ngay; chuyển khoản phải chờ SePay báo đã nhận tiền (PAID) */}
              {((selectedOrder.status === 'UNPAID' && selectedOrder.payment_method === 'COD') || selectedOrder.status === 'PAID') && (
                <button onClick={() => handleUpdateStatus(selectedOrder.id, 'CONFIRMED', 'Xác nhận đã kiểm tra và DUYỆT đơn hàng này?')} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition shadow-sm">
                  Duyệt đơn hàng
                </button>
              )}

              {/* 2. Chuẩn bị đơn */}
              {selectedOrder.status === 'CONFIRMED' && (
                <button onClick={() => handleUpdateStatus(selectedOrder.id, 'PROCESSING', 'Bắt đầu chuẩn bị & đóng gói đơn hàng?')} className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition shadow-sm">
                  Bắt đầu đóng gói
                </button>
              )}

              {/* 3. Shipper đến lấy hàng => tạo vận đơn GHN, chuyển Đang giao */}
              {selectedOrder.status === 'PROCESSING' && (
                <button onClick={() => handleUpdateStatus(selectedOrder.id, 'SHIPPING', 'Shipper đã đến lấy hàng? Hệ thống sẽ gửi đơn lên GHN và chuyển sang Đang giao.')} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-sm">
                  Shipper đã lấy hàng - Gửi GHN
                </button>
              )}

              {/* 4. Chỉ khi Đang giao: xác nhận giao thành công (giả lập webhook GHN "delivered") */}
              {selectedOrder.status === 'SHIPPING' && selectedOrder.tracking_code && (
                <button
                  onClick={() => handleSimulateWebhook(selectedOrder.tracking_code)}
                  disabled={isSimulating}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition shadow-sm flex justify-center items-center gap-2"
                >
                  {isSimulating ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <><Zap className="w-4 h-4" /> Shipper đã giao thành công</>
                  )}
                </button>
              )}

              {/* Nút hủy đơn */}
              {['UNPAID', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPING'].includes(selectedOrder.status) && (
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