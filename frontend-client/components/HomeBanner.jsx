import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { trackClick } from '../utils/trackClick';

const API = '/api/media/pages/banners';

// Nút / ảnh banner dẫn tới trang trong web (Link) hoặc web ngoài (mở tab mới)
function BannerLink({ to, bannerId, className, children, label }) {
  if (!to) return <div className={className}>{children}</div>;
  const onClick = () => trackClick('banners', bannerId);
  return to.startsWith('/')
    ? <Link to={to} className={className} aria-label={label} onClick={onClick}>{children}</Link>
    : <a href={to} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} onClick={onClick}>{children}</a>;
}

// Banner trình chiếu do quản lý cấu hình. Chưa có banner đang chạy => hiện phần giới thiệu mặc định (fallback).
export default function HomeBanner({ fallback }) {
  const [banners, setBanners] = useState(null); // null: đang tải
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch(API)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setBanners(json.data || []))
      .catch(() => setBanners([]));
  }, []);

  const count = banners?.length || 0;
  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (banners === null) return <div className="rounded-3xl bg-base-200 animate-pulse aspect-[4/5] sm:aspect-[8/3]" />;
  if (!count) return fallback;

  // Ảnh điện thoại làm theo khung dọc 4:5; chưa banner nào có ảnh riêng thì dùng khung thấp hơn cho ảnh ngang đỡ bị cắt
  const mobileRatio = banners.some((b) => b.mobile_image_url) ? 'aspect-[4/5]' : 'aspect-[5/4]';

  const go = (step) => setIndex((i) => (i + step + count) % count);

  return (
    <section className="relative rounded-3xl overflow-hidden shadow-sm border border-base-200 group"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((b, i) => (
          <div key={b.id} className="relative w-full shrink-0" aria-hidden={i !== index}>
            {/* Cả ảnh bấm được khi không hiện chữ (ảnh đã có sẵn chữ / nút) */}
            <BannerLink to={b.show_text === false ? b.link_url : null} bannerId={b.id} label={b.title} className="block">
              <picture>
                {b.mobile_image_url && <source media="(max-width: 640px)" srcSet={b.mobile_image_url} />}
                <img src={b.image_url} alt={b.title} className={`w-full ${mobileRatio} sm:aspect-[8/3] object-cover`} loading={i === 0 ? 'eager' : 'lazy'} />
              </picture>
            </BannerLink>
            {b.show_text !== false ? (
              <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black/60 via-black/25 to-transparent flex items-end sm:items-center pointer-events-none">
                <div className="p-6 pb-10 sm:p-12 max-w-xl text-white space-y-3 pointer-events-auto">
                  <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight drop-shadow">{b.title}</h2>
                  {b.subtitle && <p className="text-sm sm:text-lg text-white/90 leading-relaxed">{b.subtitle}</p>}
                  {b.link_url && (
                    <BannerLink to={b.link_url} bannerId={b.id} className="btn btn-primary text-white rounded-full mt-2">{b.button_text || 'Xem ngay'}</BannerLink>
                  )}
                </div>
              </div>
            ) : b.link_url && (
              // Ảnh đã có sẵn chữ: chỉ đặt nút ở góc dưới bên trái
              <BannerLink to={b.link_url} bannerId={b.id} className="btn btn-primary text-white rounded-full shadow-lg absolute left-6 bottom-10 sm:left-12 sm:bottom-12">
                {b.button_text || 'Xem ngay'}
              </BannerLink>
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Banner trước"
            className="btn btn-circle btn-sm absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 border-0 opacity-0 group-hover:opacity-100 transition">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => go(1)} aria-label="Banner sau"
            className="btn btn-circle btn-sm absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 border-0 opacity-0 group-hover:opacity-100 transition">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {banners.map((b, i) => (
              <button key={b.id} onClick={() => setIndex(i)} aria-label={`Banner ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/60'}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
