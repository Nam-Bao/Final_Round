import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import trang Admin Login
import AdminLoginPage from './pages/AdminLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminLayout from './components/AdminLayout';
import UsersPage from './pages/UsersPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Cổng đăng nhập cho nhân viên */}
        <Route path="/login" element={<AdminLoginPage />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
          
          {/* Sau này bạn làm trang Quản lý User thì nhét vào đây */}
          <Route path="/users" element={<UsersPage />} />
          <Route path="/appointments" element={<div>Giao diện Lịch hẹn sẽ nằm ở đây</div>} />
          <Route path="/inventory" element={<div>Giao diện Kho sẽ nằm ở đây</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;