import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import trang Admin Login
import AdminLoginPage from './pages/AdminLoginPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Cổng đăng nhập cho nhân viên */}
        <Route path="/login" element={<AdminLoginPage />} />
        
        {/* Trang Dashboard tạm thời (Sau này sẽ bọc bằng Layout) */}
        <Route path="/" element={
          <div className="flex h-screen items-center justify-center text-2xl font-bold text-blue-600">
            Dashboard Quản Trị (Đang xây dựng)
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;