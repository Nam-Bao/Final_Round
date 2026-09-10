import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Sparkles, Calendar, ClipboardList, ShoppingBag, User, LogOut } from 'lucide-react';

export default function ClientNavbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="navbar bg-base-100 shadow-sm sticky top-0 z-50 px-4">
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost normal-case text-xl font-bold text-primary">
          <Sparkles className="w-5 h-5 mr-1" /> GlowSkin O2O
        </Link>
      </div>
      <div className="flex-none gap-2">
        <ul className="menu menu-horizontal px-1 hidden md:flex font-medium">
          <li><Link to="/">Sàng lọc AI</Link></li>
          <li><Link to="/booking">Đặt lịch</Link></li>
          {user && (
            <>
              <li><Link to="/appointments">Lịch khám</Link></li>
              <li><Link to="/treatments">Gói liệu trình</Link></li>
              <li><Link to="/orders">Đơn hàng</Link></li>
            </>
          )}
        </ul>

        {user ? (
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-circle avatar border border-primary">
              <div className="w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                {user.full_name ? user.full_name.charAt(0) : 'U'}
              </div>
            </label>
            <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52 border border-base-200">
              <li><Link to="/profile"><User className="w-4 h-4" /> Hồ sơ cá nhân</Link></li>
              <li><button onClick={handleLogout} className="text-error"><LogOut className="w-4 h-4" /> Đăng xuất</button></li>
            </ul>
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm ml-2">Đăng nhập</Link>
        )}
      </div>
    </div>
  );
}