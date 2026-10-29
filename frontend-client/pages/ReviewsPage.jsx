import React, { useState, useEffect, useMemo } from 'react';
import { Star, MessageSquare, ShieldCheck, User, Calendar, Stethoscope } from 'lucide-react';

// Tên bác sĩ trong hồ sơ có thể đã kèm "BS." — chỉ thêm khi chưa có
const doctorTitle = (name) => (/^(BS|Bác sĩ)/i.test(name || '') ? name : `BS. ${name}`);

const Stars = ({ value, size = 'w-4 h-4' }) => (
  <div className="flex items-center text-amber-400">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-current' : 'text-slate-300'}`} />
    ))}
  </div>
);

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState('ALL');
  const [filterDoctor, setFilterDoctor] = useState('ALL');

  useEffect(() => {
    let isMounted = true;

    // Chỉ gồm đánh giá của khách đã hoàn tất buổi khám (server kiểm tra khi tạo)
    fetch('http://localhost:4000/api/booking/reviews')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể nạp đánh giá');
        return res.json();
      })
      .then((data) => {
        if (isMounted) setReviews(data?.data || []);
      })
      .catch((err) => console.warn('Lỗi gọi API reviews:', err))
      .finally(() => isMounted && setLoading(false));

    return () => {
      isMounted = false;
    };
  }, []);

  // Danh sách bác sĩ có đánh giá, kèm điểm trung bình thật
  const doctorStats = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      if (!r.doctor_id) return;
      map[r.doctor_id] ??= { id: r.doctor_id, name: r.doctor_name || 'Bác sĩ', total: 0, count: 0 };
      map[r.doctor_id].total += Number(r.rating);
      map[r.doctor_id].count += 1;
    });
    return Object.values(map).map((d) => ({ ...d, avg: d.total / d.count })).sort((a, b) => b.count - a.count);
  }, [reviews]);

  const scoped = filterDoctor === 'ALL' ? reviews : reviews.filter((r) => r.doctor_id === filterDoctor);
  const filtered = filterRating === 'ALL' ? scoped : scoped.filter((r) => Number(r.rating) === Number(filterRating));
  const avgRating = scoped.length > 0 ? scoped.reduce((sum, r) => sum + Number(r.rating), 0) / scoped.length : 0;
  const countByStar = (star) => scoped.filter((r) => Number(r.rating) === star).length;

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
          <MessageSquare className="w-7 h-7 text-primary" /> Đánh Giá Bác Sĩ Từ Khách Hàng
        </h1>
        <p className="text-base-content/60 mt-1">
          Trải nghiệm thực tế từ các khách hàng đã hoàn tất buổi khám tại GlowSkin.
        </p>
      </div>

      {/* Thẻ thống kê tổng quan */}
      <div className="bg-base-100 rounded-2xl border border-base-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="text-center sm:text-left">
            <div className="text-4xl sm:text-5xl font-black text-secondary">{scoped.length ? avgRating.toFixed(1) : '—'}</div>
            <div className="mt-1"><Stars value={avgRating} /></div>
            <div className="text-xs text-base-content/60 mt-1">{scoped.length} lượt đánh giá</div>
          </div>
          <div className="hidden sm:block h-16 w-px bg-base-300"></div>
          <div className="text-xs text-base-content/70 space-y-1">
            <div className="flex items-center gap-2 text-primary font-medium">
              <ShieldCheck className="w-4 h-4" /> Chỉ khách đã hoàn tất buổi khám mới được đánh giá
            </div>
            <div>Mỗi buổi khám được đánh giá một lần, tên khách hàng được ẩn bớt để bảo mật.</div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <select className="select select-sm select-bordered" value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)}>
            <option value="ALL">Tất cả bác sĩ</option>
            {doctorStats.map((d) => (
              <option key={d.id} value={d.id}>{doctorTitle(d.name)} — {d.avg.toFixed(1)}★ ({d.count})</option>
            ))}
          </select>
          {/* Lọc theo số sao */}
          <div className="flex flex-wrap gap-2">
            {['ALL', 5, 4, 3, 2, 1].map((star) => (
              <button
                key={star}
                onClick={() => setFilterRating(String(star))}
                className={`btn btn-sm rounded-lg ${filterRating === String(star) ? 'btn-primary' : 'btn-outline btn-primary'}`}
              >
                {star === 'ALL' ? 'Tất cả' : `${star} Sao (${countByStar(star)})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Danh sách review */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-base-100 rounded-2xl border border-base-200">
          <p className="text-base-content/60">
            {reviews.length === 0 ? 'Chưa có đánh giá nào. Hãy là người đầu tiên sau buổi khám của bạn!' : 'Chưa có đánh giá nào cho mức lọc này.'}
          </p>
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
                    <h4 className="font-bold text-sm text-secondary">{item.customer_name}</h4>
                    <span className="text-xs text-base-content/50 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>
                <Stars value={item.rating} />
              </div>

              {item.doctor_name && (
                <div className="badge badge-sm badge-outline badge-primary font-medium gap-1">
                  <Stethoscope className="w-3 h-3" /> {doctorTitle(item.doctor_name)}
                </div>
              )}

              {item.comment ? (
                <p className="text-sm text-base-content/80 leading-relaxed whitespace-pre-line">{item.comment}</p>
              ) : (
                <p className="text-sm text-base-content/40 italic">Khách hàng không để lại nhận xét.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
