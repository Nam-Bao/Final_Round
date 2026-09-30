import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, message, Card, Modal, Form, Select, DatePicker, Tabs, Badge, List } from 'antd';
import { CalendarOutlined, PlusOutlined, SolutionOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const roleConfig = {
  DOCTOR: { label: 'Bác sĩ', icon: '👩‍⚕️' },
  CONSULTANT: { label: 'Tư vấn viên', icon: '💬' },
  TECHNICIAN: { label: 'Kỹ thuật viên', icon: '💆‍♀️' },
  SALES: { label: 'Sale', icon: '💼' }
};

export default function WorkSchedulePage() {
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [requests, setRequests] = useState([]); // State chứa danh sách đơn xin nghỉ chờ duyệt
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false); // Modal xem đơn
  const [activeRole, setActiveRole] = useState('DOCTOR');
  const [form] = Form.useForm();
  
  const [startOfWeek, setStartOfWeek] = useState(dayjs().startOf('week').add(1, 'day'));

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
    fetchRequests();
  }, [startOfWeek]); 

  const fetchEmployees = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/identity/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
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

  // Kéo danh sách đơn xin nghỉ đang chờ duyệt từ Backend
  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/shifts/requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (result.data) setRequests(result.data);
    } catch (error) { console.error('Lỗi tải danh sách đơn từ'); }
  };

  // Xử lý Phê duyệt hoặc Từ chối đơn
  const handleProcessRequest = async (requestId, status) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`http://localhost:4000/api/booking/shifts/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error();
      message.success(status === 'APPROVED' ? 'Đã duyệt đơn xin nghỉ!' : 'Đã từ chối đơn!');
      fetchRequests();
      fetchShifts(); // Load lại lịch vì ca làm có thể đã bị xóa
    } catch (error) { message.error('Lỗi xử lý đơn'); }
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
      
      if (!res.ok) throw new Error();
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

  const currentEmployees = employees.filter(e => e.role === activeRole);

  const columns = [
    { 
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

  const tabItems = Object.keys(roleConfig).map(role => ({
    key: role,
    label: `${roleConfig[role].icon} Nhóm ${roleConfig[role].label}`,
  }));

  return (
    <Card 
      title={<><CalendarOutlined /> Quản lý Lịch làm việc</>} 
      extra={
        <Space>
          {/* NÚT THÔNG BÁO ĐƠN CHỜ DUYỆT CÓ GẮN BADGE SỐ LƯỢNG */}
          <Badge count={requests.length} offset={[-5, 5]}>
            <Button icon={<SolutionOutlined />} onClick={() => setIsRequestModalVisible(true)}>
              Duyệt Đơn Từ
            </Button>
          </Badge>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
            Xếp Ca Nhanh
          </Button>
        </Space>
      }
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

      <Tabs activeKey={activeRole} onChange={(key) => setActiveRole(key)} items={tabItems} className="mb-4" />

      <Table columns={columns} dataSource={currentEmployees} rowKey="id" loading={loading} bordered pagination={false} scroll={{ x: 1000 }} />

      {/* MODAL XẾP CA NHANH */}
      <Modal title={`Xếp ca làm việc - ${roleConfig[activeRole].label}`} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label={`Chọn ${roleConfig[activeRole].label}`} name="employee_id" rules={[{ required: true }]}>
            <Select placeholder="Chọn nhân viên">
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

{/* MODAL DANH SÁCH ĐƠN XIN NGHỈ CHỜ DUYỆT */}
      <Modal title="Danh Sách Đơn Xin Nghỉ / Đổi Ca Chờ Duyệt" open={isRequestModalVisible} onCancel={() => setIsRequestModalVisible(false)} footer={null} width={650}>
        <List
          dataSource={requests}
          locale={{ emptyText: 'Hiện không có đơn xin nghỉ nào cần duyệt.' }}
          renderItem={(item) => {
            // 1. Kéo Tên và Vị trí từ danh sách nhân viên đã load ở Frontend
            const emp = employees.find(e => e.id === item.employee_id);
            const empName = emp?.Profile?.full_name || 'Chưa cập nhật tên';
            const empRoleLabel = roleConfig[emp?.role]?.label || emp?.role || 'Nhân viên';
            
            // Lấy đúng 4 ký tự cuối của ID
            const empCode = `...${item.employee_id.slice(-4)}`; 
            
            // 2. Format lại thông tin Ca làm từ Backend gửi sang
            let shiftText = 'Ca làm không xác định';
            if (item.WorkShift) {
              const dateStr = dayjs(item.WorkShift.date).format('DD/MM/YYYY');
              const shiftType = item.WorkShift.shift_type === 'MORNING' ? 'Ca Sáng' : item.WorkShift.shift_type === 'AFTERNOON' ? 'Ca Chiều' : 'Ca Tối';
              shiftText = `${shiftType} (${dateStr})`;
            }

            return (
              <List.Item
                actions={[
                  <Button type="primary" size="small" icon={<CheckOutlined />} className="bg-green-600" onClick={() => handleProcessRequest(item.id, 'APPROVED')}>Duyệt</Button>,
                  <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleProcessRequest(item.id, 'REJECTED')}>Từ chối</Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-600 text-base">{empName}</span>
                      <Tag color="blue">{empRoleLabel}</Tag>
                      <span className="text-gray-400 text-sm">({empCode})</span>
                    </div>
                  }
                  description={
                    <div className="mt-2 text-gray-700 space-y-1">
                      <p className="m-0"><b>Xin nghỉ ca:</b> <Tag color="warning">{shiftText}</Tag></p>
                      <p className="m-0"><b>Lý do:</b> {item.reason}</p>
                      <p className="m-0 text-xs text-gray-400 mt-2">Gửi lúc: {dayjs(item.createdAt).format('HH:mm - DD/MM/YYYY')}</p>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Modal>
    </Card>
  );
}