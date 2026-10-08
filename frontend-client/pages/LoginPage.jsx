import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Gọi API Đăng nhập thật xuống Backend
      const response = await fetch('http://localhost:4000/api/identity/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Email hoặc mật khẩu không chính xác!');
      }

      // Lấy dữ liệu thật từ Database (đã đính kèm Profile mà chúng ta vừa sửa ở các bước trước)
      const finalUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        full_name: data.user.Profile?.full_name || 'Khách hàng',
        phone: data.user.Profile?.phone || ''
      };
      
      // Lưu trạng thái đăng nhập vào Zustand với Token xịn từ Backend
      login(finalUser, data.token); 
      navigate('/'); 
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold justify-center mb-4">Đăng Nhập</h2>
          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-control mb-2">
              <label className="label"><span className="label-text">Email</span></label>
              <input type="email" className="input input-bordered" required 
                onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-control mb-4">
              <label className="label"><span className="label-text">Mật khẩu</span></label>
              <input type="password" className="input input-bordered" required 
                onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary w-full">Đăng Nhập</button>
          </form>
          <p className="text-center text-sm mt-4">
            Chưa có tài khoản? <Link to="/register" className="text-primary hover:underline">Đăng ký ngay</Link>
          </p>
        </div>
      </div>
    </div>
  );
}