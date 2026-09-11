import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import trang Admin Login
import AdminLoginPage from './pages/AdminLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminLayout from './components/AdminLayout';
import UsersPage from './pages/UsersPage';
import InventoryPage from './pages/InventoryPage';
import PackagesPage from './pages/PackagesPage';
import WorkSchedulePage from './pages/WorkSchedulePage';
import MySchedulePage from './pages/MySchedulePage';
import DoctorWorkspacePage from './pages/DoctorWorkspacePage';
import ConsultantWorkspacePage from './pages/ConsultantWorkspacePage';
import TechnicianWorkspacePage from './pages/TechnicianWorkspacePage';
import SalesWorkspacePage from './pages/SalesWorkspacePage';

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
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/schedule" element={<WorkSchedulePage />} />
          <Route path="/my-schedule" element={<MySchedulePage />} />
          <Route path="/workspace" element={<DoctorWorkspacePage />} />
          <Route path="/consultant-workspace" element={<ConsultantWorkspacePage />} />
          <Route path="/technician-workspace" element={<TechnicianWorkspacePage />} />
          <Route path="/sales-workspace" element={<SalesWorkspacePage />} />
          <Route path="/page-info" element={<div className="p-4 text-xl font-bold">Trang Quản lý Thông tin hệ thống (Đang phát triển)</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;