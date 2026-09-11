import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, Divider } from 'antd';
import { UserOutlined, ClockCircleOutlined, CheckCircleOutlined, MedicineBoxOutlined, FileTextOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function DoctorWorkspacePage() {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]);
  const [form] = Form.useForm();

  // Khởi tạo mảng rỗng để chứa dữ liệu thật từ Database
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    // 1. Gọi API lấy danh sách Gói lộ trình (Từ service-booking)
    fetch('http://localhost:4000/api/booking/packages')
      .then(res => res.json())
      .then(data => setPackages(data.data || []))
      .catch(() => console.error('Lỗi lấy Gói lộ trình'));

    // 2. Gọi API lấy danh sách Lịch hẹn hôm nay của Bác sĩ
    const fetchTodayAppointments = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const res = await fetch('http://localhost:4000/api/booking/appointments/my-today', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        
        if (result.data) {
                const formattedPatients = result.data.map(apt => ({
                    id: apt.id,
                    // Thay vì tự ghép ID, giờ ta lấy thẳng Tên và SĐT từ Backend trả về
                    name: apt.customer_name, 
                    time: apt.appointment_time,
                    status: apt.status,
                    phone: apt.customer_phone, 
                    history: apt.symptoms || 'Không có ghi chú'
                }));
                setPatients(formattedPatients);
        }
      } catch (error) {
        console.error('Lỗi tải danh sách bệnh nhân', error);
      }
    };

    fetchTodayAppointments();
  }, []);

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    form.resetFields();
  };

  const handleUpdateStatus = (status) => {
    const updatedPatients = patients.map(p => p.id === selectedPatient.id ? { ...p, status } : p);
    setPatients(updatedPatients);
    setSelectedPatient({ ...selectedPatient, status });
    message.success(`Đã cập nhật trạng thái thành ${status}`);
  };

  const handleSubmitRecord = (values) => {
    console.log('Dữ liệu chỉ định:', values);
    message.success('Đã lưu Bệnh án và Chỉ định thành công! Lễ tân đã nhận được thông tin.');
    handleUpdateStatus('COMPLETED');
  };

  const tabItems = [
    {
      key: '1',
      label: <><FileTextOutlined /> Bệnh án & Chẩn đoán</>,
      children: (
        <div className="p-4">
          <Form.Item name="symptoms" label="Triệu chứng & Tình trạng da">
            <Input.TextArea rows={3} placeholder="VD: Da tiết nhiều dầu vùng chữ T, nhiều mụn viêm sưng đỏ..." />
          </Form.Item>
          <Form.Item name="diagnosis" label="Chẩn đoán">
            <Input placeholder="VD: Mụn trứng cá cấp độ 3" />
          </Form.Item>
          <Form.Item name="notes" label="Dặn dò">
            <Input.TextArea rows={2} placeholder="VD: Kiêng ăn đồ cay nóng, uống nhiều nước..." />
          </Form.Item>
        </div>
      ),
    },
    {
      key: '2',
      label: <><MedicineBoxOutlined /> Lộ trình & Kê đơn</>,
      children: (
        <div className="p-4">
          <Form.Item name="treatment_package" label="Chỉ định Gói Lộ Trình (VIP)">
            <Select placeholder="-- Chọn lộ trình trị liệu --" allowClear>
              {packages.map(pkg => (
                <Select.Option key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.promotional_price?.toLocaleString()}đ</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="prescriptions" label="Kê đơn Dược Mỹ Phẩm (Mang về)">
            <Select mode="multiple" placeholder="-- Chọn dược mỹ phẩm --" allowClear>
              <Select.Option value="prod1">Sữa rửa mặt Cetaphil 500ml</Select.Option>
              <Select.Option value="prod2">Kem chống nắng La Roche-Posay</Select.Option>
              <Select.Option value="prod3">Chấm mụn Megaduo</Select.Option>
            </Select>
          </Form.Item>
        </div>
      ),
    }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={7} className="h-full">
        <Card title="Danh sách chờ (Hôm nay)" className="h-full shadow-sm" bodyStyle={{ padding: 0, height: 'calc(100% - 55px)', overflowY: 'auto' }}>
          <List
            itemLayout="horizontal"
            dataSource={patients}
            renderItem={(item) => (
              <List.Item 
                onClick={() => handleSelectPatient(item)}
                className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedPatient?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} className={item.status === 'COMPLETED' ? 'bg-green-500' : 'bg-blue-500'} />}
                  title={<b className="text-gray-800">{item.name}</b>}
                  description={
                    <Space size="small" className="mt-1">
                      <Tag icon={<ClockCircleOutlined />} color="default">{item.time}</Tag>
                      {item.status === 'WAITING' && <Tag color="warning">Đang chờ</Tag>}
                      {item.status === 'IN_PROGRESS' && <Tag color="processing">Đang khám</Tag>}
                      {item.status === 'COMPLETED' && <Tag color="success">Đã xong</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col span={17} className="h-full">
        <Card className="h-full shadow-sm flex flex-col" bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedPatient ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MedicineBoxOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn bệnh nhân</Title>
              <Text>Vui lòng chọn một bệnh nhân từ danh sách bên trái để bắt đầu khám.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <Space size="middle">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-blue-600" />
                  <div>
                    <Title level={4} className="m-0 text-blue-700">{selectedPatient.name}</Title>
                    <Text type="secondary">SĐT: {selectedPatient.phone} | Lịch sử: {selectedPatient.history}</Text>
                  </div>
                </Space>
                <Space>
                  {selectedPatient.status === 'WAITING' && (
                    <Button type="primary" onClick={() => handleUpdateStatus('IN_PROGRESS')}>
                      Bắt đầu khám
                    </Button>
                  )}
                  {selectedPatient.status === 'IN_PROGRESS' && (
                    <Tag color="processing" className="text-base px-3 py-1">Đang tiến hành khám...</Tag>
                  )}
                </Space>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                <Form form={form} layout="vertical" onFinish={handleSubmitRecord}>
                  <Tabs defaultActiveKey="1" items={tabItems} />
                  <Divider />
                  <div className="flex justify-end">
                    <Space>
                      <Button onClick={() => setSelectedPatient(null)}>Hủy bỏ</Button>
                      <Button type="primary" htmlType="submit" disabled={selectedPatient.status === 'COMPLETED'} icon={<CheckCircleOutlined />}>
                        Hoàn tất khám & Chuyển Lễ tân
                      </Button>
                    </Space>
                  </div>
                </Form>
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}