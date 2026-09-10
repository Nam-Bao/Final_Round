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
      await new Promise(resolve => setTimeout(resolve, 500)); // Giả lập mạng

      // 1. Kéo thông tin từ bộ nhớ tạm (nơi lưu user bạn đã đăng ký)
      const savedUserStr = localStorage.getItem('mockRegisteredUser');
      
      // Nếu chưa từng đăng ký tài khoản nào trên trình duyệt này
      if (!savedUserStr) {
        throw new Error('Không tìm thấy tài khoản. Vui lòng đăng ký trước!');
      }

      const savedUser = JSON.parse(savedUserStr);

      // 2. Kiểm tra xem email và mật khẩu có khớp với lúc đăng ký không
      if (savedUser.email !== email || savedUser.password !== password) {
        throw new Error('Email hoặc mật khẩu không chính xác!');
      }

      // 3. Nếu đúng hoàn toàn, khởi tạo dữ liệu đăng nhập thật
      const finalUser = { 
        full_name: savedUser.full_name, 
        phone: savedUser.phone,
        email: savedUser.email, 
        role: 'CUSTOMER' 
      };

      const fakeToken = 'day_la_token_gia_lap_xyz123';
      
      // 4. Lưu trạng thái đăng nhập vào Zustand
      login(finalUser, fakeToken); 
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