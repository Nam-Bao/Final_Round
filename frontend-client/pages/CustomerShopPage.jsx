import React, { useState, useEffect } from 'react';
import { ShoppingBag, Star, Plus, Minus, Trash2, ArrowLeft, CreditCard, CheckCircle, Percent, QrCode, Loader2 } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function CustomerShopPage() {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('SHOP'); 
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // STATES: SỔ ĐỊA CHỈ & GHN
  const [addressBook, setAddressBook] = useState([]);
  const [showAddressList, setShowAddressList] = useState(false);
  const [addressModal, setAddressModal] = useState({ isOpen: false, mode: 'ADD', data: null });
  
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [shippingFee, setShippingFee] = useState(0);

  const [modalForm, setModalForm] = useState({ 
    recipient_name: '', phone: '', house_number: '', 
    province_id: '', district_id: '', ward_code: '', 
    province_name: '', district_name: '', ward_name: '' 
  });

  const [voucherCode, setVoucherCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const [showQRModal, setShowQRModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null); 
  const BANK_ID = import.meta.env.VITE_BANK_ID || 'MB';
  const ACCOUNT_NO = import.meta.env.VITE_ACCOUNT_NO || '0909123456';
  const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME || 'GLOWSKIN SPA';

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  // Chỉ coi là đã đăng nhập khi có cả token (giỏ hàng/đặt hàng đều cần token, server lấy khách từ token)
  const customer_id = user && localStorage.getItem('token') ? user.id : null;

  const [checkoutForm, setCheckoutForm] = useState({
    recipient_name: '', shipping_phone: '', shipping_address: '', 
    shipping_district_id: null, shipping_ward_code: null,
    note: '', payment_method: 'COD'
  });

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.Product.price * item.quantity), 0);
  const totalWeight = cartItems.reduce((sum, item) => {
    // Ưu tiên lấy cân nặng thật từ database, nếu sản phẩm cũ chưa có thì lấy tạm 200g
    const productWeight = item.Product.weight || 200; 
    return sum + (item.quantity * productWeight);
  }, 300); // 300g là khối lượng vỏ hộp/thùng carton đóng gói
  const finalTotal = Math.max(0, cartTotal - discountAmount) + shippingFee; 

  // Load danh sách Tỉnh/Thành ngay từ đầu để sẵn sàng dò tìm
  useEffect(() => {
    axios.get('http://localhost:4000/api/commerce/orders/ghn/province')
      .then(res => setProvinces(res.data.data))
      .catch(err => console.error("Lỗi lấy Tỉnh:", err));
  }, []);

  useEffect(() => {
    fetchProducts();
    if (customer_id) { fetchCart(); fetchAddressBook(); }
  }, [customer_id]);

  useEffect(() => {
    if (appliedVoucher) {
       setDiscountAmount(0); setAppliedVoucher(null); setVoucherCode('');
       setToastMsg('Giỏ hàng thay đổi, đã gỡ mã giảm giá.');
       setTimeout(() => setToastMsg(''), 3000);
    }
  }, [cartTotal]);

  const fetchProducts = async () => {
    try {
      const res = await axios.get('http://localhost:4000/api/commerce/products');
      setProducts(res.data.data || []);
    } catch (err) { console.error('Lỗi tải SP:', err); }
  };

  const fetchCart = async () => {
    if (!customer_id) return;
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/carts?customer_id=${customer_id}`);
      setCartItems(res.data.data.items || []);
    } catch (err) { console.error('Lỗi giỏ hàng:', err); }
  };

  const fetchAddressBook = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/orders/addresses?customer_id=${customer_id}`);
      const addresses = res.data.data || [];
      setAddressBook(addresses);
      
      if (addresses.length > 0) {
        handleSelectAddress(addresses[0]);
      }
    } catch (err) { console.error('Lỗi sổ địa chỉ:', err); }
  };

  const handleSelectAddress = async (addr) => {
    setCheckoutForm(prev => ({
      ...prev, recipient_name: addr.recipient_name, shipping_phone: addr.phone,
      shipping_address: addr.address, shipping_district_id: addr.shipping_district_id, shipping_ward_code: addr.shipping_ward_code
    }));
    setShowAddressList(false);

    if (addr.shipping_district_id && addr.shipping_ward_code) {
      try {
        const feeRes = await axios.post('http://localhost:4000/api/commerce/orders/ghn/fee', {
          to_district_id: addr.shipping_district_id,
          to_ward_code: addr.shipping_ward_code,
          weight: totalWeight
        });
        setShippingFee(feeRes.data.data?.total || 0);
      } catch (error) {
        setShippingFee(30000); // Fallback
      }
    } else {
      setShippingFee(0); // Không có mã vùng thì không tính được phí
    }
  };

  // LOGIC THÔNG MINH: Dịch ngược địa chỉ Text thành ID của GHN khi bấm Cập nhật
  const openAddressModal = async (mode, addr = null) => {
    setAddressModal({ isOpen: true, mode, data: addr });
    if (mode === 'EDIT' && addr) {
      // Phân tách địa chỉ "Số 14, Phường 14, Quận Gò Vấp, Hồ Chí Minh"
      const parts = (addr.address || '').split(', ');
      const hNum = parts[0] || '';
      const wName = parts[1] || '';
      const dName = parts[2] || '';
      const pName = parts[3] || '';

      let pId = '';
      let dId = addr.shipping_district_id || '';
      let wCode = addr.shipping_ward_code || '';

      // Tạm đưa form vào trạng thái đang Load
      setModalForm({
        recipient_name: addr.recipient_name, phone: addr.phone, house_number: hNum,
        province_id: '', district_id: '', ward_code: '',
        province_name: pName, district_name: dName, ward_name: wName
      });

      // Dò Tỉnh/Thành
      if (provinces.length > 0 && pName) {
        const matchedProv = provinces.find(p => p.ProvinceName === pName || p.ProvinceName.includes(pName));
        if (matchedProv) {
          pId = matchedProv.ProvinceID;
          try {
            // Load Huyện
            const distRes = await axios.get(`http://localhost:4000/api/commerce/orders/ghn/district?province_id=${pId}`);
            setDistricts(distRes.data.data);

            if (!dId) {
              const matchedDist = distRes.data.data.find(d => d.DistrictName === dName || d.DistrictName.includes(dName));
              if (matchedDist) dId = matchedDist.DistrictID;
            }

            if (dId) {
              // Load Phường
              const wardRes = await axios.get(`http://localhost:4000/api/commerce/orders/ghn/ward?district_id=${dId}`);
              setWards(wardRes.data.data);

              if (!wCode) {
                const matchedWard = wardRes.data.data.find(w => w.WardName === wName || w.WardName.includes(wName));
                if (matchedWard) wCode = matchedWard.WardCode;
              }
            }
          } catch (error) { console.error("Lỗi phục hồi dropdown:", error) }
        }
      }

      // Đổ lại dữ liệu ID vào form để Dropdown tự động Focus vào đúng tên
      setModalForm({
        recipient_name: addr.recipient_name, phone: addr.phone, house_number: hNum,
        province_id: pId, district_id: dId, ward_code: wCode,
        province_name: pName, district_name: dName, ward_name: wName
      });

    } else {
      // Chế độ THÊM MỚI
      setModalForm({
        recipient_name: user?.Profile?.full_name || '', phone: user?.Profile?.phone || '', house_number: '',
        province_id: '', district_id: '', ward_code: '',
        province_name: '', district_name: '', ward_name: ''
      });
      setDistricts([]); setWards([]);
    }
  };

  const handleProvinceChange = async (e) => {
    const pId = e.target.value;
    const pName = e.target.options[e.target.selectedIndex].text;
    setModalForm({ ...modalForm, province_id: pId, province_name: pName, district_id: '', district_name: '', ward_code: '', ward_name: '' });
    setWards([]);
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/orders/ghn/district?province_id=${pId}`);
      setDistricts(res.data.data);
    } catch (err) { console.error(err); }
  };

  const handleDistrictChange = async (e) => {
    const dId = e.target.value;
    const dName = e.target.options[e.target.selectedIndex].text;
    setModalForm({ ...modalForm, district_id: dId, district_name: dName, ward_code: '', ward_name: '' });
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/orders/ghn/ward?district_id=${dId}`);
      setWards(res.data.data);
    } catch (err) { console.error(err); }
  };

  const handleSaveAddressModal = async () => {
    if(!modalForm.ward_code) return alert("Vui lòng chọn đầy đủ Phường/Xã");
    const fullAddress = `${modalForm.house_number}, ${modalForm.ward_name}, ${modalForm.district_name}, ${modalForm.province_name}`;
    
    const payload = {
      customer_id, recipient_name: modalForm.recipient_name, phone: modalForm.phone,
      address: fullAddress, 
      shipping_district_id: modalForm.district_id, 
      shipping_ward_code: modalForm.ward_code 
    };

    try {
      if (addressModal.mode === 'ADD') await axios.post('http://localhost:4000/api/commerce/orders/addresses', payload);
      else await axios.put(`http://localhost:4000/api/commerce/orders/addresses/${addressModal.data.id}`, payload);
      
      setAddressModal({ isOpen: false });
      fetchAddressBook(); 
      setToastMsg('Đã lưu thông tin địa chỉ!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) { alert('Lỗi lưu địa chỉ'); }
  };

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      const res = await axios.post('http://localhost:4000/api/commerce/promotions/apply', {
        code: voucherCode, order_value: cartTotal, customer_id
      });
      const amount = res.data.data.discount_amount;
      setDiscountAmount(amount); setAppliedVoucher({ code: voucherCode.toUpperCase(), amount });
      setToastMsg('Áp dụng mã giảm giá thành công!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (error) { alert(error.response?.data?.message || 'Mã giảm giá không hợp lệ'); }
  };

  const handleAddToCart = async (productId) => {
    if (!customer_id) return setShowLoginModal(true);
    try {
      await axios.post('http://localhost:4000/api/commerce/carts/add', { customer_id, product_id: productId, quantity: 1 });
      fetchCart();
      setToastMsg('Đã thêm sản phẩm vào giỏ hàng thành công!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) { alert(err.response?.data?.message || 'Lỗi thêm vào giỏ'); }
  };

  const handleUpdateQuantity = async (itemId, currentQty, delta) => {
    const newQty = currentQty + delta;
    try {
      if (newQty <= 0) await axios.delete(`http://localhost:4000/api/commerce/carts/item/${itemId}`);
      else await axios.put(`http://localhost:4000/api/commerce/carts/item/${itemId}`, { quantity: newQty });
      fetchCart();
    } catch (err) { alert('Lỗi cập nhật số lượng'); }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!customer_id) return setShowLoginModal(true);
    if (!checkoutForm.shipping_address) return alert('Vui lòng chọn địa chỉ giao hàng!');
    if (!checkoutForm.shipping_district_id) return alert('Địa chỉ bạn chọn là dữ liệu cũ. Vui lòng cập nhật Tỉnh/Phường!');
    
    setLoading(true);
    try {
      const payload = { 
        ...checkoutForm, customer_id, promotion_code: appliedVoucher?.code || null, 
        shipping_fee: shippingFee, save_address_to_book: false 
      };
      const res = await axios.post('http://localhost:4000/api/commerce/orders/checkout', payload);
      
      const newOrder = res.data.data;
      
      // KIỂM TRA PHƯƠNG THỨC THANH TOÁN
      if (checkoutForm.payment_method === 'VIETQR_SEPAY') {
        // Số tiền QR lấy theo đơn server đã lưu (phí ship do server tự tính lại với GHN), khớp với webhook SePay
        const serverTotal = Math.max(0, Number(newOrder.total_amount) - Number(newOrder.discount_amount || 0) + Number(newOrder.shipping_fee || 0));
        setCurrentOrder({ ...newOrder, finalTotal: serverTotal });
        setShowQRModal(true); 
      } else {
        alert(`🎉 Đặt hàng thành công! (Thanh toán: COD)`);
        setCartItems([]); setActiveView('SHOP'); fetchAddressBook();
      }
    } catch (err) { alert(err.response?.data?.message || 'Lỗi thanh toán'); } 
    finally { setLoading(false); }
  };

  // POLLING KIỂM TRA THANH TOÁN VIETQR SEPAY
  useEffect(() => {
    if (!showQRModal || !currentOrder) return;
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token'); // Hoặc lấy từ state nếu bạn lưu kiểu khác
        const res = await axios.get(`http://localhost:4000/api/commerce/orders/${currentOrder.id}/check-payment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.data.isPaid) {
          clearInterval(interval);
          setShowQRModal(false);
          setToastMsg('🎉 Đã nhận thanh toán! Đơn hàng đang được chuẩn bị.');
          setTimeout(() => setToastMsg(''), 5000);
          setCartItems([]); 
          setActiveView('SHOP'); 
          fetchAddressBook();
        }
      } catch (error) { console.error("Đang chờ thanh toán..."); }
    }, 3000); 

    return () => clearInterval(interval); 
  }, [showQRModal, currentOrder]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* Khách vãng lai thêm vào giỏ / thanh toán => bắt buộc đăng nhập (trước đây có state nhưng chưa từng render modal) */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowLoginModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center space-y-4" onClick={e => e.stopPropagation()}>
            <ShoppingBag className="w-12 h-12 text-blue-600 mx-auto" />
            <h3 className="text-lg font-bold text-slate-800">Vui lòng đăng nhập</h3>
            <p className="text-sm text-slate-600">Bạn cần đăng nhập để thêm sản phẩm vào giỏ hàng và đặt mua.</p>
            <div className="flex gap-3">
              <button onClick={() => navigate('/login')} className="flex-1 py-2.5 bg-slate-900 text-white font-medium rounded-xl">Đăng nhập</button>
              <button onClick={() => navigate('/register')} className="flex-1 py-2.5 border border-slate-300 font-medium rounded-xl">Đăng ký</button>
            </div>
            <button onClick={() => setShowLoginModal(false)} className="text-sm text-slate-500 hover:underline">Để sau</button>
          </div>
        </div>
      )}
      {toastMsg && (
        <div className="fixed top-10 right-10 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="font-medium">{toastMsg}</span>
        </div>
      )}

      {activeView === 'SHOP' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800">Cửa hàng Dược Mỹ phẩm</h1>
            <button onClick={() => { if (!customer_id) setShowLoginModal(true); else setActiveView('CART'); }} className="relative p-3 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition shadow-sm">
              <ShoppingBag className="w-6 h-6 text-slate-700" />
              {cartItems.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">{cartItems.length}</span>}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="aspect-square bg-slate-100 rounded-xl mb-4 overflow-hidden"><img src={p.image_url?.[0] || 'https://placehold.co/300x300'} className="w-full h-full object-cover" /></div>
                  <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{p.name}</h3>
                  <p className="text-primary font-bold text-lg my-2">{Number(p.price).toLocaleString()} ₫</p>
                </div>
                <button onClick={() => handleAddToCart(p.id)} className="w-full py-2.5 bg-slate-900 text-white font-medium rounded-xl flex items-center justify-center gap-2 mt-4"><Plus className="w-4 h-4"/> Thêm vào giỏ</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeView === 'CART' && (
        <div className="max-w-4xl mx-auto p-6">
          <button onClick={() => setActiveView('SHOP')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 font-medium"><ArrowLeft className="w-5 h-5"/> Mua tiếp</button>
          <h1 className="text-3xl font-bold text-slate-800 mb-8">Giỏ hàng</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-4">
              {cartItems.map(item => (
                <div key={item.id} className="flex gap-4 bg-white p-4 rounded-2xl border">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">{item.Product.name}</h3>
                    <p className="text-primary font-medium">{Number(item.Product.price).toLocaleString()} ₫</p>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 p-1 rounded-lg border">
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)} className="p-1 hover:bg-white rounded"><Minus className="w-4 h-4"/></button>
                    <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)} className="p-1 hover:bg-white rounded"><Plus className="w-4 h-4"/></button>
                  </div>
                  <button onClick={() => handleUpdateQuantity(item.id, item.quantity, -item.quantity)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-5 h-5"/></button>
                </div>
              ))}
            </div>
            <div className="bg-slate-900 text-white p-6 rounded-2xl h-fit">
              <div className="flex justify-between mb-8 text-lg font-bold"><span>Tạm tính</span><span className="text-primary">{cartTotal.toLocaleString()} ₫</span></div>
              <button onClick={() => setActiveView('CHECKOUT')} className="w-full py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2">Thanh toán <ArrowLeft className="w-4 h-4 rotate-180"/></button>
            </div>
          </div>
        </div>
      )}

      {activeView === 'CHECKOUT' && (
        <div className="max-w-5xl mx-auto p-6">
          <button onClick={() => setActiveView('CART')} className="flex items-center gap-2 text-slate-500 mb-6 font-medium"><ArrowLeft className="w-5 h-5"/> Quay lại Giỏ hàng</button>
          
          <form onSubmit={handleCheckout} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              
              {/* UI GIAO HÀNG */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4">Giao hàng đến</h3>
                {!showAddressList ? (
                  <div>
                    {checkoutForm.shipping_address ? (
                      <div className="p-4 rounded-xl border border-primary bg-primary/5 mb-3 relative">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-slate-800">{checkoutForm.recipient_name}</span>
                          <span className="text-sm text-slate-500">{checkoutForm.shipping_phone}</span>
                        </div>
                        <p className="text-sm text-slate-600 pr-4">{checkoutForm.shipping_address}</p>
                        
                        {!checkoutForm.shipping_district_id && (
                          <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                            ⚠️ Bấm 'Đổi địa chỉ khác' và Cập nhật lại để bổ sung Quận/Phường.
                          </div>
                        )}
                      </div>
                    ) : (<p className="text-slate-500 italic mb-3 text-sm">Chưa có thông tin giao hàng.</p>)}
                    <button type="button" onClick={() => setShowAddressList(true)} className="text-primary text-sm font-medium hover:underline">Đổi địa chỉ khác</button>
                  </div>
                ) : (
                  <div>
                    <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
                      {addressBook.map(addr => (
                        <div key={addr.id} onClick={() => handleSelectAddress(addr)} className="p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-primary/50 relative">
                          <div className="flex justify-between items-start mb-1 pr-16"><span className="font-bold text-slate-800">{addr.recipient_name}</span><span className="text-sm text-slate-500">{addr.phone}</span></div>
                          <p className="text-sm text-slate-600 line-clamp-2 pr-16">{addr.address}</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); openAddressModal('EDIT', addr); }} className="absolute top-4 right-4 text-blue-600 text-sm font-medium hover:underline">
                            Cập nhật
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => openAddressModal('ADD')} className="text-primary text-sm font-medium hover:underline">+ Thêm địa chỉ mới</button>
                      <button type="button" onClick={() => setShowAddressList(false)} className="text-slate-500 text-sm font-medium hover:underline">Thu gọn</button>
                    </div>
                  </div>
                )}
              </div>

              {/* PAYMENT METHOD */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4">Thanh toán</h3>
                <div className="space-y-3">
                  <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer ${checkoutForm.payment_method === 'COD' ? 'border-primary bg-primary/5' : 'border-slate-200'}`}>
                    <input type="radio" value="COD" checked={checkoutForm.payment_method === 'COD'} onChange={e => setCheckoutForm({...checkoutForm, payment_method: e.target.value})} className="w-4 h-4 text-primary" />
                    <div className="flex-1"><h4 className="font-bold text-sm">Tiền mặt (COD)</h4></div>
                  </label>
                  <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer ${checkoutForm.payment_method === 'VIETQR_SEPAY' ? 'border-primary bg-primary/5' : 'border-slate-200'}`}>
                    <input type="radio" value="VIETQR_SEPAY" checked={checkoutForm.payment_method === 'VIETQR_SEPAY'} onChange={e => setCheckoutForm({...checkoutForm, payment_method: e.target.value})} className="w-4 h-4 text-primary" />
                    <div className="flex-1"><h4 className="font-bold text-sm">Chuyển khoản VietQR</h4></div>
                  </label>
                </div>
              </div>
            </div>

            {/* BILL & VOUCHER */}
            <div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 sticky top-6">
                 <h3 className="font-bold text-lg text-slate-800 mb-4">Tóm tắt đơn hàng</h3>
                 
                 <div className="flex justify-between text-sm mb-2 text-slate-600"><span>Tiền hàng</span><span className="font-medium text-slate-800">{cartTotal.toLocaleString()} ₫</span></div>
                 
                 <div className="flex justify-between text-sm mb-4 text-slate-600">
                   <span>Phí vận chuyển (GHN)</span>
                   <span className="font-medium text-slate-800">{shippingFee > 0 ? `${shippingFee.toLocaleString()} ₫` : (checkoutForm.shipping_district_id ? 'Miễn phí' : '---')}</span>
                 </div>

                 <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1"><Percent className="w-4 h-4"/> Voucher</label>
                    <div className="flex gap-2">
                       <input type="text" placeholder="Nhập mã..." className="flex-1 p-2.5 border rounded-lg" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())} />
                       <button type="button" onClick={handleApplyVoucher} className="px-4 py-2 bg-slate-800 text-white rounded-lg">Áp dụng</button>
                    </div>
                    {appliedVoucher && <p className="text-sm text-green-600 mt-2 font-bold">- Đã giảm: {appliedVoucher.amount.toLocaleString()} ₫</p>}
                 </div>

                 <hr className="border-slate-200 mb-4"/>
                 <div className="flex justify-between text-lg font-bold mb-6">
                    <span>TỔNG CẦN THU</span>
                    <span className="text-primary">{finalTotal.toLocaleString()} ₫</span>
                 </div>
                 <button type="submit" disabled={loading} className="w-full py-4 bg-primary text-white font-bold rounded-xl">{loading ? 'Đang xử lý...' : 'Xác nhận Đặt hàng'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL THÊM / SỬA ĐỊA CHỈ API GHN */}
      {addressModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
              {addressModal.mode === 'ADD' ? 'Thêm địa chỉ mới' : 'Cập nhật địa chỉ'}
            </h3>
            <div className="space-y-4">
              <input type="text" placeholder="Tên người nhận" className="w-full p-2.5 border rounded-lg" value={modalForm.recipient_name} onChange={e => setModalForm({...modalForm, recipient_name: e.target.value})} />
              <input type="text" placeholder="Số điện thoại" className="w-full p-2.5 border rounded-lg" value={modalForm.phone} onChange={e => setModalForm({...modalForm, phone: e.target.value})} />
              
              <select className="w-full p-2.5 border rounded-lg bg-white" onChange={handleProvinceChange} value={modalForm.province_id}>
                <option value="">-- Chọn Tỉnh/Thành phố --</option>
                {provinces.map(p => <option key={p.ProvinceID} value={p.ProvinceID}>{p.ProvinceName}</option>)}
              </select>

              <select className="w-full p-2.5 border rounded-lg bg-white" onChange={handleDistrictChange} value={modalForm.district_id} disabled={!modalForm.province_id}>
                <option value="">-- Chọn Quận/Huyện --</option>
                {districts.map(d => <option key={d.DistrictID} value={d.DistrictID}>{d.DistrictName}</option>)}
              </select>

              <select className="w-full p-2.5 border rounded-lg bg-white" onChange={e => setModalForm({...modalForm, ward_code: e.target.value, ward_name: e.target.options[e.target.selectedIndex].text})} value={modalForm.ward_code} disabled={!modalForm.district_id}>
                <option value="">-- Chọn Phường/Xã --</option>
                {wards.map(w => <option key={w.WardCode} value={w.WardCode}>{w.WardName}</option>)}
              </select>

              <input type="text" placeholder="Số nhà, Tên đường" className="w-full p-2.5 border rounded-lg" value={modalForm.house_number} onChange={e => setModalForm({...modalForm, house_number: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddressModal({ isOpen: false })} className="flex-1 py-2.5 bg-slate-100 rounded-xl font-medium">Hủy</button>
              <button onClick={handleSaveAddressModal} className="flex-1 py-2.5 bg-primary text-white rounded-xl font-medium">Lưu địa chỉ</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUÉT MÃ QR THANH TOÁN SEPAY */}
      {showQRModal && currentOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-slate-800 text-center flex items-center justify-center gap-2 mb-4">
              <QrCode className="w-6 h-6 text-primary" /> Thanh Toán Đơn Hàng
            </h3>
            
            <div className="text-center space-y-4">
              <p className="text-sm font-medium text-slate-500">Mã đơn hàng: <b className="text-slate-800">#{currentOrder.id.slice(0,8).toUpperCase()}</b></p>
              
              <div className="p-3 border-2 border-primary rounded-xl inline-block bg-white mx-auto shadow-sm">
                <img 
                  src={`https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${currentOrder.finalTotal}&addInfo=SP ${currentOrder.id.slice(0,6).toUpperCase()}&accountName=${ACCOUNT_NAME}`} 
                  alt="QR Code" 
                  className="w-56 h-56 object-cover"
                />
              </div>
              <p className="text-xs text-slate-500">Sử dụng App Ngân hàng bất kỳ để quét mã</p>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-left text-sm space-y-2 mt-4">
                 <p className="flex justify-between"><span>Số tiền:</span> <b className="text-red-500 text-lg">{currentOrder.finalTotal.toLocaleString()} ₫</b></p>
                 <p className="flex justify-between items-center">
                    <span>Nội dung CK:</span> 
                    <b className="text-primary font-mono bg-blue-50 px-2 py-1 rounded text-lg border border-blue-200">SP {currentOrder.id.slice(0,6).toUpperCase()}</b>
                 </p>
              </div>

              <div className="bg-blue-50/50 text-slate-600 p-3 rounded-xl border border-blue-100 flex flex-col items-center justify-center gap-2 mt-4">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs font-medium animate-pulse text-center">Hệ thống đang chờ bạn quét mã...<br/>Trang sẽ tự động chuyển khi nhận được tiền.</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                if(window.confirm('Bạn chưa thanh toán. Nếu hủy, đơn hàng sẽ nằm ở trạng thái Chờ duyệt. Bạn vẫn muốn thoát?')) {
                   setShowQRModal(false);
                   setCartItems([]);
                   setActiveView('SHOP');
                }
              }} 
              className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition"
            >
              Hủy thanh toán & Thoát
            </button>
          </div>
        </div>
      )}
    </div>
  );
}