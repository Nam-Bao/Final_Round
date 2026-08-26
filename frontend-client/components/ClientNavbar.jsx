import React from 'react'

export default function ClientNavbar() {
  return (
    <div className="navbar bg-base-100 shadow-sm sticky top-0 z-50">
      <div className="flex-1">
        <a className="btn btn-ghost normal-case text-xl font-bold text-primary">GlowSkin O2O</a>
      </div>
      <div className="flex-none gap-2">
        <ul className="menu menu-horizontal px-1 hidden md:flex">
          <li><a>Dịch vụ</a></li>
          <li><a>Sản phẩm</a></li>
          <li><a>Về chúng tôi</a></li>
        </ul>
        <div className="dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-circle avatar border border-primary">
            <div className="w-10 rounded-full">
              <img src="https://i.pravatar.cc/150?img=47" alt="User" />
            </div>
          </label>
        </div>
      </div>
    </div>
  )
}