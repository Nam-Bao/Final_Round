import React, { useState, useEffect } from 'react';
import { Tag, Copy, Check, Sparkles, Clock, AlertCircle } from 'lucide-react';

const SCOPE_LABELS = {
  ALL: 'Toàn bộ dịch vụ & sản phẩm',
  SPA_SERVICE: 'Dịch vụ Spa',
  PRODUCT: 'Dược mỹ phẩm',
  TREATMENT_PACKAGE: 'Gói lộ trình điều trị'
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState([]);
  const [activeScope, setActiveScope] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    let isMounted = true;

    fetch('http://localhost:4000/api/commerce/promotions')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải mã khuyến mãi');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : (data?.data || []);
        setPromotions(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Lỗi nạp khuyến mãi:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Vô thời hạn';
    return new Date(dateStr).toLocaleDateString('vi-VN');
  };

  const filteredPromotions = promotions.filter((p) => {
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-secondary flex items-center gap-2">
          <Tag className="w-7 h-7 text-primary" /> Mã Khuyến Mãi & Voucher
        </h1>
        <p className="text-base-content/60 mt-1">
          Lưu mã ưu đãi để áp dụng khi thanh toán dịch vụ hoặc mua dược mỹ phẩm tại GlowSkin.
        </p>
      </div>

      {/* Tabs lọc theo phạm vi áp dụng */}
      <div role="tablist" className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveScope('ALL')}
          className={`btn btn-sm rounded-full ${activeScope === 'ALL' ? 'btn-primary' : 'btn-outline btn-primary'}`}
        >
          Tất cả ưu đãi
        </button>
        <button
          onClick={() => setActiveScope('SPA_SERVICE')}
          className={`btn btn-sm rounded-full ${activeScope === 'SPA_SERVICE' ? 'btn-primary' : 'btn-outline btn-primary'}`}
        >
          Dịch vụ Spa
        </button>
        <button
          onClick={() => setActiveScope('PRODUCT')}
          className={`btn btn-sm rounded-full ${activeScope === 'PRODUCT' ? 'btn-primary' : 'btn-outline btn-primary'}`}
        >
          Dược mỹ phẩm
        </button>
        <button
          onClick={() => setActiveScope('TREATMENT_PACKAGE')}
          className={`btn btn-sm rounded-full ${activeScope === 'TREATMENT_PACKAGE' ? 'btn-primary' : 'btn-outline btn-primary'}`}
        >
          Gói điều trị
        </button>
      </div>

      {filteredPromotions.length === 0 ? (
        <div className="text-center py-20 bg-base-100 rounded-2xl border border-base-200">
          <AlertCircle className="w-12 h-12 text-base-content/40 mx-auto mb-2" />
          <p className="text-base-content/60 font-medium">Hiện chưa có mã khuyến mãi nào cho danh mục này.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredPromotions.map((p) => {
            const isPercent = p.discount_type === 'PERCENTAGE';
            const discountLabel = isPercent
              ? `Giảm ${Number(p.discount_value)}%`
              : `Giảm ${Number(p.discount_value).toLocaleString('vi-VN')} đ`;

            const minOrderText = Number(p.min_order_value) > 0
              ? `Đơn tối thiểu ${Number(p.min_order_value).toLocaleString('vi-VN')} đ`
              : 'Không giới hạn đơn tối thiểu';

            const remaining = p.usage_limit ? Math.max(0, p.usage_limit - (p.used_count || 0)) : null;

            return (
              <div
                key={p.id || p.code}
                className="bg-base-100 rounded-2xl border border-primary/20 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden relative"
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="badge badge-primary badge-sm font-semibold tracking-wider mb-1">
                        {discountLabel}
                      </span>
                      <h3 className="text-lg font-bold text-secondary">
                        Voucher {p.code}
                      </h3>
                      <span className="badge badge-outline badge-xs text-primary font-medium mt-1">
                        Áp dụng: {SCOPE_LABELS[p.applicable_scope] || p.applicable_scope}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="text-xs text-base-content/60 space-y-1 pt-1 border-t border-base-200">
                    <div>• {minOrderText}</div>
                    {p.max_discount && isPercent && (
                      <div>• Giảm tối đa: {Number(p.max_discount).toLocaleString('vi-VN')} đ</div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-base-content/50" />
                      <span>Hạn dùng: {formatDate(p.end_date)}</span>
                      {remaining !== null && (
                        <span className="ml-auto text-primary font-medium">Còn {remaining} lượt</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-base-200/50 px-5 py-3 border-t border-dashed border-base-300 flex items-center justify-between">
                  <div className="font-mono font-bold tracking-widest text-primary text-sm bg-base-100 px-3 py-1 rounded-lg border border-primary/30">
                    {p.code}
                  </div>
                  <button
                    onClick={() => handleCopy(p.code)}
                    className="btn btn-sm btn-primary gap-1.5"
                  >
                    {copiedCode === p.code ? (
                      <>
                        <Check className="w-4 h-4" /> Đã sao chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Sao chép mã
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}