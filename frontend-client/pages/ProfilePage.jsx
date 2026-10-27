import React, { useState, useEffect } from 'react';
import { User, Save, Users, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  
  const [accountData, setAccountData] = useState({ 
    full_name: '', phone: '', dob: '', gender: 'OTHER'
  });

  const [patientProfiles, setPatientProfiles] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState(null); // Quản lý ID đang sửa
  const [patientForm, setPatientForm] = useState({
    full_name: '', relationship: 'Người thân', phone: '', dob: '', gender: 'OTHER'
  });

  // FIX LỖI 1: Bắt sự kiện khi state 'user' thay đổi thì mới đắp data vào form
  useEffect(() => {
    if (user && user.Profile) {
      setAccountData({
        full_name: user.Profile.full_name || user.full_name || '',
        phone: user.Profile.phone || user.phone || '',
        dob: user.Profile.dob || '',
        gender: user.Profile.gender || 'OTHER'
      });
    }
  }, [user]);

  useEffect(() => {
    loadAccount();
    fetchPatientProfiles();
  }, []);

  // Chuẩn hóa dữ liệu gửi lên: ngày sinh / SĐT để trống thì gửi null (không gửi chuỗi rỗng)
  const toPayload = (form) => ({
    ...form,
    dob: form.dob || null,
    phone: form.phone || null
  });

  // Tải thông tin tài khoản mới nhất từ server để đổ vào form
  const loadAccount = async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('customer_token');
      const res = await fetch('http://localhost:4000/api/identity/profile/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const u = await res.json(); // API /profile/me trả thẳng object user
      setAccountData({
        full_name: u.Profile?.full_name || '',
        phone: u.Profile?.phone || '',
        dob: u.Profile?.dob || '',
        gender: u.Profile?.gender || 'OTHER'
      });
      if (updateUser) updateUser({ ...(user || {}), ...u });
    } catch (error) { console.error(error); }
  };

  const fetchPatientProfiles = async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('customer_token');
      const res = await fetch('http://localhost:4000/api/identity/profile/patients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) setPatientProfiles(result.data);
    } catch (error) { console.error(error); }
  };

  const handleSaveAccount = async () => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('customer_token');
      const res = await fetch('http://localhost:4000/api/identity/profile/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(toPayload(accountData))
      });

      if (res.ok) {
        alert('Cập nhật thông tin tài khoản thành công!');
        loadAccount(); // Tải lại thông tin tài khoản và đồng bộ vào store
        fetchPatientProfiles(); // Tải lại bảng bên dưới để thấy "Bản thân" được update
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Lỗi: ${errorData.message || 'Không thể cập nhật tài khoản'}`);
      }
    } catch (error) { console.error(error); }
  };

  // Mở modal Thêm mới
  const openCreateModal = () => {
    setEditingPatientId(null);
    setPatientForm({ full_name: '', relationship: 'Người thân', phone: '', dob: '', gender: 'OTHER' });
    setIsModalOpen(true);
  };

  // Mở modal Sửa thông tin
  const openEditModal = (profile) => {
    setEditingPatientId(profile.id);
    setPatientForm({
      full_name: profile.full_name, relationship: profile.relationship,
      phone: profile.phone || '', dob: profile.dob || '', gender: profile.gender || 'OTHER'
    });
    setIsModalOpen(true);
  };

  // Lưu hồ sơ (Gộp cả Thêm và Sửa)
  const handleSavePatient = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('customer_token');
      const url = editingPatientId 
        ? `http://localhost:4000/api/identity/profile/patients/${editingPatientId}` 
        : 'http://localhost:4000/api/identity/profile/patients';
        
      const method = editingPatientId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(toPayload(patientForm))
      });
      
      if (res.ok) {
        alert(editingPatientId ? 'Cập nhật thành công!' : 'Thêm hồ sơ thành công!');
        setIsModalOpen(false);
        fetchPatientProfiles(); 
      } else {
        const errorData = await res.json();
        alert(`Lỗi: ${errorData.message}`);
      }
    } catch (error) { console.error(error); }
  };

  // Hàm xóa hồ sơ
  const handleDeletePatient = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hồ sơ này không?')) return;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('customer_token');
      const res = await fetch(`http://localhost:4000/api/identity/profile/patients/${editingPatientId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Xóa thành công!');
        setIsModalOpen(false);
        fetchPatientProfiles();
      } else {
        const err = await res.json();
        alert(err.message);
      }
    } catch (error) { console.error(error); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Cài Đặt Hồ Sơ</h1>
      
      {/* THÔNG TIN TÀI KHOẢN CHÍNH */}
      <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <User className="text-primary"/> Thông tin tài khoản
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="label text-xs font-bold">Họ và tên:</label>
            <input type="text" className="input input-bordered w-full" value={accountData.full_name} onChange={e => setAccountData({...accountData, full_name: e.target.value})} />
          </div>
          <div>
            <label className="label text-xs font-bold">Số điện thoại:</label>
            <input type="text" className="input input-bordered w-full" value={accountData.phone} onChange={e => setAccountData({...accountData, phone: e.target.value})} />
          </div>
          <div>
            <label className="label text-xs font-bold">Ngày sinh:</label>
            <input type="date" className="input input-bordered w-full" value={accountData.dob} onChange={e => setAccountData({...accountData, dob: e.target.value})} />
          </div>
          <div>
            <label className="label text-xs font-bold">Giới tính:</label>
            <select className="select select-bordered w-full" value={accountData.gender} onChange={e => setAccountData({...accountData, gender: e.target.value})}>
              <option value="MALE">Nam</option>
              <option value="FEMALE">Nữ</option>
              <option value="OTHER">Khác</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button className="btn btn-primary" onClick={handleSaveAccount}>
            <Save className="w-4 h-4 mr-2"/> Lưu thông tin
          </button>
        </div>
      </div>

      {/* DANH SÁCH HỒ SƠ KHÁM BỆNH */}
      <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="text-secondary"/> Danh sách Hồ sơ khám bệnh
          </h2>
          <button className="btn btn-secondary btn-sm" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-1"/> Thêm hồ sơ
          </button>
        </div>
        
        <div className="overflow-x-auto border rounded-lg">
          <table className="table w-full table-zebra">
            <thead>
              <tr className="bg-base-200">
                <th>Họ tên</th>
                <th>Quan hệ</th>
                <th>Số điện thoại</th>
                <th>Ngày sinh</th>
                <th>Giới tính</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {patientProfiles.length > 0 ? (
                patientProfiles.map(profile => (
                  <tr key={profile.id} className="hover cursor-pointer" onClick={() => openEditModal(profile)}>
                    <td className="font-semibold text-primary">{profile.full_name}</td>
                    <td><span className={`badge ${profile.relationship === 'Bản thân' ? 'badge-primary' : 'badge-ghost'}`}>{profile.relationship}</span></td>
                    <td>{profile.phone || '-'}</td>
                    <td>{profile.dob || '-'}</td>
                    <td>{profile.gender === 'MALE' ? 'Nam' : profile.gender === 'FEMALE' ? 'Nữ' : 'Khác'}</td>
                    <td className="text-xs text-gray-400 italic">Nhấn để sửa</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="text-center opacity-50 py-4">Chưa có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL THÊM / SỬA HỒ SƠ */}
      {isModalOpen && (
        <div className="modal modal-open bg-black/40">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg mb-4">
              {editingPatientId ? 'Cập nhật hồ sơ' : 'Thêm hồ sơ khám bệnh mới'}
            </h3>
            <form onSubmit={handleSavePatient} className="space-y-4">
              
              <div className="form-control">
                <label className="label"><span className="label-text font-semibold">Họ và tên (*)</span></label>
                <input type="text" required className="input input-bordered w-full" value={patientForm.full_name} onChange={e => setPatientForm({...patientForm, full_name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label"><span className="label-text font-semibold">Mối quan hệ (*)</span></label>
                  <select 
                    className="select select-bordered w-full" 
                    value={patientForm.relationship} 
                    onChange={e => setPatientForm({...patientForm, relationship: e.target.value})}
                    disabled={patientForm.relationship === 'Bản thân'} // Không cho phép đổi chữ Bản thân
                  >
                    <option value="Bản thân">Bản thân</option>
                    <option value="Con cái">Con cái</option>
                    <option value="Bố/Mẹ">Bố/Mẹ</option>
                    <option value="Vợ/Chồng">Vợ/Chồng</option>
                    <option value="Anh/Chị/Em">Anh/Chị/Em</option>
                    <option value="Người thân">Người thân khác</option>
                  </select>
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text font-semibold">Số điện thoại</span></label>
                  <input type="text" className="input input-bordered w-full" value={patientForm.phone} onChange={e => setPatientForm({...patientForm, phone: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label"><span className="label-text font-semibold">Ngày sinh</span></label>
                  <input type="date" className="input input-bordered w-full" value={patientForm.dob} onChange={e => setPatientForm({...patientForm, dob: e.target.value})} />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text font-semibold">Giới tính</span></label>
                  <select className="select select-bordered w-full" value={patientForm.gender} onChange={e => setPatientForm({...patientForm, gender: e.target.value})}>
                    <option value="MALE">Nam</option>
                    <option value="FEMALE">Nữ</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
              </div>

              <div className="modal-action mt-6 flex justify-between">
                <div>
                  {editingPatientId && patientForm.relationship !== 'Bản thân' && (
                    <button type="button" className="btn btn-error btn-outline" onClick={handleDeletePatient}>
                      <Trash2 className="w-4 h-4 mr-1"/> Xóa
                    </button>
                  )}
                </div>
                <div>
                  <button type="button" className="btn btn-ghost mr-2" onClick={() => setIsModalOpen(false)}>Hủy</button>
                  <button type="submit" className="btn btn-primary">Lưu</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}