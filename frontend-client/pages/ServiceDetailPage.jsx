import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Sparkles, Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { SERVICES, formatPrice, formatDuration, getCategoryLabel } from '../data/mockServices';

export default function ServiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const service = SERVICES.find((s) => String(s.id) === id);

  // Dịch vụ đã gỡ hoặc không tồn tại
  if (!service) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-base-content/60">Dịch vụ này không tồn tại hoặc đã bị gỡ.</p>
        <Link to="/services" className="btn btn-primary btn-sm">Quay lại danh sách dịch vụ</Link>
      </div>
    );
  }

  const stopped = service.status === 'STOPPED';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/services" className="btn btn-ghost btn-sm gap-1">
        <ArrowLeft className="w-4 h-4" /> Danh sách dịch vụ
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-xl overflow-hidden bg-primary/10 min-h-64 flex items-center justify-center">
          {service.image ? (
            <img src={service.image} alt={service.name} className="w-full h-full object-cover" />
          ) : (
            <Sparkles className="w-16 h-16 text-primary/50" />
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="badge badge-primary badge-outline">{getCategoryLabel(service.category)}</span>
            {stopped && <span className="badge badge-neutral">Ngừng bán</span>}
          </div>

          <h1 className="text-3xl font-bold text-secondary">{service.name}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70">
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {formatDuration(service.duration)}</span>
            <Link to="/reviews" className="flex items-center gap-1 hover:text-primary">
              <Star className="w-4 h-4 fill-warning text-warning" />
              {service.rating} ({service.reviewCount} đánh giá)
            </Link>
          </div>

          <p className="text-3xl font-bold text-primary">{formatPrice(service.price)}</p>
          <p className="text-base-content/80">{service.description}</p>

          {/* UC05: nút Đặt lịch chỉ dành cho khách hàng đã đăng nhập; dịch vụ ngừng bán thì ẩn nút */}
          {!stopped && (
            user ? (
              <button
                className="btn btn-primary rounded-full px-8"
                onClick={() => navigate('/booking', { state: { serviceId: service.id } })}
              >
                Đặt lịch
              </button>
            ) : (
              <Link to="/login" className="btn btn-outline btn-primary rounded-full px-8">
                Đăng nhập để đặt lịch
              </Link>
            )
          )}
        </div>
      </div>

      {service.includes.length > 0 && (
        <div className="card bg-base-100 border border-base-200 p-6 space-y-3">
          <h2 className="text-lg font-bold">Dịch vụ bao gồm</h2>
          <ul className="space-y-2">
            {service.includes.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}