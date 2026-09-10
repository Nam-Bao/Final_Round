import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterPage() {
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Giả lập mạng chờ 0.8 giây
      
      // Lưu thông tin người dùng vừa nhập vào LocalStorage
      localStorage.setItem('mockRegisteredUser', JSON.stringify(formData));
      
      alert('Đăng ký thành công! Vui lòng đăng nhập.');
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Đã có lỗi xảy ra');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold justify-center mb-4">Đăng Ký O2O</h2>
          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-control mb-2">
              <label className="label"><span className="label-text">Họ và Tên</span></label>
              <input type="text" className="input input-bordered" required 
                onChange={e => setFormData({...formData, full_name: e.target.value})} />
            </div>
            <div className="form-control mb-2">
              <label className="label"><span className="label-text">Email</span></label>
              <input type="email" className="input input-bordered" required 
                onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="form-control mb-2">
              <label className="label"><span className="label-text">Số điện thoại</span></label>
              <input type="tel" className="input input-bordered" required 
                onChange={e => setFormData({...formData, phone: e.target.value})} />
            </div>
            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Mật khẩu</span></label>
              <input type="password" className="input input-bordered" required 
                onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <button type="submit" className="btn btn-primary w-full">Đăng Ký</button>
          </form>
          <p className="text-center text-sm mt-4">
            Đã có tài khoản? <Link to="/login" className="text-primary hover:underline">Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  );
}