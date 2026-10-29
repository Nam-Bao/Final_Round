import React, { useState, useEffect } from 'react';
import { ShoppingBag, Star, Plus, Minus, Trash2, ArrowLeft, CreditCard, AlertCircle, MapPin, Search, CheckCircle, Percent } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export default function CustomerShopPage() {
  const [activeView, setActiveView] = useState('SHOP'); // SHOP | CART | CHECKOUT
  const [products, setProducts] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // States Modal và Thông báo
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  // Đánh giá thật của 1 sản phẩm (chỉ từ khách đã nhận hàng)
  const [reviewProduct, setReviewProduct] = useState(null);
  const [productReviews, setProductReviews] = useState(null);

  const openProductReviews = async (product) => {
    setReviewProduct(product);
    setProductReviews(null);
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/reviews/product/${product.id}`);
      setProductReviews(res.data.data);
    } catch (err) {
      setProductReviews({ avg_rating: 0, review_count: 0, reviews: [] });
    }
  };

  // States Sổ địa chỉ
  const [addressBook, setAddressBook] = useState([]);
  const [showAddressList, setShowAddressList] = useState(false);
  const [addressModal, setAddressModal] = useState({ isOpen: false, mode: 'ADD', data: null });
  const [modalForm, setModalForm] = useState({ recipient_name: '', phone: '', address: '', latitude: null, longitude: null });
  
  // States Tìm kiếm Bản đồ trong Modal
  const [searchQuery, setSearchQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);

  // States Voucher
  const [voucherCode, setVoucherCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedVoucher, setAppliedVoucher] = useState(null);

  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const customer_id = user?.id || null;
  // Backend lấy định danh khách từ token, không tin customer_id gửi lên
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const [checkoutForm, setCheckoutForm] = useState({
    recipient_name: user?.full_name || user?.name || '',
    shipping_phone: user?.phone || '',
    shipping_address: '',
    latitude: null,
    longitude: null,
    note: '',
    payment_method: 'COD'
  });

  useEffect(() => {
    fetchProducts();
    if (customer_id) { 
      fetchCart(); 
      fetchAddressBook(); 
    }
  }, [customer_id]);

  // Hủy voucher khi giỏ hàng thay đổi
  const cartTotal = cartItems.reduce((sum, item) => sum + (Number(item.Product?.price || 0) * item.quantity), 0);
  useEffect(() => {
    if (appliedVoucher) {
       setDiscountAmount(0);
       setAppliedVoucher(null);
       setVoucherCode('');
       setToastMsg('Giỏ hàng thay đổi, đã gỡ mã giảm giá.');
       setTimeout(() => setToastMsg(''), 3000);
    }
  }, [cartTotal]);

  // Debounce API OpenStreetMap trong Modal
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim().length > 1) searchOpenStreetMap(searchQuery);
      else setLocationResults([]);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const fetchProducts = async () => {
    try {
      const res = await axios.get('http://localhost:4000/api/commerce/products');
      setProducts(res.data.data || []);
    } catch (err) { console.error('Lỗi tải SP:', err); }
  };

  const fetchCart = async () => {
    if (!customer_id) return;
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/carts`, authConfig);
      setCartItems(res.data.data?.items || res.data.items || []);
    } catch (err) { console.error('Lỗi giỏ hàng:', err); }
  };

  const fetchAddressBook = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/orders/addresses`, authConfig);
      const addresses = res.data.data || [];
      setAddressBook(addresses);
      
      // Mặc định chọn địa chỉ đầu tiên
      if (addresses.length > 0) {
        setCheckoutForm(prev => ({
          ...prev, 
          recipient_name: addresses[0].recipient_name || prev.recipient_name, 
          shipping_phone: addresses[0].phone || prev.shipping_phone,
          shipping_address: addresses[0].address, 
          latitude: addresses[0].latitude, 
          longitude: addresses[0].longitude
        }));
      }
    } catch (err) { console.error('Lỗi sổ địa chỉ:', err); }
  };

  // --- LOGIC VOUCHER ---
  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      const res = await axios.post('http://localhost:4000/api/commerce/promotions/apply', {
        code: voucherCode, 
        order_value: cartTotal,
        scope_values: { PRODUCT: cartTotal } // Giỏ hàng chỉ có sản phẩm
      }, authConfig);
      const amount = res.data.data?.discount_amount || 0;
      setDiscountAmount(amount);
      setAppliedVoucher({ code: voucherCode.toUpperCase(), amount });
      
      setToastMsg('Áp dụng mã giảm giá thành công!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (error) {
      alert(error.response?.data?.message || 'Mã giảm giá không hợp lệ');
      setDiscountAmount(0);
      setAppliedVoucher(null);
    }
  };

  // --- LOGIC MODAL ĐỊA CHỈ & BẢN ĐỒ ---
  const searchOpenStreetMap = async (query) => {
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&addressdetails=1`);
      setLocationResults(res.data || []);
    } catch (error) { console.error('Lỗi bản đồ:', error); }
  };

  const formatLocationAddress = (loc) => {
    if (!loc.address) return loc.display_name;
    const { house_number, road, neighbourhood, suburb, city_district, city, state } = loc.address;
    let street = road || '';
    if (house_number && road) street = `${house_number} ${road}`;
    const parts = [street, neighbourhood || suburb, city_district, city || state].filter(Boolean);
    return parts.join(', ') || loc.display_name;
  };

  const handleSelectLocation = (loc) => {
    setModalForm(prev => ({ ...prev, address: formatLocationAddress(loc), latitude: loc.lat, longitude: loc.lon }));
    setSearchQuery('');
    setLocationResults([]);
  };

  const openAddressModal = (mode, data = null) => {
    setAddressModal({ isOpen: true, mode, data });
    setSearchQuery('');
    if (mode === 'EDIT' && data) {
      setModalForm({ recipient_name: data.recipient_name, phone: data.phone, address: data.address, latitude: data.latitude, longitude: data.longitude });
    } else {
      setModalForm({ recipient_name: checkoutForm.recipient_name || '', phone: checkoutForm.shipping_phone || '', address: '', latitude: null, longitude: null });
    }
  };

  const handleSaveAddressModal = async () => {
    try {
      if (addressModal.mode === 'ADD') {
        await axios.post('http://localhost:4000/api/commerce/orders/addresses', modalForm, authConfig);
      } else {
        await axios.put(`http://localhost:4000/api/commerce/orders/addresses/${addressModal.data.id}`, modalForm, authConfig);
      }
      setAddressModal({ isOpen: false, mode: 'ADD', data: null });
      fetchAddressBook();
      setToastMsg('Đã lưu thông tin địa chỉ!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) { alert('Lỗi lưu địa chỉ'); }
  };

  // --- LOGIC GIỎ HÀNG & CHECKOUT ---
  const handleAddToCart = async (productId) => {
    if (!customer_id) { setShowLoginModal(true); return; }
    try {
      await axios.post('http://localhost:4000/api/commerce/carts/add', { product_id: productId, quantity: 1 }, authConfig);
      fetchCart();
      setToastMsg('Đã thêm sản phẩm vào giỏ hàng thành công!');
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) { alert(err.response?.data?.message || 'Lỗi thêm vào giỏ'); }
  };

  const handleUpdateQuantity = async (itemId, currentQty, delta) => {
    const newQty = currentQty + delta;
    try {
      if (newQty <= 0) await axios.delete(`http://localhost:4000/api/commerce/carts/item/${itemId}`, authConfig);
      else await axios.put(`http://localhost:4000/api/commerce/carts/item/${itemId}`, { quantity: newQty }, authConfig);
      fetchCart();
    } catch (err) { alert('Lỗi cập nhật số lượng'); }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!customer_id) { setShowLoginModal(true); return; }
    if (!checkoutForm.shipping_address) { alert('Vui lòng chọn hoặc thêm địa chỉ giao hàng!'); return; }
    
    setLoading(true);
    try {
      const payload = { 
        ...checkoutForm, 
        promotion_code: appliedVoucher ? appliedVoucher.code : null, 
        discount_amount: discountAmount,
        save_address_to_book: true 
      };
      
      const res = await axios.post('http://localhost:4000/api/commerce/orders/checkout', payload, authConfig);
      
      if (res.data?.success) {
        alert(`🎉 Đặt hàng thành công! (Thanh toán: ${checkoutForm.payment_method})`);
        setCartItems([]);
        setAppliedVoucher(null);
        setDiscountAmount(0);
        
        // Tự động chuyển hướng tới trang Lịch sử đơn hàng
        window.location.href = '/orders';
      }
    } catch (err) { 
      alert(err.response?.data?.message || 'Lỗi thanh toán'); 
    } finally { 
      setLoading(false); 
    }
  };

  const finalTotal = Math.max(0, cartTotal - discountAmount);
  
  const getProductImage = (img) => {
    if (!img) return 'https://placehold.co/300x300?text=No+Image';
    if (Array.isArray(img) && img.length > 0) return img[0];
    if (typeof img === 'string') {
      try {
        const parsed = JSON.parse(img);
        return Array.isArray(parsed) ? parsed[0] : parsed;
      } catch (e) {
        return img;
      }
    }
    return 'https://placehold.co/300x300?text=No+Image';
  };

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* HIỆU ỨNG TOAST MỜ DẦN KHI THÊM GIỎ HÀNG */}
      {toastMsg && (
        <div className="fixed top-10 right-10 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="font-medium">{toastMsg}</span>
        </div>
      )}

      {/* MÀN HÌNH 1: SHOP */}
      {activeView === 'SHOP' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800">Cửa hàng Dược Mỹ phẩm</h1>
            <button onClick={() => { if (!customer_id) setShowLoginModal(true); else setActiveView('CART'); }} className="relative p-3 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition shadow-sm">
              <ShoppingBag className="w-6 h-6 text-slate-700" />
              {cartItems.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">{cartItems.length}</span>}
            </button>
          </div>

          {products.length === 0 ? (
             <div className="text-center py-20 text-slate-400">Chưa có sản phẩm nào được mở bán.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="aspect-square bg-slate-100 rounded-xl mb-4 overflow-hidden"><img src={getProductImage(p.image_url)} alt={p.name} className="w-full h-full object-cover" /></div>
                    <button type="button" onClick={() => openProductReviews(p)} className="flex items-center gap-1 mb-2 hover:underline">
                      <Star className={`w-4 h-4 ${p.review_count ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                      <span className="text-sm text-slate-600 font-medium">
                        {p.review_count ? `${Number(p.avg_rating).toFixed(1)} (${p.review_count} đánh giá)` : 'Chưa có đánh giá'}
                      </span>
                    </button>
                    <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{p.name}</h3>
                    <p className="text-primary font-bold text-lg my-2">{Number(p.price).toLocaleString()} ₫</p>
                  </div>
                  <button onClick={() => handleAddToCart(p.id)} className="w-full py-2.5 bg-slate-900 text-white font-medium rounded-xl flex items-center justify-center gap-2 mt-4"><Plus className="w-4 h-4"/> Thêm vào giỏ</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MÀN HÌNH 2: CART */}
      {activeView === 'CART' && (
        <div className="max-w-4xl mx-auto p-6">
          <button onClick={() => setActiveView('SHOP')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 font-medium"><ArrowLeft className="w-5 h-5"/> Tiếp tục mua sắm</button>
          <h1 className="text-3xl font-bold text-slate-800 mb-8">Giỏ hàng của bạn</h1>

          {cartItems.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border"><ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-500 text-lg">Giỏ hàng đang trống.</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-4">
                {cartItems.map(item => (
                  <div key={item.id} className="flex gap-4 bg-white p-4 rounded-2xl border">
                    <img src={getProductImage(item.Product?.image_url)} className="w-20 h-20 bg-slate-100 rounded-lg object-cover"/>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-800">{item.Product?.name}</h3>
                      <p className="text-primary font-medium">{Number(item.Product?.price || 0).toLocaleString()} ₫</p>
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
              <div className="bg-slate-900 text-white p-6 rounded-2xl h-fit sticky top-6">
                <h3 className="text-xl font-bold mb-4">Tổng cộng</h3>
                <div className="flex justify-between mb-4 text-slate-300"><span>Tạm tính</span><span className="font-medium text-white">{cartTotal.toLocaleString()} ₫</span></div>
                <hr className="border-slate-700 mb-4"/>
                <div className="flex justify-between mb-8 text-lg font-bold"><span>Thành tiền</span><span className="text-primary">{cartTotal.toLocaleString()} ₫</span></div>
                <button onClick={() => setActiveView('CHECKOUT')} className="w-full py-3 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2">Tiến hành Thanh toán <ArrowLeft className="w-4 h-4 rotate-180"/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MÀN HÌNH 3: CHECKOUT */}
      {activeView === 'CHECKOUT' && (
        <div className="max-w-4xl mx-auto p-6">
          <button onClick={() => setActiveView('CART')} className="flex items-center gap-2 text-slate-500 mb-6 font-medium"><ArrowLeft className="w-5 h-5"/> Quay lại Giỏ hàng</button>
          <h1 className="text-3xl font-bold text-slate-800 mb-8">Thanh toán Đơn hàng</h1>

          <form onSubmit={handleCheckout} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              
              {/* UI GIAO HÀNG */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4">Thông tin giao hàng</h3>
                
                {!showAddressList ? (
                  <div>
                    {checkoutForm.shipping_address ? (
                      <div className="p-4 rounded-xl border border-primary bg-primary/5 mb-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-slate-800">{checkoutForm.recipient_name}</span>
                          <span className="text-sm text-slate-500">{checkoutForm.shipping_phone}</span>
                        </div>
                        <p className="text-sm text-slate-600">{checkoutForm.shipping_address}</p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic mb-3 text-sm">Chưa có thông tin giao hàng.</p>
                    )}
                    <button type="button" onClick={() => setShowAddressList(true)} className="text-primary text-sm font-medium hover:underline">Thay đổi thông tin</button>
                  </div>
                ) : (
                  <div>
                    <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
                      {addressBook.map(addr => (
                        <div key={addr.id} className="p-4 rounded-xl border border-slate-200 cursor-pointer hover:border-primary/50 relative">
                          <div onClick={() => { 
                            setCheckoutForm(prev => ({...prev, recipient_name: addr.recipient_name, shipping_phone: addr.phone, shipping_address: addr.address, latitude: addr.latitude, longitude: addr.longitude}));
                            setShowAddressList(false); 
                          }}>
                            <div className="flex justify-between items-start mb-1 pr-16">
                              <span className="font-bold text-slate-800">{addr.recipient_name}</span>
                              <span className="text-sm text-slate-500">{addr.phone}</span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-2 pr-16">{addr.address}</p>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); openAddressModal('EDIT', addr); }} className="absolute top-4 right-4 text-blue-600 text-sm font-medium hover:underline">
                            Cập nhật
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => openAddressModal('ADD')} className="text-primary text-sm font-medium hover:underline">+ Thêm thông tin mới</button>
                      <button type="button" onClick={() => setShowAddressList(false)} className="text-slate-500 text-sm font-medium hover:underline">Thu gọn</button>
                    </div>
                  </div>
                )}
              </div>

              {/* CHỌN PHƯƠNG THỨC THANH TOÁN */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <h3 className="font-bold text-lg text-slate-800 border-b pb-2 mb-4">Phương thức thanh toán</h3>
                <div className="space-y-3">
                  <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition ${checkoutForm.payment_method === 'COD' ? 'border-primary bg-primary/5' : 'border-slate-200'}`}>
                    <input type="radio" value="COD" checked={checkoutForm.payment_method === 'COD'} onChange={e => setCheckoutForm({...checkoutForm, payment_method: e.target.value})} className="w-4 h-4 text-primary" />
                    <div className="flex-1"><h4 className="font-bold text-slate-800 text-sm">Thanh toán tiền mặt (COD)</h4><p className="text-xs text-slate-500">Trả khi nhận hàng hoặc tại quầy</p></div>
                  </label>
                  <label className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition ${checkoutForm.payment_method === 'VIETQR_SEPAY' ? 'border-primary bg-primary/5' : 'border-slate-200'}`}>
                    <input type="radio" value="VIETQR_SEPAY" checked={checkoutForm.payment_method === 'VIETQR_SEPAY'} onChange={e => setCheckoutForm({...checkoutForm, payment_method: e.target.value})} className="w-4 h-4 text-primary" />
                    <div className="flex-1"><h4 className="font-bold text-slate-800 text-sm">Chuyển khoản VietQR</h4><p className="text-xs text-slate-500">Hệ thống duyệt đơn tự động</p></div>
                  </label>
                </div>
              </div>
            </div>

            {/* BOX TÓM TẮT ĐƠN HÀNG KÈM VOUCHER */}
            <div>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 sticky top-6">
                 <h3 className="font-bold text-lg text-slate-800 mb-4">Tóm tắt đơn hàng</h3>
                 <div className="space-y-3 mb-4 max-h-[200px] overflow-y-auto pr-2">
                   {cartItems.map(item => (
                      <div key={item.id} className="flex justify-between text-sm items-start gap-4">
                        <span className="text-slate-600 flex-1">{item.quantity} x {item.Product?.name}</span>
                        <span className="font-medium text-slate-800 shrink-0">{(Number(item.Product?.price || 0) * item.quantity).toLocaleString()} ₫</span>
                      </div>
                   ))}
                 </div>
                 
                 <div className="flex justify-between text-sm mb-4 border-t pt-4">
                    <span className="text-slate-600">Tạm tính</span>
                    <span className="font-medium text-slate-800">{cartTotal.toLocaleString()} ₫</span>
                 </div>

                 {/* Ô NHẬP VOUCHER */}
                 <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1"><Percent className="w-4 h-4"/> Mã giảm giá</label>
                    <div className="flex gap-2">
                       <input 
                         type="text" placeholder="Nhập mã voucher..." 
                         className="flex-1 p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                         value={voucherCode} onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setVoucherCode(val);
                            if (!val) { setDiscountAmount(0); setAppliedVoucher(null); }
                         }}
                       />
                       <button type="button" onClick={handleApplyVoucher} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700">Áp dụng</button>
                    </div>
                    {appliedVoucher && (
                      <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                         <CheckCircle className="text-green-600"/>
                         <div className="text-sm">
                            <span className="font-bold text-green-700">{appliedVoucher.code}</span>
                            <span className="text-green-600 ml-1">- Đã giảm: {appliedVoucher.amount.toLocaleString()} ₫</span>
                         </div>
                      </div>
                    )}
                 </div>

                 <hr className="border-slate-200 mb-4"/>
                 <div className="flex justify-between text-lg font-bold mb-6">
                    <span className="text-slate-800">TỔNG CẦN THU</span>
                    <span className="text-primary">{finalTotal.toLocaleString()} ₫</span>
                 </div>

                 <button type="submit" disabled={loading} className="w-full py-4 bg-primary hover:bg-primary/90 transition text-white font-bold rounded-xl flex items-center justify-center gap-2">
                   <CreditCard className="w-5 h-5"/> {loading ? 'Đang xử lý...' : 'Xác nhận Đặt hàng'}
                 </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CẬP NHẬT / THÊM MỚI ĐỊA CHỈ */}
      {addressModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
              {addressModal.mode === 'ADD' ? 'Thêm địa chỉ mới' : 'Cập nhật địa chỉ'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Người nhận</label>
                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                  value={modalForm.recipient_name} onChange={e => setModalForm({...modalForm, recipient_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <input type="text" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                  value={modalForm.phone} onChange={e => setModalForm({...modalForm, phone: e.target.value})} />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1">Tìm kiếm Bản đồ</label>
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                  <input type="text" placeholder="Gõ để tìm tên đường, phường, quận..." className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                {locationResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {locationResults.map((loc, idx) => (
                      <div key={idx} onClick={() => handleSelectLocation(loc)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex gap-3 items-start">
                        <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700 leading-tight">{formatLocationAddress(loc)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chi tiết địa chỉ</label>
                <textarea required rows={3} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                  value={modalForm.address} onChange={e => setModalForm({...modalForm, address: e.target.value})} />
                {modalForm.latitude && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Đã lưu tọa độ</p>}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddressModal({ isOpen: false, mode: 'ADD', data: null })} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200">Hủy</button>
              <button onClick={handleSaveAddressModal} className="flex-1 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90">Lưu thông tin</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Yêu cầu đăng nhập khi khách vãng lai thêm giỏ / thanh toán */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Yêu cầu đăng nhập</h3>
            <p className="text-slate-600 mb-6">Bạn cần đăng nhập tài khoản khách hàng để thêm sản phẩm vào giỏ và đặt hàng.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLoginModal(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition">Để sau</button>
              <button onClick={() => window.location.href = '/login'} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition shadow-sm">Đăng nhập</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal đánh giá thật của sản phẩm */}
      {reviewProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReviewProduct(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b pb-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{reviewProduct.name}</h3>
                {productReviews && productReviews.review_count > 0 && (
                  <p className="text-sm text-slate-500 flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> {Number(productReviews.avg_rating).toFixed(1)} / 5 · {productReviews.review_count} đánh giá
                  </p>
                )}
              </div>
              <button onClick={() => setReviewProduct(null)} className="p-1 text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="overflow-y-auto space-y-4">
              {!productReviews ? (
                <div className="text-center py-8 text-slate-400">Đang tải đánh giá...</div>
              ) : productReviews.reviews.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Chưa có đánh giá nào. Đánh giá chỉ đến từ khách đã mua và nhận hàng.</div>
              ) : productReviews.reviews.map((r) => (
                <div key={r.id} className="border-b border-slate-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-slate-700">{r.customer_name} <span className="text-xs text-green-600 font-normal">· Đã mua hàng</span></span>
                    <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div className="flex my-1">
                    {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />)}
                  </div>
                  {r.comment && <p className="text-sm text-slate-600 whitespace-pre-line">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}