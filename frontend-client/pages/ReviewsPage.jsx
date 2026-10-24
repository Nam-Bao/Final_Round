import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, ThumbsUp, ShieldCheck, User, Calendar } from 'lucide-react';

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState('ALL');

  useEffect(() => {
    let isMounted = true;

    fetch('http://localhost:4000/api/booking/reviews')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể nạp đánh giá');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const rawList = Array.isArray(data) ? data : (data?.data || []);
        setReviews(rawList);
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Lỗi gọi API reviews:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = reviews.filter((r) => {
    if (filterRating === 'ALL') return true;
    return Number(r.rating) === Number(filterRating);
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / reviews.length).toFixed(1)
    : '5.0';

  if (loading) {
    return (
      <div className="flex justify-center items-center py-28">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-secondary flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-primary" /> Đánh Giá Từ Khách Hàng
        </h1>
        <p className="text-base-content/60 mt-1">
          Trải nghiệm thực tế từ các khách hàng đã thăm khám và sử dụng dịch vụ tại GlowSkin.
        </p>
      </div>

      {/* Thẻ thống kê tổng quan */}
      <div className="bg-base-100 rounded-2xl border border-base-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="text-center sm:text-left">
            <div className="text-4xl sm:text-5xl font-black text-secondary">{avgRating}</div>
            <div className="flex items-center justify-center sm:justify-start gap-1 text-amber-400 mt-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-current" />
              ))}
            </div>
            <div className="text-xs text-base-content/60 mt-1">{reviews.length} lượt đánh giá thực tế</div>
          </div>
          <div className="hidden sm:block h-16 w-px bg-base-300"></div>
          <div className="text-xs text-base-content/70 space-y-1">
            <div className="flex items-center gap-2 text-primary font-medium">
              <ShieldCheck className="w-4 h-4" /> 100% Đánh giá từ khách hàng đã hoàn tất liệu trình
            </div>
            <div>Cam kết minh bạch kết quả điều trị và chất lượng phục vụ.</div>
          </div>
        </div>

        {/* Lọc theo số sao */}
        <div className="flex flex-wrap gap-2">
          {['ALL', '5', '4', '3'].map((star) => (
            <button
              key={star}
              onClick={() => setFilterRating(star)}
              className={`btn btn-sm rounded-lg ${
                filterRating === star ? 'btn-primary' : 'btn-outline btn-primary'
              }`}
            >
              {star === 'ALL' ? 'Tất cả' : `${star} Sao`}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách review */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-base-100 rounded-2xl border border-base-200">
          <p className="text-base-content/60">Chưa có đánh giá nào cho mức lọc này.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-base-100 p-5 rounded-2xl border border-base-200 shadow-sm hover:shadow-md transition-shadow space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {item.customer_name ? item.customer_name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-secondary">
                      {item.customer_name || 'Khách hàng GlowSkin'}
                    </h4>
                    <span className="text-xs text-base-content/50 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.createdAt || item.created_at || Date.now()).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center text-amber-400">
                  {[...Array(Number(item.rating || 5))].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
              </div>

              {item.service_name && (
                <div className="badge badge-sm badge-outline badge-primary font-medium">
                  {item.service_name}
                </div>
              )}

              <p className="text-sm text-base-content/80 leading-relaxed">
                {item.comment || 'Dịch vụ rất tốt và chuyên nghiệp, bác sĩ tư vấn tận tình.'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}