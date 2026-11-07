import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  CalendarCheck, CalendarDays, ChevronDown, ClipboardList, LogIn, LogOut, Menu, MessageCircle, Package, Phone, Scan, Search, Sparkles, User, X,
} from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import { HOTLINE, HOTLINE_DISPLAY, WORKING_HOURS, ZALO_URL } from '../utils/contact';

const NAV_GROUPS = [
  {
    title: 'Về GlowSkin',
    links: [
      ['/gioi-thieu', 'Giới thiệu phòng khám'],
      ['/doi-ngu-bac-si', 'Đội ngũ bác sĩ'],
      ['/reviews', 'Đánh giá khách hàng'],
      ['/contact', 'Liên hệ'],
      ['/chinh-sach', 'Chính sách & Quy định'],
    ],
  },
  {
    title: 'Dịch vụ',
    links: [
      ['/services', 'Dịch vụ trị liệu'],
      ['/goi-lieu-trinh', 'Gói lộ trình trị liệu'],
    ],
  },
  { title: 'Mỹ phẩm', to: '/shops' },
  {
    title: 'Đặt lịch',
    links: [
      ['/booking', 'Đặt lịch khám (trực tiếp / online)'],
      ['/tu-van', 'Đặt lịch tư vấn chuyên gia'],
    ],
  },
  { title: 'Sàng lọc AI', to: '/sang-loc-da' },
  {
    title: 'Ưu đãi & Tin tức',
    links: [
      ['/promotions', 'Khuyến mãi'],
      ['/news', 'Tin tức'],
    ],
  },
];

const ACCOUNT_LINKS = [
  ['/profile', 'Hồ sơ cá nhân', User],
  ['/appointments', 'Sổ lịch khám', CalendarDays],
  ['/treatments', 'Gói liệu trình của tôi', ClipboardList],
  ['/orders', 'Đơn hàng mỹ phẩm', Package],
];

function Logo({ short = false }) {
  return (
    <Link to="/" className="flex items-center gap-2 font-extrabold text-lg text-secondary tracking-tight shrink-0" aria-label="GlowSkin trang chủ">
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-teal-500 text-white flex items-center justify-center shadow-sm">
        <Sparkles className="w-5 h-5" />
      </span>
      <span>GlowSkin{!short && <span className="text-primary"> O2O</span>}</span>
    </Link>
  );
}

const ROW_CLASS = 'flex items-center gap-3 min-h-11 px-3 rounded-xl text-[15px] text-base-content/80 active:bg-base-200';

