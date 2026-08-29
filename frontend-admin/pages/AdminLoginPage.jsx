import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export default function AdminLoginPage() {
  const navigate = useNavigate();

  const onFinish = async (values) => {
    try {
      const response = await fetch('http://localhost:4000/api/identity/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      // XỬ LÝ ROLE-BASED ACCESS CONTROL TẠI FRONTEND
      const role = data.user.role;
      
      if (role === 'CUSTOMER' || role === 'GUEST') {
        message.error('Truy cập bị từ chối! Bạn không phải là nhân viên.');
        return;
      }

      // Nếu là nhân viên hợp lệ -> Lưu Token
      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_user', JSON.stringify(data.user));
      
      message.success(`Chào mừng ${role} đã đăng nhập!`);
      
      // Phân luồng Dashboard tùy theo Role (Tùy chọn nâng cao)
      if (role === 'DOCTOR') navigate('/doctor-schedule');
      else if (role === 'SALES') navigate('/inventory');
      else navigate('/dashboard'); // Mặc định cho Admin/Manager

    } catch (err) {
      message.error(err.message || 'Đăng nhập thất bại');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <Card className="w-[400px] shadow-lg rounded-2xl" bordered={false}>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">O2O Workspace</h2>
          <p className="text-gray-500">Cổng Đăng Nhập Dành Cho Nhân Viên</p>
        </div>

        <Form name="admin_login" onFinish={onFinish} layout="vertical">
          <Form.Item name="email" rules={[{ required: true, message: 'Vui lòng nhập Email!' }]}>
            <Input prefix={<UserOutlined />} placeholder="Email nhân viên" size="large" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: 'Vui lòng nhập Mật khẩu!' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" className="w-full bg-blue-600">
              Đăng Nhập Hệ Thống
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}