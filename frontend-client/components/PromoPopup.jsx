import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';

const API = 'http://localhost:4000/api/media/pages/popups';
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
  const buttonClass = 'btn btn-primary text-white rounded-full w-full';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-fade-in-up" onClick={close} role="dialog" aria-modal="true" aria-label={current.title || 'Khuyến mãi'}>
      <div className="relative bg-white rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Đóng" className="btn btn-circle btn-sm absolute top-3 right-3 bg-white/90 border-0 shadow z-10">
          <X className="w-4 h-4" />
        </button>
        {current.image_url && (
          current.link_url && !current.title && !current.content
            ? (external
              ? <a href={current.link_url} target="_blank" rel="noopener noreferrer" onClick={close}><img src={current.image_url} alt="Khuyến mãi" className="w-full max-h-[70vh] object-cover" /></a>
              : <Link to={current.link_url} onClick={close}><img src={current.image_url} alt="Khuyến mãi" className="w-full max-h-[70vh] object-cover" /></Link>)
            : <img src={current.image_url} alt={current.title || 'Khuyến mãi'} className="w-full max-h-[50vh] object-cover" />
        )}
        {(current.title || current.content || current.link_url) && (current.title || current.content || !current.image_url) && (
          <div className="p-6 text-center space-y-3">
            {current.title && <h3 className="text-xl font-bold text-secondary">{current.title}</h3>}
            {current.content && <p className="text-sm text-base-content/70 whitespace-pre-line leading-relaxed">{current.content}</p>}
            {current.link_url && (external
              ? <a href={current.link_url} target="_blank" rel="noopener noreferrer" className={buttonClass} onClick={close}>{current.button_text || 'Xem ngay'}</a>
              : <Link to={current.link_url} className={buttonClass} onClick={close}>{current.button_text || 'Xem ngay'}</Link>)}
          </div>
        )}
      </div>
    </div>
  );
}
