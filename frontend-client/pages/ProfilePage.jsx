import React, { useState } from 'react';
import { User, ShieldCheck, Save } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function ProfilePage() {
  const { user, updateProfile } = useAuthStore();
  const [formData, setFormData] = useState({ full_name: user?.full_name || '', phone: user?.phone || '' });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Cài Đặt Hồ Sơ</h1>
      <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><User className="text-primary"/> Thông tin cá nhân</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="label text-xs font-bold">Họ và tên:</label><input type="text" className="input input-bordered w-full" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} /></div>
          <div><label className="label text-xs font-bold">Số điện thoại:</label><input type="text" className="input input-bordered w-full" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
        </div>
        <button className="btn btn-primary mt-4"><Save className="w-4 h-4 mr-2"/> Lưu thông tin</button>
      </div>

      <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><ShieldCheck className="text-secondary"/> Người giám hộ</h2>
        <p className="text-sm opacity-70">Chức năng quản lý người bảo trợ y tế (Đang phát triển).</p>
      </div>
    </div>
  );
}