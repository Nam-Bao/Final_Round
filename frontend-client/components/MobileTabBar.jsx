import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { CalendarCheck, Home, Scan, ShoppingBag, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// Các trang tập trung vào 1 việc thì ẩn thanh tab cho đỡ rối
const HIDDEN_PATHS = ['/login', '/register', '/payment'];

// Thanh tab cố định dưới đáy màn hình cho điện thoại và máy tính bảng
export default function MobileTabBar() {
  const { pathname } = useLocation();
  const user = useAuthStore((state) => state.user);
  if (HIDDEN_PATHS.some((path) => pathname.startsWith(path))) return null;

  const tabs = [
    { to: '/', label: 'Trang chủ', icon: Home, end: true },
    { to: '/shops', label: 'Mỹ phẩm', icon: ShoppingBag },
    { to: '/booking', label: 'Đặt lịch', icon: CalendarCheck, main: true },
    { to: '/sang-loc-da', label: 'Soi da AI', icon: Scan },
    { to: user ? '/profile' : '/login', label: user ? 'Tài khoản' : 'Đăng nhập', icon: User },
  ];

  return (
    <nav aria-label="Lối tắt" className="fixed inset-x-0 bottom-0 z-40 lg:hidden bg-base-100/95 backdrop-blur border-t border-base-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5 max-w-xl mx-auto">
        {tabs.map(({ to, label, icon: Icon, end, main }) => (
          <li key={label}>
            <NavLink to={to} end={end} className={({ isActive }) => `h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-base-content/60'}`}>
              {({ isActive }) => (
                <>
                  {main
                    ? <span className="w-11 h-11 -mt-6 rounded-full bg-primary text-primary-content flex items-center justify-center shadow-lg shadow-primary/30 ring-4 ring-base-100"><Icon className="w-5 h-5" /></span>
                    : <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />}
                  <span className="truncate max-w-full px-1">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
