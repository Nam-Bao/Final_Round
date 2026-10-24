import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, Sparkles } from 'lucide-react';
import { formatPrice, formatDuration, getCategoryLabel } from '../data/mockServices';

export default function ServiceCard({ service }) {
  if (!service) return null;

  // Lấy link ảnh từ database (ưu tiên image_url, image hoặc fallback)
  const imageUrl = service.image_url || service.image || service.thumbnail_url;

  return (
    <div className="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-300 border border-base-200 overflow-hidden flex flex-col justify-between">
      {/* Khung ảnh đại diện */}
      <figure className="relative h-48 w-full bg-base-200 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={service.name}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            onError={(e) => {
              // Dự phòng khi link ảnh hỏng
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement.classList.add('flex', 'items-center', 'justify-center');
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10 text-primary">
            <Sparkles className="w-10 h-10 mb-1 opacity-60" />
            <span className="text-xs font-medium">GlowSkin Spa</span>
          </div>
        )}

        {/* Badge danh mục */}
        {service.category && (
          <span className="absolute top-3 left-3 badge badge-primary badge-sm shadow">
            {getCategoryLabel ? getCategoryLabel(service.category) : service.category}
          </span>
        )}
      </figure>

      {/* Thông tin dịch vụ */}
      <div className="card-body p-5 flex flex-col justify-between flex-1">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-base-content/60">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {service.duration ? `${service.duration} phút` : formatDuration?.(service.duration)}
            </span>
            <span className="flex items-center gap-1 text-amber-500 font-semibold">
              <Star className="w-3.5 h-3.5 fill-current" />
              {service.rating || '5.0'}
            </span>
          </div>

          <h3 className="card-title text-base font-bold text-secondary line-clamp-1 hover:text-primary transition-colors">
            {service.name}
          </h3>

          <p className="text-xs text-base-content/70 line-clamp-2">
            {service.description || 'Dịch vụ chăm sóc da chuyên sâu tại GlowSkin Clinic.'}
          </p>
        </div>

        {/* Giá & Nút hành động */}
        <div className="pt-4 mt-2 border-t border-base-200 flex items-center justify-between">
          <div>
            <span className="text-xs text-base-content/60 block">Chi phí</span>
            <span className="text-base font-extrabold text-primary">
              {formatPrice ? formatPrice(service.price) : `${Number(service.price).toLocaleString('vi-VN')} đ`}
            </span>
          </div>

          <Link
            to={`/services/${service.id}`}
            className="btn btn-sm btn-outline btn-primary rounded-lg"
          >
            Chi tiết
          </Link>
        </div>
      </div>
    </div>
  );
}