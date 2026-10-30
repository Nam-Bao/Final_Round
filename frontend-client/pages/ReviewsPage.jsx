import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Star, MessageSquare, ShieldCheck, User, Calendar, Stethoscope, Sparkles, ShoppingBag } from 'lucide-react';

// Tên bác sĩ trong hồ sơ có thể đã kèm "BS." — chỉ thêm khi chưa có
const doctorTitle = (name) => (/^(BS|Bác sĩ)/i.test(name || '') ? name : `BS. ${name}`);

// Mỗi tab là một nguồn đánh giá thật, server chỉ cho tạo khi khách đã thực sự dùng dịch vụ / nhận hàng
const TABS = {
  doctor: {
    label: 'Bác sĩ',
    icon: Stethoscope,
    url: 'http://localhost:4000/api/booking/reviews',
    subjectKey: 'doctor_id',
    subjectName: (r) => (r.doctor_name ? doctorTitle(r.doctor_name) : null),
    allLabel: 'Tất cả bác sĩ',
    rule: 'Chỉ khách đã hoàn tất buổi khám mới được đánh giá',
    detail: 'Mỗi buổi khám được đánh giá một lần.',
    empty: 'Chưa có đánh giá bác sĩ nào. Hãy là người đầu tiên sau buổi khám của bạn!',
  },
  service: {
    label: 'Dịch vụ & Liệu trình',
    icon: Sparkles,
    url: 'http://localhost:4000/api/booking/reviews/services',
    subjectKey: 'service_id',
    subjectName: (r) => r.service_name,
    allLabel: 'Tất cả dịch vụ',
    rule: 'Chỉ khách đã hoàn thành buổi dịch vụ mới được đánh giá',
    detail: 'Mỗi buổi dịch vụ / buổi liệu trình được đánh giá một lần.',
    empty: 'Chưa có đánh giá dịch vụ nào. Bạn có thể đánh giá trong Sổ lịch khám sau khi hoàn thành buổi dịch vụ.',
  },
  product: {
    label: 'Mỹ phẩm',
    icon: ShoppingBag,
    url: 'http://localhost:4000/api/commerce/reviews',
    subjectKey: 'product_id',
    subjectName: (r) => r.product_name,
    allLabel: 'Tất cả sản phẩm',
    rule: 'Chỉ khách đã nhận hàng mới được đánh giá',
    detail: 'Mỗi sản phẩm trong một đơn hàng được đánh giá một lần.',
    empty: 'Chưa có đánh giá mỹ phẩm nào. Bạn có thể đánh giá trong Đơn hàng Mỹ phẩm sau khi nhận hàng.',
  },
};

const Stars = ({ value, size = 'w-4 h-4' }) => (
  <div className="flex items-center text-amber-400">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-current' : 'text-slate-300'}`} />
    ))}
  </div>
);

export default function ReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS[searchParams.get('tab')] ? searchParams.get('tab') : 'doctor';
  const config = TABS[tab];

  const [reviewsByTab, setReviewsByTab] = useState({ doctor: [], service: [], product: [] });
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState('ALL');
  // ?doctor=<id> (từ trang Đội ngũ bác sĩ) lọc sẵn đánh giá của bác sĩ đó
  const [filterSubject, setFilterSubject] = useState(tab === 'doctor' && searchParams.get('doctor') ? searchParams.get('doctor') : 'ALL');

  useEffect(() => {
    let isMounted = true;

    Promise.all(
      Object.entries(TABS).map(([key, t]) =>
        fetch(t.url)
          .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
          .then((data) => [key, data?.data || []])
          .catch((err) => {
            console.warn(`Lỗi nạp đánh giá ${key}:`, err);
            return [key, []];
          })
      )
    ).then((entries) => {
      if (!isMounted) return;
      setReviewsByTab(Object.fromEntries(entries));
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const switchTab = (key) => {
    setSearchParams(key === 'doctor' ? {} : { tab: key });
    setFilterRating('ALL');
    setFilterSubject('ALL');
  };

  const reviews = reviewsByTab[tab];

  // Danh sách bác sĩ / dịch vụ / sản phẩm có đánh giá, kèm điểm trung bình thật
  const subjectStats = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      const id = r[config.subjectKey];
      if (!id) return;
      map[id] ??= { id, name: config.subjectName(r) || 'Không rõ', total: 0, count: 0 };
      map[id].total += Number(r.rating);
      map[id].count += 1;
    });
    return Object.values(map).map((d) => ({ ...d, avg: d.total / d.count })).sort((a, b) => b.count - a.count);
  }, [reviews, config]);

  const scoped = filterSubject === 'ALL' ? reviews : reviews.filter((r) => r[config.subjectKey] === filterSubject);
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
          <MessageSquare className="w-7 h-7 text-primary" /> Đánh Giá Từ Khách Hàng
        </h1>
        <p className="text-base-content/60 mt-1">
          Trải nghiệm thực tế của khách hàng về bác sĩ, dịch vụ và dược mỹ phẩm tại GlowSkin.
        </p>
      </div>

      {/* Chọn loại đánh giá */}
      <div role="tablist" className="tabs tabs-boxed bg-base-100 border border-base-200 p-1 w-fit flex-wrap">
        {Object.entries(TABS).map(([key, t]) => {
          const Icon = t.icon;
          return (
            <button
              key={key}
              role="tab"
              onClick={() => switchTab(key)}
              className={`tab gap-2 font-medium ${tab === key ? 'tab-active' : ''}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
              <span className="badge badge-sm">{reviewsByTab[key].length}</span>
            </button>
          );
        })}
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
              <ShieldCheck className="w-4 h-4" /> {config.rule}
            </div>
            <div>{config.detail} Tên khách hàng được ẩn bớt để bảo mật.</div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <select className="select select-sm select-bordered" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="ALL">{config.allLabel}</option>
            {subjectStats.map((d) => (
              <option key={d.id} value={d.id}>{d.name} — {d.avg.toFixed(1)}★ ({d.count})</option>
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
            {reviews.length === 0 ? config.empty : 'Chưa có đánh giá nào cho mức lọc này.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const SubjectIcon = config.icon;
            const subject = config.subjectName(item);
            return (
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

                {subject && (
                  <div className="flex items-center gap-2">
                    {item.product_image && (
                      <img src={item.product_image} alt={subject} className="w-8 h-8 rounded object-cover border border-base-200" />
                    )}
                    <div className="badge badge-sm badge-outline badge-primary font-medium gap-1 h-auto py-0.5">
                      <SubjectIcon className="w-3 h-3" /> {subject}
                      {item.session_type === 'PACKAGE' && <span className="opacity-70">(liệu trình)</span>}
                    </div>
                  </div>
                )}

                {item.comment ? (
                  <p className="text-sm text-base-content/80 leading-relaxed whitespace-pre-line">{item.comment}</p>
                ) : (
                  <p className="text-sm text-base-content/40 italic">Khách hàng không để lại nhận xét.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
