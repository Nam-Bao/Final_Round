import React, { useState } from 'react';
import { Layout, Menu, Button, theme, Dropdown, Space, Avatar, Modal, Descriptions, Tag } from 'antd';
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
  DollarOutlined,
  TagsOutlined, 
  PercentageOutlined,
  DownOutlined
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/login');
  };

// 1. Đọc và parse dữ liệu an toàn, chống crash ứng dụng
  let currentUser = { role: 'GUEST' }; // Giá trị mặc định an toàn
  try {
    const userStr = localStorage.getItem('admin_token') ? localStorage.getItem('admin_user') : null;
    if (userStr && userStr !== "undefined") {
      currentUser = JSON.parse(userStr);
    }
  } catch (error) {
    console.error("Lỗi đọc dữ liệu người dùng:", error);
  }

  // 2. Trích xuất biến dữ liệu chuẩn xác theo Schema DB (Bảng User & Profile)
  // Ưu tiên lấy trong object Profile lồng nhau, nếu backend đã làm phẳng (flatten) thì lấy trực tiếp
  const email = currentUser.email || 'Chưa có email';
  const role = currentUser.role || 'GUEST';
  const fullName = currentUser.Profile?.full_name || currentUser.full_name || 'Chưa cập nhật tên';
  const phone = currentUser.Profile?.phone || currentUser.phone || 'Chưa cập nhật số ĐT';
  const avatarUrl = currentUser.Profile?.avatar || currentUser.avatar || null;

  const userMenuItems = [
    {
      key: 'profile',
      label: 'Thông tin cá nhân',
      icon: <UserOutlined />,
      onClick: () => setIsProfileModalVisible(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      label: 'Đăng xuất',
      icon: <LogoutOutlined />,
      danger: true,
      onClick: handleLogout,
    },
  ];

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
    ...(role === 'ADMIN' ? [
      { key: '/users', icon: <UserOutlined />, label: 'Quản lý Người dùng' },
      { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' },      
      { key: '/page-info', icon: <GlobalOutlined />, label: 'Thông tin Trang' }
    ] : []),
    ...(['GEN_MANAGER'].includes(role) ? [
      { key: '/schedule', icon: <ScheduleOutlined />, label: 'Lịch Làm Việc' },
      { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' },
      { key: '/spa-services', icon: <TagsOutlined />, label: 'Dịch vụ Spa lẻ' },
      { key: '/promotions', icon: <PercentageOutlined />, label: 'Mã Khuyến mãi' },
      { key: '/packages', icon: <AppstoreAddOutlined />, label: 'Gói Lộ Trình' },
    ] : []),
    ...(['DOCTOR'].includes(role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/workspace', icon: <TeamOutlined />, label: 'Không Gian Khám Bệnh' },
    ] : []),
    ...(['CONSULTANT'].includes(role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/consultant-workspace', icon: <SolutionOutlined />, label: 'Không Gian Tư Vấn' },
    ] : []),
    ...(['SALES'].includes(role) ? [
      { key: '/sales-workspace', icon: <DollarOutlined />, label: 'Bàn Bán Hàng & Vận Hành' },
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
    ] : []),
    ...(['TECHNICIAN'].includes(role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/technician-workspace', icon: <PlayCircleOutlined />, label: 'Không Gian Kỹ Thuật' },
    ] : []),
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
          selectedKeys={[location.pathname]}
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
          
          <div className="flex items-center">
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
              <Space className="cursor-pointer hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">
                {/* Áp dụng biến avatar nếu có, nếu không dùng icon User mặc định */}
                <Avatar src={avatarUrl} icon={!avatarUrl && <UserOutlined />} className="bg-blue-500" />
                <span className="font-medium text-gray-700">
                  Xin chào, <span className="text-blue-600">{fullName}</span>
                </span>
                <DownOutlined className="text-xs text-gray-400" />
              </Space>
            </Dropdown>
          </div>
        </Header>
        
        <Content className="m-6 p-6 min-h-[280px]" style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}>
          <Outlet />
        </Content>
      </Layout>

      <Modal
        title="Thông tin tài khoản"
        open={isProfileModalVisible}
        onCancel={() => setIsProfileModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setIsProfileModalVisible(false)}>
            Đóng
          </Button>
        ]}
      >
        <div className="flex flex-col items-center mb-6 mt-4">
          <Avatar size={80} src={avatarUrl} icon={!avatarUrl && <UserOutlined />} className="bg-blue-500 mb-4" />
          <h3 className="text-xl font-bold text-gray-800 m-0">{fullName}</h3>
          <span className="text-gray-500 mt-1">{role}</span>
        </div>

        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Họ và tên">{fullName}</Descriptions.Item>
          <Descriptions.Item label="Email">{email}</Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">{phone}</Descriptions.Item>
          <Descriptions.Item label="Quyền hạn"><Tag color="blue">{role}</Tag></Descriptions.Item>
        </Descriptions>
      </Modal>

    </Layout>
  );
}