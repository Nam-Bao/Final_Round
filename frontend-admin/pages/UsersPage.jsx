import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Input, Select, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();
  
  // THÊM: State lưu từ khóa tìm kiếm
  const [searchText, setSearchText] = useState('');

  useEffect(() => { fetchUsers(); }, []);

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
    } catch (error) { message.error(error.message); } finally { setLoading(false); }
  };

  const openModal = (record = null) => {
    setEditingUser(record);
    if (record) {
      form.setFieldsValue({
        email: record.email, role: record.role, status: record.status,
        full_name: record.Profile?.full_name, phone: record.Profile?.phone,
      });
    } else form.resetFields();
    setIsModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      const isUpdate = !!editingUser;
      const url = isUpdate ? `http://localhost:4000/api/identity/users/${editingUser.id}` : 'http://localhost:4000/api/identity/users';
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(values)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      message.success(isUpdate ? 'Cập nhật thành công!' : 'Thêm mới thành công!');
      setIsModalVisible(false);
      fetchUsers();
    } catch (error) { message.error(error.message); }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`http://localhost:4000/api/identity/users/${id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      message.success('Đã xóa tài khoản vĩnh viễn!');
      fetchUsers();
    } catch (error) { message.error(error.message); }
  };

  // THÊM: Logic lọc dữ liệu theo từ khóa tìm kiếm (Tên hoặc Email)
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchText.toLowerCase()) || 
    (u.Profile?.full_name || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Họ và Tên', dataIndex: 'Profile', key: 'fullName',
      render: (profile) => <span className="font-medium">{profile?.full_name || 'N/A'}</span>,
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Vai trò', dataIndex: 'role', key: 'role',
      // THÊM: Bộ lọc tại cột Vai trò
      filters: [
        { text: 'Quản trị viên (ADMIN)', value: 'ADMIN' },
        { text: 'Quản lý (GEN_MANAGER)', value: 'GEN_MANAGER' },
        { text: 'Bác sĩ (DOCTOR)', value: 'DOCTOR' },
        { text: 'Khách hàng (CUSTOMER)', value: 'CUSTOMER' },
      ],
      onFilter: (value, record) => record.role === value,
      render: (role) => {
        let color = 'blue';
        if (role === 'ADMIN' || role === 'GEN_MANAGER') color = 'volcano';
        if (role === 'DOCTOR') color = 'purple';
        if (role === 'CUSTOMER') color = 'green';
        return <Tag color={color}>{role}</Tag>;
      },
    },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status',
      // THÊM: Bộ lọc tại cột Trạng thái
      filters: [
        { text: 'Hoạt động (ACTIVE)', value: 'ACTIVE' },
        { text: 'Khóa (INACTIVE)', value: 'INACTIVE' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => <Tag color={status === 'ACTIVE' ? 'success' : 'error'}>{status}</Tag>,
    },
    {
      title: 'Hành động', key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={() => openModal(record)}>Sửa</Button>
          <Popconfirm title="Xóa tài khoản này?" onConfirm={() => handleDelete(record.id)} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
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
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm Tài Khoản Mới</Button>}
      >
        {/* THÊM: Ô tìm kiếm hiển thị ngay trên bảng */}
        <div className="mb-4">
          <Input.Search 
            placeholder="Tìm kiếm theo tên hoặc email..." 
            allowClear 
            onChange={(e) => setSearchText(e.target.value)} 
            style={{ width: 350 }} 
          />
        </div>

        <Table columns={columns} dataSource={filteredUsers} rowKey="id" loading={loading} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal title={editingUser ? "Sửa thông tin tài khoản" : "Tạo tài khoản mới"} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        {/* ... (Giữ nguyên form Modal của bạn) ... */}
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Email không hợp lệ!' }]}><Input disabled={!!editingUser} /></Form.Item>
          {!editingUser && <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}><Input.Password /></Form.Item>}
          <Form.Item label="Họ và Tên" name="full_name" rules={[{ required: true, message: 'Vui lòng nhập họ tên!' }]}><Input /></Form.Item>
          <Form.Item label="Số điện thoại" name="phone"><Input /></Form.Item>
          <Space className="w-full justify-between">
            <Form.Item label="Vai trò" name="role" className="w-[200px]" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="CUSTOMER">Khách hàng</Select.Option><Select.Option value="DOCTOR">Bác sĩ / Chuyên gia</Select.Option>
                <Select.Option value="GEN_MANAGER">Quản lý</Select.Option><Select.Option value="ADMIN">Quản trị viên</Select.Option>
                <Select.Option value="CONSULTANT">Tư vấn viên</Select.Option><Select.Option value="TECHNICIAN">Kỹ thuật viên</Select.Option>
                <Select.Option value="SALES">Nhân viên Bán hàng</Select.Option>
              </Select>
            </Form.Item>
            {editingUser && (
              <Form.Item label="Trạng thái" name="status" className="w-[200px]" rules={[{ required: true }]}>
                <Select><Select.Option value="ACTIVE">Hoạt động</Select.Option><Select.Option value="INACTIVE">Khóa</Select.Option></Select>
              </Form.Item>
            )}
          </Space>
          <Form.Item className="text-right mb-0"><Space><Button onClick={() => setIsModalVisible(false)}>Hủy</Button><Button type="primary" htmlType="submit">Lưu</Button></Space></Form.Item>
        </Form>
      </Modal>
    </>
  );
}