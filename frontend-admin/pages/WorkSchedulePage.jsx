import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Select, DatePicker, Tabs } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

// Định nghĩa cấu hình cho các Tab nhân sự
const roleConfig = {
  DOCTOR: { label: 'Bác sĩ', icon: '👩‍⚕️' },
  CONSULTANT: { label: 'Tư vấn viên', icon: '💬' },
  TECHNICIAN: { label: 'Kỹ thuật viên', icon: '💆‍♀️' },
  SALES: { label: 'Sale', icon: '💼' }
};

export default function WorkSchedulePage() {
  const [employees, setEmployees] = useState([]); // Chứa TẤT CẢ nhân viên
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [activeRole, setActiveRole] = useState('DOCTOR'); // Theo dõi Tab đang chọn
  const [form] = Form.useForm();
  
  const [startOfWeek, setStartOfWeek] = useState(dayjs().startOf('week').add(1, 'day'));

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [startOfWeek]); 

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/identity/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      
      // Lấy danh sách các role hợp lệ để phân ca
      const schedulableRoles = Object.keys(roleConfig);
      setEmployees(result.data.filter(u => schedulableRoles.includes(u.role)));
    } catch (error) { message.error('Lỗi lấy danh sách nhân viên'); }
  };

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const startDate = startOfWeek.format('YYYY-MM-DD');
      const endDate = startOfWeek.add(6, 'day').format('YYYY-MM-DD');
      
      const res = await fetch(`http://localhost:4000/api/booking/shifts?startDate=${startDate}&endDate=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      setShifts(result.data);
    } catch (error) { message.error('Lỗi tải lịch làm việc'); } finally { setLoading(false); }
  };

  const handleSubmit = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      const payload = {
        employee_id: values.employee_id,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        shift_types: values.shift_types
      };

      const res = await fetch('http://localhost:4000/api/booking/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Thất bại');
      message.success('Phân ca thành công!');
      setIsModalVisible(false);
      form.resetFields();
      fetchShifts();
    } catch (error) { message.error('Có lỗi xảy ra'); }
  };

  const handleDelete = async (shiftId) => {
    try {
      const token = localStorage.getItem('admin_token');
      await fetch(`http://localhost:4000/api/booking/shifts/${shiftId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchShifts();
    } catch (error) { message.error('Lỗi khi hủy ca'); }
  };

  // LỌC NHÂN VIÊN THEO TAB ĐANG MỞ
  const currentEmployees = employees.filter(e => e.role === activeRole);

  const columns = [
    { 
      // Tiêu đề cột sẽ tự động đổi theo Tab (VD: "Bác sĩ" hoặc "Kỹ thuật viên")
      title: `${roleConfig[activeRole].icon} ${roleConfig[activeRole].label}`, 
      dataIndex: 'Profile', 
      key: 'name', 
      fixed: 'left', 
      width: 170,
      render: (profile, record) => <b className="text-blue-600">{profile?.full_name || record.email}</b>
    }
  ];

  for (let i = 0; i < 7; i++) {
    const currentDate = startOfWeek.add(i, 'day');
    const dateStr = currentDate.format('YYYY-MM-DD');
    const displayDate = currentDate.format('DD/MM');
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    
    columns.push({
      title: `${dayNames[currentDate.day()]} (${displayDate})`,
      key: dateStr,
      width: 150,
      render: (_, employeeRecord) => {
        const cellShifts = shifts.filter(s => s.employee_id === employeeRecord.id && s.date === dateStr);
        return (
          <Space direction="vertical" size="small">
            {cellShifts.map(shift => {
              let color = shift.shift_type === 'MORNING' ? 'blue' : shift.shift_type === 'AFTERNOON' ? 'orange' : 'purple';
              let label = shift.shift_type === 'MORNING' ? 'Sáng' : shift.shift_type === 'AFTERNOON' ? 'Chiều' : 'Tối';
              return (
                <Tag key={shift.id} color={color} className="flex justify-between w-full" closable onClose={(e) => {
                  e.preventDefault(); 
                  handleDelete(shift.id); 
                }}>
                  {label}
                </Tag>
              );
            })}
          </Space>
        );
      }
    });
  }

  // Cấu hình các mục cho Tabs
  const tabItems = Object.keys(roleConfig).map(role => ({
    key: role,
    label: `${roleConfig[role].icon} Nhóm ${roleConfig[role].label}`,
  }));

  return (
    <Card 
      title={<><CalendarOutlined /> Quản lý Lịch làm việc</>} 
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>Xếp Ca Nhanh</Button>}
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-gray-600 font-medium m-0">
          Tuần làm việc: {startOfWeek.format('DD/MM/YYYY')} - {startOfWeek.add(6, 'day').format('DD/MM/YYYY')}
        </h3>
        <Space>
          <Button onClick={() => setStartOfWeek(startOfWeek.subtract(7, 'day'))}>Tuần trước</Button>
          <Button onClick={() => setStartOfWeek(dayjs().startOf('week').add(1, 'day'))}>Tuần này</Button>
          <Button onClick={() => setStartOfWeek(startOfWeek.add(7, 'day'))}>Tuần sau</Button>
        </Space>
      </div>

      {/* Tích hợp Tabs để chuyển đổi bộ phận */}
      <Tabs 
        activeKey={activeRole} 
        onChange={(key) => setActiveRole(key)} 
        items={tabItems} 
        className="mb-4"
      />

      <Table 
        columns={columns} 
        dataSource={currentEmployees} 
        rowKey="id" 
        loading={loading} 
        bordered 
        pagination={false} 
        scroll={{ x: 1000 }} 
      />

      <Modal title={`Xếp ca làm việc - ${roleConfig[activeRole].label}`} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          
          <Form.Item label={`Chọn ${roleConfig[activeRole].label}`} name="employee_id" rules={[{ required: true }]}>
            <Select placeholder="Chọn nhân viên">
              {/* Dropdown cũng tự động chỉ hiển thị nhân viên của Tab đang mở */}
              {currentEmployees.map(e => <Select.Option key={e.id} value={e.id}>{e.Profile?.full_name || e.email}</Select.Option>)}
            </Select>
          </Form.Item>
          
          <Form.Item label="Khoảng ngày áp dụng" name="dateRange" rules={[{ required: true }]}>
            <RangePicker className="w-full" format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item label="Ca làm việc" name="shift_types" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Chọn 1 hoặc nhiều ca">
              <Select.Option value="MORNING">Ca Sáng (08:00 - 12:00)</Select.Option>
              <Select.Option value="AFTERNOON">Ca Chiều (13:00 - 17:00)</Select.Option>
              <Select.Option value="EVENING">Ca Tối (18:00 - 22:00)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item className="text-right mb-0">
            <Space><Button onClick={() => setIsModalVisible(false)}>Hủy</Button><Button type="primary" htmlType="submit">Lưu Lịch</Button></Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}