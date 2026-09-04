import React, { useState, useEffect } from 'react';
import { 
  Table, Tag, Space, Button, message, Card, 
  Modal, Form, Input, Select, Popconfirm 
} from 'antd';
import { 
  EditOutlined, DeleteOutlined, PlusOutlined 
} from '@ant-design/icons';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State quản lý Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // Lưu thông tin user đang sửa (nếu null là đang Thêm mới)
  
  // Instance quản lý Form của Ant Design
  const [form] = Form.useForm();

  // 1. Tải danh sách User
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('http://localhost:4000/api/identity/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setUsers(result.data);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Mở Modal Thêm/Sửa
  const openModal = (record = null) => {
    setEditingUser(record);
    if (record) {
      // Nếu là Sửa: Đổ dữ liệu cũ vào Form
      form.setFieldsValue({
        email: record.email,
        role: record.role,
        status: record.status,
        full_name: record.Profile?.full_name,
        phone: record.Profile?.phone,
      });
    } else {
      // Nếu là Thêm mới: Xóa trắng Form
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  // 3. Xử lý Gửi Form (Thêm hoặc Sửa)
  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      const isUpdate = !!editingUser;
      
      // Chọn URL và Method tùy theo Thêm hay Sửa
      const url = isUpdate 
        ? `http://localhost:4000/api/identity/users/${editingUser.id}` 
        : 'http://localhost:4000/api/identity/users';
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(values)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      message.success(isUpdate ? 'Cập nhật thành công!' : 'Thêm mới thành công!');
      setIsModalVisible(false);
      fetchUsers(); // Tải lại bảng
    } catch (error) {
      message.error(error.message);
    }
  };

  // 4. Xử lý Xóa
  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`http://localhost:4000/api/identity/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      message.success('Đã xóa tài khoản vĩnh viễn!');
      fetchUsers();
    } catch (error) {
      message.error(error.message);
    }
  };

  // 5. Cấu hình Cột
  const columns = [
    {
      title: 'Họ và Tên',
      dataIndex: 'Profile',
      key: 'fullName',
      render: (profile) => <span className="font-medium">{profile?.full_name || 'N/A'}</span>,
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        let color = 'blue';
        if (role === 'ADMIN' || role === 'GEN_MANAGER') color = 'volcano';
        if (role === 'DOCTOR') color = 'purple';
        if (role === 'CUSTOMER') color = 'green';
        return <Tag color={color}>{role}</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>{status}</Tag>
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          {/* Nút Sửa gọi hàm openModal có kèm dữ liệu dòng đó */}
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>
            Sửa
          </Button>
          
          {/* Nút Xóa bọc trong Popconfirm để chống bấm nhầm */}
          <Popconfirm 
            title="Xóa tài khoản này?" 
            description="Bạn có chắc chắn muốn xóa vĩnh viễn?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa" 
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />} size="small">Xóa</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card 
        title="Quản lý Nhân sự & Người dùng" 
        className="shadow-sm border-gray-200"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Thêm Tài Khoản Mới
          </Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={users} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 8 }} 
        />
      </Card>

      {/* MODAL THÊM / SỬA */}
      <Modal
        title={editingUser ? "Sửa thông tin tài khoản" : "Tạo tài khoản mới"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null} // Ẩn footer mặc định để dùng nút của Form
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Email không hợp lệ!' }]}>
            <Input disabled={!!editingUser} placeholder="VD: nhanvien@o2o.com" />
          </Form.Item>

          {/* Mật khẩu chỉ bắt buộc khi Thêm mới (editingUser = null) */}
          {!editingUser && (
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}>
              <Input.Password placeholder="Nhập mật khẩu" />
            </Form.Item>
          )}

          <Form.Item label="Họ và Tên" name="full_name" rules={[{ required: true, message: 'Vui lòng nhập họ tên!' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>

          <Form.Item label="Số điện thoại" name="phone">
            <Input placeholder="0987654321" />
          </Form.Item>

          <Space className="w-full justify-between">
            <Form.Item label="Vai trò" name="role" className="w-[200px]" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="CUSTOMER">Khách hàng</Select.Option>
                <Select.Option value="DOCTOR">Bác sĩ / Chuyên gia</Select.Option>
                <Select.Option value="GEN_MANAGER">Quản lý</Select.Option>
                <Select.Option value="ADMIN">Quản trị viên</Select.Option>
              </Select>
            </Form.Item>

            {/* Chỉ hiện Đổi Trạng Thái khi Sửa */}
            {editingUser && (
              <Form.Item label="Trạng thái" name="status" className="w-[200px]" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="ACTIVE">Hoạt động (ACTIVE)</Select.Option>
                  <Select.Option value="INACTIVE">Khóa (INACTIVE)</Select.Option>
                </Select>
              </Form.Item>
            )}
          </Space>

          <Form.Item className="mt-4 mb-0 flex justify-end">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">
                {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}