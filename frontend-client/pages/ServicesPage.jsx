import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Star, Sparkles, X } from 'lucide-react';
import ServiceDetail from '../components/ServiceDetail';

const CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'acne', label: 'Trị mụn' },
  { id: 'melasma', label: 'Trị nám và tàn nhang' },
  { id: 'rejuvenation', label: 'Trẻ hóa da' },
  { id: 'recovery', label: 'Phục hồi da' },
  { id: 'basic', label: 'Chăm sóc da cơ bản' },
];

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('default');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null); // dịch vụ đang mở popup chi tiết

  // Esc để đóng popup
  useEffect(() => {
    if (!detailId) return;
    const onKey = (e) => e.key === 'Escape' && setDetailId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId]);

  useEffect(() => {
    let isMounted = true;

    // Điểm đánh giá thật của từng dịch vụ: { [service_id]: { total, count } }
    const reviewStatsPromise = fetch('http://localhost:4000/api/booking/reviews/services')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => (data.data || []).reduce((acc, r) => {
        acc[r.service_id] ??= { total: 0, count: 0 };
        acc[r.service_id].total += Number(r.rating);
        acc[r.service_id].count += 1;
        return acc;
      }, {}))
      .catch(() => ({}));

    Promise.all([
      fetch('http://localhost:4000/api/booking/spa-services').then((res) => {
        if (!res.ok) throw new Error('Không thể kết nối API dịch vụ');
        return res.json();
      }),
      reviewStatsPromise,
    ])
      .then(([resData, reviewStats]) => {
        if (!isMounted) return;

        // Bóc tách mọi cấu trúc JSON trả về (hỗ trợ cả findAndCountAll lẫn mảng thuần)
        let rawList = [];
        const payload = resData?.data !== undefined ? resData.data : resData;

        if (Array.isArray(payload)) {
          rawList = payload;
        } else if (Array.isArray(payload?.rows)) {
          rawList = payload.rows;
        } else if (Array.isArray(payload?.services)) {
          rawList = payload.services;
        } else if (Array.isArray(payload?.spaServices)) {
          rawList = payload.spaServices;
        } else if (Array.isArray(resData?.services)) {
          rawList = resData.services;
        }

        const normalized = rawList.map((item) => {
          // Ưu tiên danh mục admin đã chọn; chỉ đoán theo tên khi dữ liệu cũ chưa có danh mục chuẩn
          let cat = 'basic';
          const textToMatch = `${item.category || ''} ${item.name || item.service_name || ''}`.toLowerCase();
          const knownCategory = CATEGORIES.find((c) => c.label === item.category);

          if (knownCategory) cat = knownCategory.id;
          else if (textToMatch.includes('mụn') || textToMatch.includes('acne')) cat = 'acne';
          else if (textToMatch.includes('nám') || textToMatch.includes('tàn nhang') || textToMatch.includes('melasma')) cat = 'melasma';
          else if (textToMatch.includes('trẻ hóa') || textToMatch.includes('laser') || textToMatch.includes('rejuvenation') || textToMatch.includes('toning')) cat = 'rejuvenation';
          else if (textToMatch.includes('phục hồi') || textToMatch.includes('recovery')) cat = 'recovery';
          return {
            id: item.id,
            name: item.name || item.service_name || 'Dịch vụ Spa',
            category: cat,
            categoryLabel: item.category || 'Chăm sóc da',
            duration: Number(item.duration_minutes) || 60,
            price: Number(item.price) || 0,
            image: item.image_url || item.image || item.thumbnail || null,
            description: item.description || '',
            rating: reviewStats[item.id] ? reviewStats[item.id].total / reviewStats[item.id].count : null,
            reviewCount: reviewStats[item.id]?.count || 0,
          };
        });

        setServices(normalized);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Lỗi nạp dịch vụ:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredServices = useMemo(() => {
    return services
      .filter((s) => {
        if (selectedCategory === 'all') return true;
        return s.category === selectedCategory;
      })
      .filter((s) => {
        if (priceFilter === 'under-500') return s.price < 500000;
        if (priceFilter === '500-1000') return s.price >= 500000 && s.price <= 1000000;
        if (priceFilter === 'above-1000') return s.price > 1000000;
        return true;
      })
      .sort((a, b) => {
        if (sortOrder === 'price-asc') return a.price - b.price;
        if (sortOrder === 'price-desc') return b.price - a.price;
        return 0;
      });
  }, [services, selectedCategory, priceFilter, sortOrder]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Dịch vụ chăm sóc da</h1>
        <p className="text-base-content/60 mt-1">Chọn dịch vụ phù hợp với tình trạng da của bạn.</p>
      </div>

      {/* Tabs danh mục */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`btn btn-sm rounded-full ${
              selectedCategory === c.id ? 'btn-primary' : 'btn-outline btn-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Bộ lọc giá & Sắp xếp */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={priceFilter}
          onChange={(e) => setPriceFilter(e.target.value)}
          className="select select-bordered select-sm rounded-lg"
        >
          <option value="all">Mọi mức giá</option>
          <option value="under-500">Dưới 500.000 đ</option>
          <option value="500-1000">500.000 đ - 1.000.000 đ</option>
          <option value="above-1000">Trên 1.000.000 đ</option>
        </select>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="select select-bordered select-sm rounded-lg"
        >
          <option value="default">Mặc định</option>
          <option value="price-asc">Giá tăng dần</option>
          <option value="price-desc">Giá giảm dần</option>
        </select>
      </div>

      {/* Danh sách thẻ dịch vụ */}
      {filteredServices.length === 0 ? (
        <div className="text-center py-16 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Không tìm thấy dịch vụ nào phù hợp với bộ lọc.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-300 border border-base-200 overflow-hidden flex flex-col justify-between"
            >
              {/* Ảnh đại diện */}
              <figure className="relative h-48 w-full bg-base-200 overflow-hidden">
                {service.image ? (
                  <img
                    src={service.image}
                    alt={service.name}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10 text-primary">
                    <Sparkles className="w-10 h-10 mb-1 opacity-60" />
                    <span className="text-xs font-medium">GlowSkin Spa</span>
                  </div>
                )}
                <span className="absolute top-3 left-3 badge badge-primary badge-sm shadow">
                  {service.categoryLabel}
                </span>
              </figure>

              {/* Thông tin chi tiết */}
              <div className="card-body p-5 flex flex-col justify-between flex-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      {service.duration} phút
                    </span>
                    {service.rating !== null ? (
                      <span className="flex items-center gap-1 text-amber-500 font-semibold">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {service.rating.toFixed(1)} ({service.reviewCount})
                      </span>
                    ) : (
                      <span className="text-base-content/40">Chưa có đánh giá</span>
                    )}
                  </div>

                  <h3 className="card-title text-base font-bold text-secondary line-clamp-1 hover:text-primary transition-colors">
                    {service.name}
                  </h3>

                  <p className="text-xs text-base-content/70 line-clamp-2">
                    {service.description || 'Dịch vụ chăm sóc da chuyên sâu tại GlowSkin Clinic.'}
                  </p>
                </div>

                <div className="pt-4 mt-2 border-t border-base-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-base-content/60 block">Chi phí</span>
                    <span className="text-base font-extrabold text-primary">
                      {service.price.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailId(service.id)}
                    className="btn btn-sm btn-outline btn-primary rounded-lg"
                  >
                    Chi tiết
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Popup chi tiết dịch vụ: xem ngay trên trang, đóng lại vẫn ở vị trí cũ trong danh sách */}
      {detailId && (
        <div className="modal modal-open" role="dialog" aria-modal="true">
          <div className="modal-box max-w-5xl max-h-[90vh] p-0 relative">
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 bg-base-100/80"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-6 overflow-y-auto max-h-[90vh]">
              <ServiceDetail id={detailId} onSelectService={setDetailId} />
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDetailId(null)}></div>
        </div>
      )}
    </div>
  );
}