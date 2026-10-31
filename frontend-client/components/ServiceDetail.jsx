import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Sparkles, Star, ListOrdered, UserCheck, ShieldAlert, CalendarCheck, Stethoscope } from 'lucide-react';

const API = 'http://localhost:4000/api/booking';
const formatPrice = (price) => `${Number(price || 0).toLocaleString('vi-VN')} đ`;

const Stars = ({ value, size = 'w-4 h-4' }) => (
  <div className="flex items-center text-amber-400">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-current' : 'text-slate-300'}`} />
    ))}
  </div>
);

// Một khối nội dung dạng danh sách; danh sách rỗng thì không hiển thị
function DetailSection({ icon: Icon, title, items, ordered = false }) {
  if (!items?.length) return null;
  return (
    <div className="card bg-base-100 border border-base-200 p-6 space-y-3">
      <h2 className="text-lg font-bold text-secondary flex items-center gap-2">
        <Icon className="w-5 h-5 text-primary" /> {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-3">
            {ordered ? (
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
            ) : (
              <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            )}
            <span className="text-base-content/80">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Nội dung chi tiết 1 dịch vụ, dùng trong popup ở trang Dịch vụ và trang /services/:id.
// onSelectService: có thì bấm "dịch vụ cùng nhóm" sẽ đổi nội dung tại chỗ (popup) thay vì chuyển trang.
export default function ServiceDetail({ id, onSelectService }) {
  const [service, setService] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [related, setRelated] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let isMounted = true;
    setStatus('loading');

    Promise.all([
      fetch(`${API}/spa-services/${id}`),
      fetch(`${API}/reviews/services?service_id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch(`${API}/spa-services`).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ])
      .then(async ([serviceRes, reviewData, listData]) => {
        if (!isMounted) return;
        if (serviceRes.status === 404) return setStatus('notfound');
        if (!serviceRes.ok) throw new Error(serviceRes.status);
        const data = (await serviceRes.json()).data;
        setService(data);
        setReviews(reviewData.data || []);
        setRelated((listData.data || []).filter((s) => s.id !== data.id && s.category === data.category).slice(0, 3));
        setStatus('ok');
      })
      .catch((err) => {
        console.error('Lỗi tải chi tiết dịch vụ:', err);
        if (isMounted) setStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (status !== 'ok') {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-base-content/60">
          {status === 'notfound' ? 'Dịch vụ này không tồn tại hoặc đã ngừng cung cấp.' : 'Không tải được thông tin dịch vụ, vui lòng thử lại sau.'}
        </p>
        {!onSelectService && <Link to="/services" className="btn btn-primary btn-sm">Quay lại danh sách dịch vụ</Link>}
      </div>
    );
  }

  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + Number(r.rating), 0) / reviews.length : 0;

  return (
    <div className="space-y-6">
      {/* Thông tin chính */}
      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-2xl overflow-hidden bg-primary/10 min-h-64 max-h-96 flex items-center justify-center">
          {service.image_url ? (
            <img src={service.image_url} alt={service.name} className="w-full h-full object-cover" />
          ) : (
            <Sparkles className="w-16 h-16 text-primary/50" />
          )}
        </div>

        <div className="space-y-4">
          {service.category && <span className="badge badge-primary badge-outline">{service.category}</span>}
          <h1 className="text-3xl font-bold text-secondary">{service.name}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {service.duration_minutes} phút / buổi</span>
            {reviews.length > 0 ? (
              <button
                type="button"
                onClick={() => document.getElementById(`danh-gia-${service.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-1 hover:text-primary"
              >
                <Star className="w-4 h-4 fill-warning text-warning" /> {avgRating.toFixed(1)} ({reviews.length} đánh giá)
              </button>
            ) : (
              <span className="flex items-center gap-1"><Star className="w-4 h-4" /> Chưa có đánh giá</span>
            )}
          </div>

          <p className="text-3xl font-bold text-primary">{formatPrice(service.price)}</p>
          {service.description && <p className="text-base-content/80 leading-relaxed">{service.description}</p>}

          {/* Dịch vụ được bác sĩ chỉ định sau buổi khám, khách đặt lịch khám trước */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
            <p className="text-sm text-base-content/80 flex gap-2">
              <Stethoscope className="w-5 h-5 text-primary shrink-0" />
              Dịch vụ được bác sĩ da liễu chỉ định sau khi thăm khám để đảm bảo phù hợp với tình trạng da của bạn.
            </p>
            <Link to="/booking" className="btn btn-primary rounded-full gap-2">
              <CalendarCheck className="w-4 h-4" /> Đặt lịch khám & tư vấn
            </Link>
          </div>
        </div>
      </div>

      {/* Nội dung chi tiết (chỉ hiện mục có dữ liệu) */}
      <div className="grid gap-6 md:grid-cols-2">
        <DetailSection icon={Check} title="Dịch vụ bao gồm" items={service.includes} />
        <DetailSection icon={UserCheck} title="Phù hợp với" items={service.suitable_for} />
        <DetailSection icon={ListOrdered} title="Quy trình thực hiện" items={service.procedure_steps} ordered />
        <DetailSection icon={ShieldAlert} title="Chăm sóc sau điều trị" items={service.aftercare} />
      </div>

      {/* Đánh giá thật của khách đã dùng dịch vụ */}
      <div id={`danh-gia-${service.id}`} className="card bg-base-100 border border-base-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-secondary">Đánh giá từ khách hàng</h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-secondary">{avgRating.toFixed(1)}</span>
              <Stars value={avgRating} />
              <span className="text-sm text-base-content/60">({reviews.length})</span>
            </div>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-sm text-base-content/60">
            Chưa có đánh giá. Khách đã hoàn thành buổi dịch vụ có thể đánh giá trong Sổ lịch khám.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.slice(0, 5).map((r) => (
              <div key={r.id} className="border-b border-base-200 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{r.customer_name}</span>
                  <Stars value={r.rating} />
                </div>
                {r.comment && <p className="text-sm text-base-content/80 mt-1 whitespace-pre-line">{r.comment}</p>}
                <span className="text-xs text-base-content/50">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
              </div>
            ))}
            {reviews.length > 5 && (
              <Link to="/reviews?tab=service" className="link link-primary text-sm">Xem tất cả đánh giá dịch vụ</Link>
            )}
          </div>
        )}
      </div>

      {/* Dịch vụ cùng danh mục */}
      {related.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-secondary">Dịch vụ cùng nhóm {service.category}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((s) => {
              const content = (
                <>
                  {s.image_url && <img src={s.image_url} alt={s.name} className="w-full h-24 object-cover rounded-lg mb-2" />}
                  <span className="font-semibold text-secondary line-clamp-2">{s.name}</span>
                  <span className="text-primary font-bold mt-2">{formatPrice(s.price)}</span>
                </>
              );
              const cardClass = 'card bg-base-100 border border-base-200 p-4 hover:shadow-md transition-shadow text-left';
              return onSelectService ? (
                <button key={s.id} type="button" onClick={() => onSelectService(s.id)} className={cardClass}>{content}</button>
              ) : (
                <Link key={s.id} to={`/services/${s.id}`} className={cardClass}>{content}</Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
