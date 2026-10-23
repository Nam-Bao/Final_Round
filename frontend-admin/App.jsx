import { BrowserRouter, Routes, Route } from 'react-router-dom';

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
import SpaServicesPage from './pages/SpaServicesPage';
import PromotionsPage from './pages/PromotionsPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import AppointmentManagementPage from './pages/AppointmentManagementPage';
import ConsultantCheckoutPage from './pages/ConsultantCheckoutPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
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
          <Route path="/spa-services" element={<SpaServicesPage />} />
          <Route path="/promotions" element={<PromotionsPage />} />
          <Route path="/customer-profiles" element={<CustomerProfilePage />} />
          <Route path="/appointment-management" element={<AppointmentManagementPage />} />
          <Route path="/consultant-checkout" element={<ConsultantCheckoutPage />} />
          <Route path="/page-info" element={<div className="p-4 text-xl font-bold">Trang Quản lý Thông tin hệ thống</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;