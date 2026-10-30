import React, { useState, useEffect, useRef } from 'react';
import { Layout, Menu, Button, theme, Dropdown, Space, Avatar, Modal, Descriptions, Tag, Input, Popconfirm, message, Switch } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined, DashboardOutlined, UserOutlined, CalendarOutlined,
  LogoutOutlined, AppstoreOutlined, TeamOutlined, GlobalOutlined, AppstoreAddOutlined,
  ScheduleOutlined, SolutionOutlined, PlayCircleOutlined, DollarOutlined, TagsOutlined, 
  PercentageOutlined, DownOutlined, UpOutlined, SendOutlined, MessageOutlined
} from '@ant-design/icons';
import { useNavigate, Outlet, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
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
  const avatarUrl = currentUser.Profile?.avatar || currentUser.avatar || null;

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

      // Server xác thực tư vấn viên qua token, không tin userId gửi lên
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
      { key: '/customer-profiles', icon: <TeamOutlined />, label: 'Quản Lý Hồ Sơ Khách' },
      { key: '/appointment-management', icon: <ScheduleOutlined />, label: 'Quản Lý Lịch Hẹn' },
      { key: '/consultant-checkout', icon: <DollarOutlined />, label: 'Thu tiền khách' },
    ] : []),
    ...(['SALES'].includes(role) ? [
      { key: '/sales-management', icon: <DollarOutlined />, label: 'Quản lý đơn hàng' },
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
    ] : []),
    ...(['TECHNICIAN'].includes(role) ? [
      { key: '/my-schedule', icon: <CalendarOutlined />, label: 'Lịch Làm Việc Của Tôi' },
      { key: '/technician-workspace', icon: <PlayCircleOutlined />, label: 'Không Gian Kỹ Thuật' },
    ] : []),
  ];


  // Chưa đăng nhập (hoặc phiên đã hết hạn và bị xoá) -> về trang đăng nhập
  if (!sessionStorage.getItem('admin_token')) return <Navigate to="/login" replace />;

  return (
    <Layout className="min-h-screen relative">
      <Sider trigger={null} collapsible collapsed={collapsed} theme="light" className="shadow-md">
        <div className="h-16 flex items-center justify-center font-bold text-xl text-blue-600 border-b">
          {collapsed ? 'O2O' : 'O2O ADMIN'}
        </div>
        <Menu theme="light" mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={handleMenuClick} />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} className="flex justify-between items-center pr-6 shadow-sm z-10">
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} className="w-16 h-16 text-lg" />
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <Space className="cursor-pointer hover:bg-gray-50 px-4 py-2 rounded-lg transition-colors">
              <Avatar src={avatarUrl} icon={!avatarUrl && <UserOutlined />} className="bg-blue-500" />
              <span className="font-medium text-gray-700">Xin chào, <span className="text-blue-600">{fullName}</span></span>
              <DownOutlined className="text-xs text-gray-400" />
            </Space>
          </Dropdown>
        </Header>
        <Content className="m-6 p-6 min-h-[280px]" style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}>
          <Outlet />
        </Content>
      </Layout>

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
             <div className="fixed bottom-0 right-10 w-[600px] bg-white shadow-[0_-5px_25px_rgba(0,0,0,0.2)] rounded-t-xl flex flex-col z-50 border border-gray-200 transition-all duration-300">
                
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