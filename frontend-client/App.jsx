import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import các trang vừa tạo (Đường dẫn phẳng trực tiếp)
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

function App() {
  return (
    <BrowserRouter>
      {/* Bạn có thể đặt Navbar chung ở đây sau này */}
      <Routes>
        {/* Trang chủ tạm thời */}
        <Route path="/" element={
          <div className="flex h-screen items-center justify-center text-2xl font-bold">
            Trang Chủ O2O Khách Hàng (Đang xây dựng)
          </div>
        } />
        
        {/* Các tuyến đường xác thực */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;