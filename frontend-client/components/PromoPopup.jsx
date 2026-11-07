import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { trackClick } from '../utils/trackClick';

const API = '/api/media/pages/popups';
const HIDDEN_PATHS = ['/login', '/register', '/payment']; // không làm phiền khi đang đăng nhập / thanh toán

// Khóa theo id + lần sửa cuối: quản lý sửa popup thì khách sẽ thấy lại bản mới
const storageKey = (p) => `glowskin_popup_${p.id}_${new Date(p.updatedAt).getTime()}`;
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD theo giờ máy khách

const alreadySeen = (p) => {
  const key = storageKey(p);
  if (p.frequency === 'SESSION') return !!sessionStorage.getItem(key);
  if (p.frequency === 'ONCE') return !!localStorage.getItem(key);
  return localStorage.getItem(key) === today(); // DAILY
};
const markSeen = (p) => {
  const key = storageKey(p);
  if (p.frequency === 'SESSION') sessionStorage.setItem(key, '1');
  else localStorage.setItem(key, p.frequency === 'ONCE' ? '1' : today());
};

const matchesPage = (p, path) => !p.pages?.length
  || p.pages.some((page) => (page === '/' ? path === '/' : path === page || path.startsWith(`${page}/`)));

// Popup quảng cáo do quản lý cấu hình: mỗi trang hiện tối đa 1 popup (ưu tiên cao nhất), theo tần suất đã chọn
export default function PromoPopup() {
  const { pathname } = useLocation();
  const [popups, setPopups] = useState([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    fetch(API)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setPopups(json.data || []))
      .catch(() => setPopups([]));
  }, []);

  useEffect(() => {
    setCurrent(null);
    if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return undefined;
    const popup = popups.find((p) => matchesPage(p, pathname) && !alreadySeen(p));
    if (!popup) return undefined;
    const timer = setTimeout(() => {
      setCurrent(popup);
      markSeen(popup);
    }, (popup.delay_seconds || 0) * 1000);
    return () => clearTimeout(timer);
  }, [pathname, popups]);

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e) => e.key === 'Escape' && setCurrent(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;
  const close = () => setCurrent(null);
  const external = current.link_url && !current.link_url.startsWith('/');
  const hasText = !!(current.title || current.content);
  const hasImage = !!current.image_url;
  // Liên kết trong web dùng Link, web ngoài mở tab mới
  const clickLink = () => { trackClick('popups', current.id); close(); };
  const ToLink = ({ className, children, label }) => (external
    ? <a href={current.link_url} target="_blank" rel="noopener noreferrer" className={className} onClick={clickLink} aria-label={label}>{children}</a>
    : <Link to={current.link_url} className={className} onClick={clickLink} aria-label={label}>{children}</Link>);

  // Máy tính (sm trở lên): popup vuông cạnh ~560px, ảnh phủ kín, chữ nằm trên nền trắng mờ ở phần dưới.
  // Điện thoại: ảnh vuông ở trên, chữ bên dưới cho dễ đọc.
  const image = hasImage && (
    <img src={current.image_url} alt={current.title || 'Khuyến mãi'}
      className="w-full aspect-square object-cover sm:absolute sm:inset-0 sm:h-full sm:aspect-auto" />
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in-up" onClick={close} role="dialog" aria-modal="true" aria-label={current.title || 'Khuyến mãi'}>
      <div className="relative bg-white rounded-3xl overflow-hidden shadow-2xl w-full max-w-sm sm:max-w-none sm:w-[min(560px,85vh)] sm:aspect-square"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Đóng" className="btn btn-circle btn-sm absolute top-3 right-3 bg-white/90 border-0 shadow z-10">
          <X className="w-4 h-4" />
        </button>

        {/* Chỉ có ảnh (đã thiết kế sẵn chữ): bấm cả ảnh để mở liên kết */}
        {hasImage && !hasText && current.link_url ? <ToLink label="Xem khuyến mãi">{image}</ToLink> : image}

        {(hasText || (!hasImage && current.link_url)) && (
          <div className={`p-6 text-center space-y-3 ${hasImage
            ? 'sm:absolute sm:inset-x-0 sm:bottom-0 sm:px-10 sm:pb-8 sm:pt-20 sm:bg-gradient-to-t sm:from-white sm:via-white/95 sm:to-white/0'
            : 'sm:h-full sm:flex sm:flex-col sm:justify-center sm:px-12'}`}>
            {current.title && <h3 className="text-xl sm:text-2xl font-bold text-secondary">{current.title}</h3>}
            {current.content && <p className="text-sm sm:text-base text-base-content/70 whitespace-pre-line leading-relaxed">{current.content}</p>}
            {current.link_url && (
              <ToLink className="btn btn-primary text-white rounded-full w-full sm:max-w-xs sm:mx-auto sm:flex">{current.button_text || 'Xem ngay'}</ToLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