// Nhóm menu xổ xuống trong menu trượt
function MenuGroup({ title, open, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className={`${ROW_CLASS} w-full justify-between font-semibold text-secondary`}>
        {title}
        <ChevronDown className={`w-5 h-5 text-base-content/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="ml-3 pl-2 border-l-2 border-base-200 animate-fade-in">{children}</div>}
    </div>
  );
}

// Menu trượt cho điện thoại và máy tính bảng
function MobileMenu({ user, onClose, onLogout }) {
  const { pathname } = useLocation();
  // Mở sẵn nhóm chứa trang đang xem, mỗi lần chỉ mở 1 nhóm cho gọn
  const [openGroup, setOpenGroup] = useState(() => (
    ACCOUNT_LINKS.some(([to]) => to === pathname) ? 'account' : NAV_GROUPS.find((g) => g.links?.some(([to]) => to === pathname))?.title
  ));
  const toggle = (name) => setOpenGroup((current) => (current === name ? null : name));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 w-[86%] max-w-sm bg-base-100 flex flex-col shadow-2xl animate-slide-in-left">
        <div className="flex items-center justify-between px-4 h-16 border-b border-base-200 shrink-0">
          <Logo short />
          <button onClick={onClose} className="btn btn-ghost btn-circle" aria-label="Đóng menu"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-4">
          {user ? (
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-1">
              <MenuGroup title={<span className="truncate">Xin chào, {user.full_name || 'bạn'}</span>} open={openGroup === 'account'} onToggle={() => toggle('account')}>
                {ACCOUNT_LINKS.map(([to, label, Icon]) => (
                  <Link key={to} to={to} className={ROW_CLASS}><Icon className="w-5 h-5 text-primary" /> {label}</Link>
                ))}
              </MenuGroup>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login" className="btn btn-primary gap-2"><LogIn className="w-4 h-4" /> Đăng nhập</Link>
              <Link to="/register" className="btn btn-outline btn-primary">Đăng ký</Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Link to="/booking" className="rounded-2xl bg-primary text-primary-content p-3 min-h-20 flex flex-col justify-between">
              <CalendarCheck className="w-5 h-5" /><span className="font-semibold text-sm">Đặt lịch khám</span>
            </Link>
            <Link to="/sang-loc-da" className="rounded-2xl bg-accent/20 text-secondary p-3 min-h-20 flex flex-col justify-between">
              <Scan className="w-5 h-5" /><span className="font-semibold text-sm">Soi da bằng AI</span>
            </Link>
          </div>

          <nav aria-label="Menu chính" className="space-y-1">
            {NAV_GROUPS.map((group) => (group.to ? (
              <Link key={group.title} to={group.to} className={`${ROW_CLASS} font-semibold text-secondary`}>{group.title}</Link>
            ) : (
              <MenuGroup key={group.title} title={group.title} open={openGroup === group.title} onToggle={() => toggle(group.title)}>
                {group.links.map(([to, label]) => <Link key={to} to={to} className={ROW_CLASS}>{label}</Link>)}
              </MenuGroup>
            )))}
          </nav>
        </div>

        <div className="border-t border-base-200 p-3 space-y-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${HOTLINE}`} className="btn btn-outline btn-primary gap-1.5 px-2 flex-nowrap whitespace-nowrap"><Phone className="w-4 h-4 shrink-0" /> {HOTLINE_DISPLAY}</a>
            <a href={ZALO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-primary gap-1.5 px-2 flex-nowrap whitespace-nowrap"><MessageCircle className="w-4 h-4 shrink-0" /> Chat Zalo</a>
          </div>
          <p className="text-xs text-center text-base-content/60">{WORKING_HOURS}</p>
          {user && <button onClick={onLogout} className="btn btn-ghost btn-block text-error gap-2"><LogOut className="w-4 h-4" /> Đăng xuất</button>}
        </div>
      </aside>
    </div>
  );
}

function DesktopLink({ to, children }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-base-content/80 hover:text-primary hover:bg-primary/5'}`}>
      {children}
    </NavLink>
  );
}

export default function ClientNavbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-base-100/90 backdrop-blur border-b border-base-200">
        <div className="max-w-7xl mx-auto h-16 px-3 sm:px-4 flex items-center gap-2 min-w-0">
          <button onClick={() => setMenuOpen(true)} className="btn btn-ghost btn-circle lg:hidden -ml-1" aria-label="Mở menu">
            <Menu className="w-6 h-6" />
          </button>
          <Logo />

          <nav className="hidden lg:flex items-center ml-4" aria-label="Menu chính">
            {NAV_GROUPS.map((group) => (group.to ? <DesktopLink key={group.to} to={group.to}>{group.title}</DesktopLink> : (
              <div key={group.title} className="dropdown dropdown-hover">
                <div tabIndex={0} role="button" className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-base-content/80 hover:text-primary hover:bg-primary/5 cursor-pointer">
                  {group.title} <ChevronDown className="w-3.5 h-3.5" />
                </div>
                <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-64 border border-base-200">
                  {group.links.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
                </ul>
              </div>
            )))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            {/* Ô gợi ý trên màn hình rộng, nút mở trang tìm kiếm ở màn hình nhỏ hơn */}
            <div className="hidden xl:block"><GlobalSearch /></div>
            <Link to="/tim-kiem" className="btn btn-ghost btn-circle xl:hidden" aria-label="Tìm kiếm"><Search className="w-5 h-5" /></Link>

            {user ? (
              <div className="dropdown dropdown-end hidden lg:block">
                <div tabIndex={0} role="button" aria-label="Tài khoản" className="btn btn-ghost btn-circle">
                  <span className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                    {user.full_name ? user.full_name.charAt(0) : 'U'}
                  </span>
                </div>
                <ul tabIndex={0} className="mt-2 z-[1] p-2 shadow-lg menu dropdown-content bg-base-100 rounded-box w-60 border border-base-200">
                  {ACCOUNT_LINKS.map(([to, label, Icon]) => <li key={to}><Link to={to}><Icon className="w-4 h-4" /> {label}</Link></li>)}
                  <li><button onClick={handleLogout} className="text-error"><LogOut className="w-4 h-4" /> Đăng xuất</button></li>
                </ul>
              </div>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm ml-1 hidden sm:inline-flex">Đăng nhập</Link>
            )}
          </div>
        </div>
      </header>

      {menuOpen && <MobileMenu user={user} onClose={() => setMenuOpen(false)} onLogout={handleLogout} />}
    </>
  );
}
