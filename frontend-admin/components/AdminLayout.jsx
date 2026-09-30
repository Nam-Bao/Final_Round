import React, { useState } from 'react';
import { Layout, Menu, Button, theme } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  UserOutlined,
  CalendarOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  TeamOutlined,   
  GlobalOutlined,
  AppstoreAddOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  PlayCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  // State quản lý việc thu/phóng menu bên trái
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // Xử lý khi click vào các mục menu
  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  // Xử lý Đăng xuất
  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/login');
  };
  // Lấy thông tin user từ LocalStorage để hiển thị tên
  const userStr = localStorage.getItem('admin_user');
  const currentUser = userStr ? JSON.parse(userStr) : { role: 'Nhân viên' };

  // Định nghĩa các mục trong Menu
  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
    // Nhóm chức năng ĐỘC QUYỀN của Admin
    ...(currentUser.role === 'ADMIN' ? [
      { key: '/users', icon: <UserOutlined />, label: 'Quản lý Người dùng' },
      { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' },      
      { key: '/page-info', icon: <GlobalOutlined />, label: 'Thông tin Trang' }
    ] : []),
    ...(['GEN_MANAGER'].includes(currentUser.role) ? [
      { key: '/packages', icon: <AppstoreAddOutlined />, label: 'Gói Lộ Trình (VIP)' },
      { key: '/schedule', icon: <ScheduleOutlined />, label: 'Lịch Làm Việc' },
      { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' }
    ] : []),
    // DÀNH CHO NHÂN VIÊN Y TẾ
    ...(['DOCTOR'].includes(currentUser.role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/workspace', icon: <TeamOutlined />, label: 'Không Gian Khám Bệnh' },
    ] : []),
    // DÀNH CHO TƯ VẤN VIÊN
    ...(['CONSULTANT'].includes(currentUser.role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/consultant-workspace', icon: <SolutionOutlined />, label: 'Không Gian Tư Vấn' },
    ] : []),
    // DÀNH CHO SALE
    ...(['SALES'].includes(currentUser.role) ? [
      { key: '/sales-workspace', icon: <DollarOutlined />, label: 'Bàn Bán Hàng & Vận Hành' },
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
    ] : []),
    // DÀNH CHO KỸ THUẬT VIÊN
    ...(['TECHNICIAN'].includes(currentUser.role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/technician-workspace', icon: <PlayCircleOutlined />, label: 'Không Gian Kỹ Thuật' },
    ] : []),
    // Nhóm chức năng chung
    { key: '/appointments', icon: <CalendarOutlined />, label: 'Lịch hẹn & Khám' },

  ];

  return (
    <Layout className="min-h-screen">
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light" className="shadow-md">
        <div className="h-16 flex items-center justify-center font-bold text-xl text-blue-600 border-b">
          {collapsed ? 'O2O' : 'O2O ADMIN'}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]} // Tự động highlight menu dựa trên URL hiện tại
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} className="flex justify-between items-center pr-6 shadow-sm z-10">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            className="w-16 h-16 text-lg"
          />
          <div className="flex items-center gap-4">
            <span className="font-medium text-gray-600">Xin chào, {currentUser.role}</span>
            <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
              Đăng xuất
            </Button>
          </div>
        </Header>
        
        {/* Vùng chứa nội dung của từng trang */}
        <Content className="m-6 p-6 min-h-[280px]" style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}>
          {/* <Outlet /> chính là "cái lỗ" để React Router nhét nội dung của các trang con vào đây */}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}