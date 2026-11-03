import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AdminLoginPage from './pages/AdminLoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminLayout from './components/AdminLayout';
import UsersPage from './pages/UsersPage';
import InventoryPage from './pages/InventoryPage';
import MaterialsPage from './pages/MaterialsPage';
import RevenueReportPage from './pages/RevenueReportPage';
import PackagesPage from './pages/PackagesPage';
import WorkSchedulePage from './pages/WorkSchedulePage';
import MySchedulePage from './pages/MySchedulePage';
import DoctorWorkspacePage from './pages/DoctorWorkspacePage';
import ConsultantWorkspacePage from './pages/ConsultantWorkspacePage';
import TechnicianWorkspacePage from './pages/TechnicianWorkspacePage';
import SaleOrderManagement from './pages/SaleOrderManagement';
import ReturnManagementPage from './pages/ReturnManagementPage';
import SpaServicesPage from './pages/SpaServicesPage';
import PromotionsPage from './pages/PromotionsPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import AppointmentManagementPage from './pages/AppointmentManagementPage';
import ConsultantCheckoutPage from './pages/ConsultantCheckoutPage';
import ContentManagementPage from './pages/ContentManagementPage';
import MyArticlesPage from './pages/MyArticlesPage';
import ConsultationManagementPage from './pages/ConsultationManagementPage';
import ExpertWorkspacePage from './pages/ExpertWorkspacePage';
import MyAttendancePage from './pages/MyAttendancePage';
import AttendanceManagementPage from './pages/AttendanceManagementPage';
import AttendanceKioskPage from './pages/AttendanceKioskPage';
import SalaryRatesPage from './pages/SalaryRatesPage';
import PayrollPage from './pages/PayrollPage';
import MyPayslipPage from './pages/MyPayslipPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        {/* Máy chấm công tại quầy: toàn màn hình, không cần đăng nhập nhân viên */}
        <Route path="/kiosk" element={<AttendanceKioskPage />} />
        
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/appointments" element={<div>Giao diện Lịch hẹn sẽ nằm ở đây</div>} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/reports" element={<RevenueReportPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/schedule" element={<WorkSchedulePage />} />
          <Route path="/my-schedule" element={<MySchedulePage />} />
          <Route path="/workspace" element={<DoctorWorkspacePage />} />
          <Route path="/consultant-workspace" element={<ConsultantWorkspacePage />} />
          <Route path="/technician-workspace" element={<TechnicianWorkspacePage />} />
          <Route path="/sales-management" element={<SaleOrderManagement />} />
          <Route path="/returns" element={<ReturnManagementPage />} />
          <Route path="/spa-services" element={<SpaServicesPage />} />
          <Route path="/promotions" element={<PromotionsPage />} />
          <Route path="/customer-profiles" element={<CustomerProfilePage />} />
          <Route path="/appointment-management" element={<AppointmentManagementPage />} />
          <Route path="/consultant-checkout" element={<ConsultantCheckoutPage />} />
          <Route path="/content" element={<ContentManagementPage />} />
          <Route path="/page-info" element={<Navigate to="/content" replace />} />
          <Route path="/my-articles" element={<MyArticlesPage />} />
          <Route path="/consultations" element={<ConsultationManagementPage />} />
          <Route path="/expert-workspace" element={<ExpertWorkspacePage />} />
          <Route path="/attendance" element={<MyAttendancePage />} />
          <Route path="/attendance-management" element={<AttendanceManagementPage />} />
          <Route path="/salary-rates" element={<SalaryRatesPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/my-payslip" element={<MyPayslipPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;