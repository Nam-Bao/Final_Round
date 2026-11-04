import React, { useState, useEffect, useRef } from 'react';
import { Layout, Menu, Button, theme, Dropdown, Space, Avatar, Modal, Descriptions, Tag, Input, Popconfirm, message, Switch, Drawer, Grid } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, DashboardOutlined, UserOutlined, CalendarOutlined,
  LogoutOutlined, AppstoreOutlined, ExperimentOutlined, LineChartOutlined, TeamOutlined, GlobalOutlined, AppstoreAddOutlined,
  ScheduleOutlined, SolutionOutlined, PlayCircleOutlined, DollarOutlined, TagsOutlined, 
  PercentageOutlined, DownOutlined, UpOutlined, SendOutlined, MessageOutlined, RollbackOutlined, FileTextOutlined, FieldTimeOutlined, MenuOutlined, WalletOutlined, AccountBookOutlined,
  SettingOutlined, ShopOutlined, MedicineBoxOutlined, IdcardOutlined, CustomerServiceOutlined, ShoppingCartOutlined, VideoCameraOutlined
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false; // dưới 768px
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();

  const handleMenuClick = ({ key }) => navigate(key);
  const handleLogout = () => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    navigate('/login');
  };

  let currentUser = { role: 'GUEST' };
  try {
    const userStr = sessionStorage.getItem('admin_token') ? sessionStorage.getItem('admin_user') : null;
    if (userStr && userStr !== "undefined") currentUser = JSON.parse(userStr);
  } catch (error) { console.error(error); }

  const email = currentUser.email || 'Chưa có email';
  const role = currentUser.role || 'GUEST';
  const fullName = currentUser.Profile?.full_name || currentUser.full_name || 'Chưa cập nhật tên';
  const phone = currentUser.Profile?.phone || currentUser.phone || 'Chưa cập nhật số ĐT';
  const [avatarOverride, setAvatarOverride] = useState(undefined); // ảnh vừa tải lên trong phiên này
  const avatarUrl = avatarOverride !== undefined ? avatarOverride : (currentUser.Profile?.avatar || currentUser.avatar || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // Tải ảnh đại diện: upload lên Cloudinary (service-media) rồi lưu link vào hồ sơ (PUT /profile/me)
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return message.error('Vui lòng chọn file ảnh');
    if (file.size > 5 * 1024 * 1024) return message.error('Ảnh tối đa 5MB');
    setUploadingAvatar(true);
    try {
      const headers = { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` };
      const formData = new FormData();
      formData.append('image', file);
      const uploadRes = await axios.post('http://localhost:4000/api/media/upload', formData, { headers });
      await axios.put('http://localhost:4000/api/identity/profile/me', { avatar: uploadRes.data.url }, { headers });
      sessionStorage.setItem('admin_user', JSON.stringify({ ...currentUser, Profile: { ...(currentUser.Profile || {}), avatar: uploadRes.data.url } }));
      setAvatarOverride(uploadRes.data.url);
      message.success('Đã cập nhật ảnh đại diện');
    } catch (error) {
      message.error(error.response?.data?.message || 'Không tải được ảnh, vui lòng thử lại');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ==========================================
  // REAL-TIME CHAT LOGIC CHO TƯ VẤN VIÊN
  // ==========================================
  const [chatSocket, setChatSocket] = useState(null);
  const [chatSessions, setChatSessions] = useState([]); 
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [customers, setCustomers] = useState([]); 
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [isReady, setIsReady] = useState(true); 
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (role === 'CONSULTANT') {
      const token = sessionStorage.getItem('admin_token');
      axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => setCustomers(res.data?.data || []))
        .catch(err => console.log('Lỗi lấy danh sách khách', err));

      // Server chỉ cho tài khoản CONSULTANT (xác thực bằng token) nhận khách
      const newSocket = io('http://localhost:4001', { auth: { token } });
      setChatSocket(newSocket);

      newSocket.on('connect', () => {
         newSocket.emit('consultant_online');
      });

      newSocket.on('new_customer_assigned', (data) => {
         setChatSessions(prev => {
            if (prev.find(s => s.sessionId === data.sessionId)) return prev;
            return [...prev, { ...data, messages: [] }];
         });
         setActiveSessionId(prev => prev ? prev : data.sessionId);
         setIsChatMinimized(false); 
         message.success('CÓ KHÁCH HÀNG MỚI CẦN TƯ VẤN!');
      });

      newSocket.on('receive_message', (data) => {
         setChatSessions(prev => prev.map(s => {
            if (s.sessionId === data.sessionId) {
               return { ...s, messages: [...(s.messages || []), { sender: data.senderType, text: data.content }] };
            }
            return s;
         }));
         setIsChatMinimized(false); 
      });

      newSocket.on('system_message', (msg) => {
         message.info(msg);
      });

      return () => newSocket.disconnect();
    }
  }, [role, currentUser.id]);

  useEffect(() => {
      if (messagesEndRef.current && !isChatMinimized) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [chatSessions, activeSessionId, isChatMinimized]);

  const handleSendReply = () => {
      if (!chatInput.trim() || !activeSessionId || !chatSocket) return;
      const currentSession = chatSessions.find(s => s.sessionId === activeSessionId);
      if (!currentSession) return;

      setChatSessions(prev => prev.map(s => {
         if (s.sessionId === activeSessionId) {
             return { ...s, messages: [...(s.messages || []), { sender: 'CONSULTANT', text: chatInput }] };
         }
         return s;
      }));

      chatSocket.emit('send_message', { sessionId: activeSessionId, content: chatInput });
      setChatInput('');
  };

  const handleCloseSession = (sessionId) => {
      const session = chatSessions.find(s => s.sessionId === sessionId);
      if (chatSocket && session) {
          chatSocket.emit('close_session', { sessionId });
      }
      setChatSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      if (activeSessionId === sessionId) {
          setActiveSessionId(null);
      }
  };

  const handleToggleReady = (checked) => {
      setIsReady(checked);
      if (chatSocket) {
          chatSocket.emit('consultant_toggle_status', { isReady: checked });
      }
      if (checked) {
          message.success('Đã BẬT trạng thái Sẵn sàng. Bạn sẽ tiếp tục nhận khách mới.');
      } else {
          message.warning('Đã TẮT nhận khách mới. Bạn có thể nghỉ ngơi!');
      }
  };

  const userMenuItems = [
    { key: 'profile', label: 'Thông tin cá nhân', icon: <UserOutlined />, onClick: () => setIsProfileModalVisible(true) },
    { type: 'divider' },
    { key: 'logout', label: 'Đăng xuất', icon: <LogoutOutlined />, danger: true, onClick: handleLogout },
  ];

  // Chuyên gia thỉnh giảng (EXPERT): quyền hẹp, chỉ có trang lịch tư vấn của mình
  const isExpert = role === 'EXPERT';
  // Menu chia nhóm chức năng theo vai trò. Mỗi nhóm: [tên nhóm, icon, các mục]
  const personal = [
    { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch làm việc của tôi' },
    { key: '/attendance', icon: <FieldTimeOutlined />, label: 'Chấm công' },
    { key: '/my-payslip', icon: <WalletOutlined />, label: 'Phiếu lương' },
  ];
  const MENU_GROUPS = {
    ADMIN: [
      ['Hệ thống', <SettingOutlined />, [{ key: '/users', icon: <UserOutlined />, label: 'Quản lý người dùng' }]],
      ['Báo cáo', <LineChartOutlined />, [{ key: '/reports', icon: <LineChartOutlined />, label: 'Báo cáo doanh thu' }]],
      ['Tư vấn chuyên gia', <VideoCameraOutlined />, [{ key: '/consultations', icon: <VideoCameraOutlined />, label: 'Tư vấn chuyên gia' }]],
      ['Sản phẩm & Vật tư', <ShopOutlined />, [
        { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' },
        { key: '/materials', icon: <ExperimentOutlined />, label: 'Vật tư & Định mức' },
      ]],
      ['Website', <GlobalOutlined />, [{ key: '/content', icon: <GlobalOutlined />, label: 'Quản lý trang' }]],
    ],
    GEN_MANAGER: [
      ['Báo cáo', <LineChartOutlined />, [{ key: '/reports', icon: <LineChartOutlined />, label: 'Báo cáo doanh thu' }]],
      ['Nhân sự', <TeamOutlined />, [
        { key: '/schedule', icon: <ScheduleOutlined />, label: 'Lịch làm việc' },
        { key: '/attendance-management', icon: <FieldTimeOutlined />, label: 'Chấm công nhân viên' },
      ]],
      ['Lương', <WalletOutlined />, [
        { key: '/salary-rates', icon: <AccountBookOutlined />, label: 'Mức lương ca' },
        { key: '/payroll', icon: <WalletOutlined />, label: 'Bảng lương' },
      ]],
      ['Sản phẩm & Dịch vụ', <ShopOutlined />, [
        { key: '/inventory', icon: <AppstoreOutlined />, label: 'Kho & Sản phẩm' },
        { key: '/materials', icon: <ExperimentOutlined />, label: 'Vật tư & Định mức' },
        { key: '/spa-services', icon: <TagsOutlined />, label: 'Dịch vụ spa lẻ' },
        { key: '/packages', icon: <AppstoreAddOutlined />, label: 'Gói lộ trình' },
        { key: '/promotions', icon: <PercentageOutlined />, label: 'Mã khuyến mãi' },
        { key: '/consultations', icon: <VideoCameraOutlined />, label: 'Tư vấn chuyên gia' },
      ]],
      ['Website', <GlobalOutlined />, [{ key: '/content', icon: <GlobalOutlined />, label: 'Quản lý trang' }]],
    ],
    DOCTOR: [
      ['Chuyên môn', <MedicineBoxOutlined />, [
        { key: '/workspace', icon: <TeamOutlined />, label: 'Không gian khám bệnh' },
        { key: '/my-articles', icon: <FileTextOutlined />, label: 'Bài viết của tôi' },
      ]],
      ['Cá nhân', <IdcardOutlined />, personal],
    ],
    CONSULTANT: [
      ['Chăm sóc khách hàng', <CustomerServiceOutlined />, [
        { key: '/consultant-workspace', icon: <SolutionOutlined />, label: 'Không gian tư vấn' },
        { key: '/appointment-management', icon: <ScheduleOutlined />, label: 'Quản lý lịch hẹn' },
        { key: '/customer-profiles', icon: <TeamOutlined />, label: 'Hồ sơ khách hàng' },
        { key: '/consultant-checkout', icon: <DollarOutlined />, label: 'Thu tiền khách' },
        { key: '/consultations', icon: <VideoCameraOutlined />, label: 'Lịch tư vấn chuyên gia' },
      ]],
      ['Cá nhân', <IdcardOutlined />, personal],
    ],
    SALES: [
      ['Bán hàng', <ShoppingCartOutlined />, [
        { key: '/sales-management', icon: <DollarOutlined />, label: 'Quản lý đơn hàng' },
        { key: '/returns', icon: <RollbackOutlined />, label: 'Hoàn / trả hàng' },
      ]],
      ['Cá nhân', <IdcardOutlined />, personal],
    ],
    TECHNICIAN: [
      ['Chuyên môn', <MedicineBoxOutlined />, [{ key: '/technician-workspace', icon: <PlayCircleOutlined />, label: 'Không gian kỹ thuật' }]],
      ['Cá nhân', <IdcardOutlined />, personal],
    ],
  };
  // Nhóm thả xuống (bấm để mở / đóng); nhóm chỉ có 1 mục thì hiện thẳng mục đó cho gọn
  const groups = isExpert ? [] : (MENU_GROUPS[role] || []);
  const menuItems = isExpert ? [
    { key: '/expert-workspace', icon: <VideoCameraOutlined />, label: 'Lịch tư vấn của tôi' },
  ] : [
    { key: '/', icon: <DashboardOutlined />, label: 'Tổng quan' },
    ...groups.map(([title, icon, children]) => (children.length === 1 ? children[0] : { key: `group-${title}`, icon, label: title, children })),
  ];
  // Mở sẵn nhóm chứa trang đang xem
  const activeGroup = groups.find(([, , children]) => children.length > 1 && children.some((c) => c.key === location.pathname));
  const [openKeys, setOpenKeys] = useState(activeGroup ? [`group-${activeGroup[0]}`] : []);
  useEffect(() => {
    if (activeGroup) setOpenKeys((keys) => (keys.includes(`group-${activeGroup[0]}`) ? keys : [...keys, `group-${activeGroup[0]}`]));
  }, [location.pathname]);


  // Chưa đăng nhập (hoặc phiên đã hết hạn và bị xoá) -> về trang đăng nhập
  if (!sessionStorage.getItem('admin_token')) return <Navigate to="/login" replace />;
  // Chuyên gia không vào các trang dành cho nhân viên chính thức (API cũng chặn theo vai trò)
  if (isExpert && location.pathname !== '/expert-workspace') return <Navigate to="/expert-workspace" replace />;

  return (
    <Layout className="min-h-screen relative">
      {/* Máy tính: menu cố định bên trái. Điện thoại: menu là ngăn kéo trượt ra, chọn mục xong tự đóng */}
      {isMobile ? (
        <Drawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} placement="left" size={260} closable={false}
          styles={{ body: { padding: 0 } }}>
          <div className="h-14 flex items-center px-6 font-bold text-xl text-blue-600 border-b">O2O ADMIN</div>
          <Menu theme="light" mode="inline" selectedKeys={[location.pathname]} items={menuItems} openKeys={openKeys} onOpenChange={setOpenKeys}
            onClick={(e) => { setMobileMenuOpen(false); handleMenuClick(e); }} className="!border-e-0" />
        </Drawer>
      ) : (
        <Sider trigger={null} collapsible collapsed={collapsed} theme="light" className="shadow-md">
          <div className="h-16 flex items-center justify-center font-bold text-xl text-blue-600 border-b">
            {collapsed ? 'O2O' : 'O2O ADMIN'}
          </div>
          {/* Thu gọn: nhóm hiện dạng menu bật ra khi rê chuột, không giữ trạng thái mở */}
          <Menu theme="light" mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={handleMenuClick}
            {...(collapsed ? {} : { openKeys, onOpenChange: setOpenKeys })} />
        </Sider>
      )}
      <Layout className="min-w-0">
        <Header style={{ padding: 0, background: colorBgContainer, height: isMobile ? 56 : 64, lineHeight: isMobile ? '56px' : '64px' }}
          className={`flex justify-between items-center shadow-sm z-10 ${isMobile ? 'pr-2 sticky top-0' : 'pr-6'}`}>
          <div className="flex items-center">
            <Button type="text" onClick={() => (isMobile ? setMobileMenuOpen(true) : setCollapsed(!collapsed))}
              icon={isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              className={`${isMobile ? '!w-14 !h-14' : 'w-16 h-16'} text-lg`} />
            {isMobile && <span className="font-bold text-blue-600 text-lg">O2O ADMIN</span>}
          </div>
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <Space className={`cursor-pointer hover:bg-gray-50 rounded-lg transition-colors ${isMobile ? 'px-2' : 'px-4 py-2'}`}>
              <Avatar src={avatarUrl} icon={!avatarUrl && <UserOutlined />} className="bg-blue-500" />
              {!isMobile && <span className="font-medium text-gray-700">Xin chào, <span className="text-blue-600">{fullName}</span></span>}
              <DownOutlined className="text-xs text-gray-400" />
            </Space>
          </Dropdown>
        </Header>
        <Content className={`min-h-[280px] min-w-0 ${isMobile ? 'm-2 p-3' : 'm-6 p-6'}`} style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}>
          <Outlet />
        </Content>
      </Layout>

      {/* HỘP THÔNG TIN CÁ NHÂN + ĐỔI ẢNH ĐẠI DIỆN */}
      <Modal title="Thông tin cá nhân" open={isProfileModalVisible} onCancel={() => setIsProfileModalVisible(false)} footer={null}>
        <div className="flex flex-col items-center gap-3 mb-4">
          <Avatar size={96} src={avatarUrl} icon={!avatarUrl && <UserOutlined />} className="bg-blue-500" />
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <Button loading={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
            {avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
          </Button>
          {role === 'DOCTOR' && <span className="text-xs text-gray-500">Ảnh này hiển thị ở trang Đội ngũ bác sĩ của website khách hàng.</span>}
        </div>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Họ tên">{fullName}</Descriptions.Item>
          <Descriptions.Item label="Email">{email}</Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">{phone}</Descriptions.Item>
          <Descriptions.Item label="Vai trò"><Tag color="blue">{role}</Tag></Descriptions.Item>
        </Descriptions>
      </Modal>

      {/* Ô CHAT WIDGET DÀNH CHO CSKH */}
      {role === 'CONSULTANT' && (
        <>
          {isChatMinimized ? (
             <div 
               className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white w-14 h-14 rounded-full flex justify-center items-center cursor-pointer shadow-[0_5px_15px_rgba(0,0,0,0.3)] hover:bg-blue-700 transition-colors"
               onClick={() => setIsChatMinimized(false)}
             >
                <div className="relative">
                   <MessageOutlined className="text-2xl" />
                   {chatSessions.length > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                         {chatSessions.length}
                      </span>
                   )}
                </div>
             </div>
          ) : (
             <div className="fixed bottom-0 right-2 left-2 md:left-auto md:right-10 md:w-[600px] bg-white shadow-[0_-5px_25px_rgba(0,0,0,0.2)] rounded-t-xl flex flex-col z-50 border border-gray-200 transition-all duration-300">
                
                <div className="bg-blue-600 text-white p-3 rounded-t-xl font-bold flex justify-between items-center select-none">
                   <div className="flex items-center gap-4">
                       <span className="cursor-pointer" onClick={() => setIsChatMinimized(true)}>Trung tâm CSKH Trực tuyến ({chatSessions.length}/5 khách)</span>
                       <Switch 
                          checkedChildren="Sẵn sàng" 
                          unCheckedChildren="Đang bận" 
                          checked={isReady} 
                          onChange={handleToggleReady}
                          className={isReady ? 'bg-green-500' : 'bg-gray-400'}
                       />
                   </div>
                   {/* ĐÃ XÓA pointer-events-none ĐỂ NÚT NÀY BẤM ĐƯỢC */}
                   <Button size="small" type="text" className="text-white hover:text-gray-200" icon={<DownOutlined />} onClick={() => setIsChatMinimized(true)} />
                </div>
                
                <div className="h-[400px] flex flex-col overflow-hidden">
                  {chatSessions.length === 0 ? (
                     <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                        <MessageOutlined className="text-4xl mb-2 text-gray-300" />
                        <p>Chưa có khách hàng nào đang yêu cầu hỗ trợ.</p>
                     </div>
                  ) : (
                    <div className="flex-1 flex overflow-hidden">
                       <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
                          {chatSessions.map(session => {
                             const cust = customers.find(c => c.id === session.customerId);
                             const custName = cust?.Profile?.full_name || 'Khách vãng lai';
                             const msgArr = session.messages || [];
                             const lastMsg = msgArr.length > 0 ? msgArr[msgArr.length - 1].text : 'Đang đợi phản hồi...';
                             const isActive = session.sessionId === activeSessionId;

                             return (
                                <div key={session.sessionId} onClick={() => setActiveSessionId(session.sessionId)} className={`p-3 border-b cursor-pointer transition-colors ${isActive ? 'bg-blue-100 border-l-4 border-l-blue-600' : 'hover:bg-blue-50'}`}>
                                   <div className="font-bold text-sm truncate text-gray-800">{custName}</div>
                                   <div className="text-xs text-gray-500 truncate">{lastMsg}</div>
                                </div>
                             );
                          })}
                       </div>
                       
                       {activeSessionId ? (() => {
                          const currentSession = chatSessions.find(s => s.sessionId === activeSessionId);
                          if (!currentSession) return <div className="w-2/3 flex items-center justify-center text-gray-400 bg-white">Đang tải dữ liệu...</div>;

                          const cust = customers.find(c => c.id === currentSession.customerId);
                          const custName = cust?.Profile?.full_name || 'Khách vãng lai';

                          return (
                            <div className="w-2/3 flex flex-col bg-white">
                               <div className="p-2 border-b bg-gray-50 flex justify-between items-center shadow-sm z-10">
                                  <span className="font-bold text-sm truncate text-blue-800" style={{maxWidth: '120px'}} title={custName}>{custName}</span>
                                  <Space>
                                    <Button size="small" type="primary" onClick={() => {
                                       navigate('/appointment-management', { state: { autoFillCustomerId: currentSession.customerId } });
                                    }}>
                                      + Tạo Lịch
                                    </Button>
                                    <Popconfirm title="Đóng phiên chat này?" onConfirm={() => handleCloseSession(activeSessionId)}>
                                       <Button size="small" danger>Đóng</Button>
                                    </Popconfirm>
                                  </Space>
                               </div>
                               <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3">
                                  {(currentSession.messages || []).map((msg, idx) => (
                                     <div key={idx} className={`p-2 rounded-xl text-sm max-w-[85%] shadow-sm ${msg.sender === 'CONSULTANT' ? 'self-end bg-blue-600 text-white rounded-br-sm' : 'self-start bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                                        {msg.text}
                                     </div>
                                  ))}
                                  <div ref={messagesEndRef} />
                               </div>
                               <div className="p-3 border-t bg-gray-50 flex gap-2">
                                  <Input 
                                     placeholder="Nhập câu trả lời..." 
                                     value={chatInput}
                                     onChange={e => setChatInput(e.target.value)}
                                     onPressEnter={handleSendReply}
                                     className="rounded-full"
                                  />
                                  <Button type="primary" shape="circle" icon={<SendOutlined />} onClick={handleSendReply} />
                               </div>
                            </div>
                          );
                       })() : (
                          <div className="w-2/3 flex items-center justify-center text-gray-400 bg-white">
                             Chọn một phiên chat để bắt đầu
                          </div>
                       )}
                    </div>
                  )}
                </div>
             </div>
          )}
        </>
      )}
    </Layout>
  );
}