import React, { useState, useEffect } from 'react';
import { Tag, Copy, Check, Sparkles, Clock, AlertCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const SCOPE_LABELS = {
  ALL: 'Toàn bộ dịch vụ & sản phẩm',
  SPA_SERVICE: 'Dịch vụ Spa',
  PRODUCT: 'Dược mỹ phẩm',
  TREATMENT_PACKAGE: 'Gói lộ trình điều trị'
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [savedPromoIds, setSavedPromoIds] = useState([]); // Chứa danh sách ID mã đã lưu
  const [activeScope, setActiveScope] = useState('ALL'); // ALL, SPA_SERVICE, PRODUCT, TREATMENT_PACKAGE, MY_OFFERS
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [usedPromoIds, setUsedPromoIds] = useState([]);

  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const customer_id = user?.id || null;
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchPromotions();
    if (customer_id) 
      fetchSavedPromotions();
      fetchUsedPromotions();
  }, [customer_id]);

  const fetchPromotions = async () => {
    try {
      const res = await axios.get('http://localhost:4000/api/commerce/promotions');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setPromotions(list);
    } catch (err) {
      console.error('Lỗi nạp khuyến mãi:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsedPromotions = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/promotions/used`, authConfig);
      setUsedPromoIds(res.data.data || []);
    } catch (err) { console.error('Lỗi lấy mã đã dùng:', err); }
  };

  const fetchSavedPromotions = async () => {
    try {
      const res = await axios.get(`http://localhost:4000/api/commerce/promotions/saved`, authConfig);
      setSavedPromoIds(res.data.data || []);
    } catch (err) { console.error('Lỗi lấy mã đã lưu:', err); }
  };

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSavePromo = async (promotion_id) => {
    if (!customer_id) {
      setShowLoginModal(true);
      return;
    }
    try {
      await axios.post('http://localhost:4000/api/commerce/promotions/save', { promotion_id }, authConfig);
      setSavedPromoIds(prev => [...prev, promotion_id]); // Cập nhật UI ngay lập tức
    } catch (error) {
      alert(error.response?.data?.message || 'Lỗi lưu mã');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Vô thời hạn';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  // Logic lọc mã hiển thị theo Tab
  const filteredPromotions = promotions.filter((p) => {
    // 1. Ẩn toàn bộ những mã khách đã dùng khỏi tất cả các Tab
    if (usedPromoIds.includes(p.id)) return false;

    // 2. Logic lọc Tab như cũ
    if (activeScope === 'MY_OFFERS') return savedPromoIds.includes(p.id);
    if (activeScope === 'ALL') return true;
    return p.applicable_scope === activeScope || p.applicable_scope === 'ALL';
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-28">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 p-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-secondary flex items-center gap-2">
          <Tag className="w-7 h-7 text-primary" /> Mã Khuyến Mãi & Voucher
        </h1>
        <p className="text-base-content/60 mt-1">
          Lưu mã ưu đãi để áp dụng khi thanh toán dịch vụ hoặc mua dược mỹ phẩm tại GlowSkin.
        </p>
      </div>

      {/* Tabs lọc theo phạm vi áp dụng */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveScope('ALL')} className={`btn btn-sm rounded-full ${activeScope === 'ALL' ? 'btn-primary' : 'btn-outline btn-primary'}`}>
          Tất cả ưu đãi
        </button>
        <button onClick={() => setActiveScope('SPA_SERVICE')} className={`btn btn-sm rounded-full ${activeScope === 'SPA_SERVICE' ? 'btn-primary' : 'btn-outline btn-primary'}`}>
          Dịch vụ Spa
        </button>
        <button onClick={() => setActiveScope('PRODUCT')} className={`btn btn-sm rounded-full ${activeScope === 'PRODUCT' ? 'btn-primary' : 'btn-outline btn-primary'}`}>
          Dược mỹ phẩm
        </button>
        
        <div className="divider divider-horizontal mx-0 hidden sm:flex"></div>
        
        {/* Tab Ưu đãi của tôi */}
        <button onClick={() => {
            if (!customer_id) setShowLoginModal(true);
            else setActiveScope('MY_OFFERS');
          }} 
          className={`btn btn-sm rounded-full ${activeScope === 'MY_OFFERS' ? 'bg-secondary text-white border-secondary hover:bg-secondary' : 'btn-outline'}`}
        >
          <Bookmark className="w-4 h-4" /> Ưu đãi của tôi ({savedPromoIds.length})
        </button>
      </div>

      {filteredPromotions.length === 0 ? (
        <div className="text-center py-20 bg-base-100 rounded-2xl border border-base-200 shadow-sm">
          <AlertCircle className="w-12 h-12 text-base-content/30 mx-auto mb-3" />
          <p className="text-base-content/60 font-medium text-lg">
            {activeScope === 'MY_OFFERS' ? 'Bạn chưa lưu mã khuyến mãi nào.' : 'Hiện chưa có mã khuyến mãi nào cho danh mục này.'}
          </p>
          {activeScope === 'MY_OFFERS' && (
            <button onClick={() => setActiveScope('ALL')} className="btn btn-primary mt-4">Khám phá ưu đãi</button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredPromotions.map((p) => {
            const isPercent = p.discount_type === 'PERCENTAGE';
            const discountLabel = isPercent ? `Giảm ${Number(p.discount_value)}%` : `Giảm ${Number(p.discount_value).toLocaleString('vi-VN')} ₫`;
            const minOrderText = Number(p.min_order_value) > 0 ? `Đơn tối thiểu ${Number(p.min_order_value).toLocaleString('vi-VN')} ₫` : 'Không giới hạn đơn tối thiểu';
            const remaining = p.usage_limit ? Math.max(0, p.usage_limit - (p.used_count || 0)) : null;
            
            const isSaved = savedPromoIds.includes(p.id);

            return (
              <div key={p.id} className="bg-base-100 rounded-2xl border border-primary/20 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden relative">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="badge badge-primary badge-sm font-semibold tracking-wider mb-1 px-2 py-3 text-xs">{discountLabel}</span>
                      <h3 className="text-lg font-bold text-secondary">Voucher {p.code}</h3>
                      <span className="badge badge-outline badge-xs text-primary font-medium mt-1">Áp dụng: {SCOPE_LABELS[p.applicable_scope] || p.applicable_scope}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="text-xs text-base-content/60 space-y-1 pt-1 border-t border-base-200">
                    <div>• {minOrderText}</div>
                    {p.max_discount && isPercent && <div>• Giảm tối đa: {Number(p.max_discount).toLocaleString('vi-VN')} ₫</div>}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-base-content/50" />
                      <span>Hạn dùng: {formatDate(p.end_date)}</span>
                      {remaining !== null && <span className="ml-auto text-primary font-medium">Còn {remaining} lượt</span>}
                    </div>
                  </div>
                </div>

                {/* Thanh Action dưới cùng */}
                <div className="bg-base-200/50 px-5 py-3 border-t border-dashed border-base-300 flex items-center justify-between">
                  <div className="font-mono font-bold tracking-widest text-primary text-sm bg-base-100 px-3 py-1.5 rounded-lg border border-primary/30">
                    {p.code}
                  </div>
                  
                  <div className="flex gap-2">
                    {/* Nút Copy: Luôn hiện nếu khách đã lưu hoặc đang xem giỏ hàng */}
                    {isSaved && (
                      <button onClick={() => handleCopy(p.code)} className="btn btn-sm btn-outline btn-primary gap-1.5">
                        {copiedCode === p.code ? <><Check className="w-4 h-4" /> Đã chép</> : <><Copy className="w-4 h-4" /> Sao chép</>}
                      </button>
                    )}

                    {/* Nút Lưu: Chuyển màu và disable khi đã lưu */}
                    <button 
                      disabled={isSaved}
                      onClick={() => handleSavePromo(p.id)}
                      className={`btn btn-sm gap-1.5 ${isSaved ? 'btn-disabled bg-slate-100 text-slate-400' : 'btn-primary'}`}
                    >
                      {isSaved ? <><BookmarkCheck className="w-4 h-4" /> Đã lưu</> : 'Lưu mã'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Yêu cầu đăng nhập khi khách vãng lai nhấn Lưu mã */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl text-center animate-in fade-in zoom-in duration-200">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Yêu cầu đăng nhập</h3>
            <p className="text-slate-600 mb-6">Bạn cần đăng nhập tài khoản khách hàng để có thể lưu mã ưu đãi vào Ví voucher của mình.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLoginModal(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition">Để sau</button>
              <button onClick={() => window.location.href = '/login'} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition shadow-sm">Đồng ý (Đăng nhập)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}