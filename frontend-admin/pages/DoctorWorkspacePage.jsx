import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, Divider, DatePicker, Drawer, Timeline, Spin, Empty } from 'antd';
import { UserOutlined, ClockCircleOutlined, CheckCircleOutlined, MedicineBoxOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DoctorWorkspacePage() {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [spaServices, setSpaServices] = useState([]); 
  const [patients, setPatients] = useState([]);
  
  // State cho Lịch sử y bạ
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [form] = Form.useForm();

  useEffect(() => {
    fetch('http://localhost:4000/api/booking/packages')
      .then(res => res.json())
      .then(data => setPackages(data.data || []))
      .catch(() => console.error('Lỗi lấy Gói lộ trình'));

    fetch('http://localhost:4000/api/booking/spa-services')
      .then(res => res.json())
      .then(data => setSpaServices(data.data || []))
      .catch(() => console.error('Lỗi lấy Dịch vụ Spa'));

    fetch('http://localhost:4000/api/commerce/products')
      .then(res => res.json())
      .then(data => {
        const productList = (data.data || []).filter(item => item.type === 'PRODUCT');
        setProducts(productList);
      })
      .catch(() => console.error('Lỗi lấy danh sách sản phẩm'));

    const fetchTodayAppointments = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const res = await axios.get('http://localhost:4000/api/booking/appointments/my-today', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.data?.data) {
          const formattedPatients = res.data.data.map(apt => ({
            id: apt.id,
            customer_id: apt.customer_id, // Quan trọng: Cần ID khách để lấy lịch sử
            name: apt.customer_name, 
            time: apt.appointment_time,
            status: apt.status,
            phone: apt.customer_phone, 
            history: apt.symptoms || 'Không có ghi chú',
            pre_notes: apt.pre_notes 
          }));
          setPatients(formattedPatients);
        }
      } catch (error) {
        console.error('Lỗi tải danh sách bệnh nhân', error);
      }
    };

    fetchTodayAppointments();
  }, []);

  const fetchPatientHistory = async (customerId) => {
    setLoadingHistory(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get(`http://localhost:4000/api/identity/medical-records/${customerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setPatientHistory(res.data?.data || []);
    } catch (error) {
      console.error('Lỗi tải lịch sử y tế:', error);
      setPatientHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    form.resetFields();
    // Tự động tải ngầm lịch sử y tế khi Bác sĩ chọn bệnh nhân
    fetchPatientHistory(patient.customer_id);
  };

  const handleUpdateStatus = (status) => {
    const updatedPatients = patients.map(p => p.id === selectedPatient.id ? { ...p, status } : p);
    setPatients(updatedPatients);
    setSelectedPatient({ ...selectedPatient, status });
  };

  const handleSubmitRecord = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      
      // Bác sĩ hoàn thành khám -> Gửi api cập nhật sang chốt sale và lưu Sổ y bạ
      const res = await axios.put(`http://localhost:4000/api/booking/appointments/${selectedPatient.id}/finish-exam`, {
        symptoms: values.symptoms,
        diagnosis: values.diagnosis,
        doctor_notes: values.doctor_notes, // Dặn dò
        follow_up_date: values.follow_up_date ? values.follow_up_date.format('YYYY-MM-DD') : null, // Hẹn tái khám
        // Dữ liệu mảng dịch vụ/thuốc (sẽ dùng cho module Thu ngân sắp tới)
        spa_services: values.spa_services,
        treatment_package: values.treatment_package,
        prescriptions: values.prescriptions
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      message.success('Đã lưu Bệnh án! Khách hàng đã được chuyển ra CSKH để chốt Sale.');
      handleUpdateStatus('WAITING_FOR_SALE'); 
      setSelectedPatient(null); 
      
    } catch (error) {
      message.error('Có lỗi xảy ra khi hoàn tất khám');
      console.error(error);
    }
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
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="doctor_notes" label="Dặn dò">
                <Input.TextArea rows={2} placeholder="VD: Kiêng ăn đồ cay nóng, uống nhiều nước..." />
              </Form.Item>
            </Col>
            <Col span={8}>
               <Form.Item name="follow_up_date" label="Ngày hẹn tái khám (Dự kiến)">
                 <DatePicker format="DD/MM/YYYY" className="w-full" placeholder="Chọn ngày" />
               </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: '2',
      label: <><MedicineBoxOutlined /> Lộ trình & Kê đơn</>,
      children: (
        <div className="p-4">
          <Form.Item name="spa_services" label="Chỉ định Dịch vụ Spa lẻ (Làm ngay)">
            <Select mode="multiple" placeholder="-- Chọn dịch vụ --" allowClear>
              {spaServices.map(srv => (
                <Select.Option key={srv.id} value={srv.id}>
                  {srv.name} - <span className="text-red-500 font-medium">{Number(srv.price).toLocaleString('vi-VN')}đ</span>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="treatment_package" label="Chỉ định Gói Lộ Trình (VIP)">
            <Select placeholder="-- Chọn lộ trình trị liệu --" allowClear>
              {packages.map(pkg => (
                <Select.Option key={pkg.id} value={pkg.id}>
                  {pkg.name} - <span className="text-red-500 font-medium">{Number(pkg.promotional_price || pkg.price).toLocaleString('vi-VN')}đ</span>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="prescriptions" label="Kê đơn Dược Mỹ Phẩm (Mang về)">
            <Select mode="multiple" placeholder="-- Chọn dược mỹ phẩm --" allowClear>
              {products.map(prod => (
                <Select.Option key={prod.id} value={prod.id}>
                  {prod.name} - <span className="text-red-500 font-medium">{Number(prod.price).toLocaleString('vi-VN')}đ</span>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </div>
      ),
    }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      {/* CỘT TRÁI: DANH SÁCH BỆNH NHÂN */}
      <Col span={7} className="h-full">
        <Card title="Danh sách chờ (Hôm nay)" variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: 0, height: 'calc(100% - 55px)', overflowY: 'auto' } }}>
          <List
            itemLayout="horizontal"
            dataSource={patients}
            renderItem={(item) => (
              <List.Item 
                onClick={() => handleSelectPatient(item)}
                className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedPatient?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} className={(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') ? 'bg-green-500' : 'bg-blue-500'} />}
                  title={<b className="text-gray-800">{item.name}</b>}
                  description={
                    <Space size="small" className="mt-1">
                      <Tag icon={<ClockCircleOutlined />} color="default">{item.time}</Tag>
                      {item.status === 'WAITING' && <Tag color="warning">Đang chờ</Tag>}
                      {item.status === 'IN_PROGRESS' && <Tag color="processing">Đang khám</Tag>}
                      {(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') && <Tag color="success">Đã xong</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </Col>

      {/* CỘT PHẢI: KHÔNG GIAN KHÁM & CHỈ ĐỊNH */}
      <Col span={17} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          {!selectedPatient ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MedicineBoxOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn bệnh nhân</Title>
              <Text>Vui lòng chọn một bệnh nhân từ danh sách bên trái để tiến hành khám.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* HEADER THÔNG TIN */}
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
                <Space size="middle" align="start">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-blue-600 mt-1" />
                  <div>
                    <Title level={4} className="m-0 text-blue-700">{selectedPatient.name}</Title>
                    <div className="mt-1 mb-2">
                        <Text type="secondary">SĐT: <span className="font-medium text-gray-700">{selectedPatient.phone}</span></Text>
                        <Divider type="vertical" />
                        <Text type="secondary">Trạng thái: <Tag color="processing" className="ml-1">Đang khám...</Tag></Text>
                    </div>

                    {/* LỜI KHAI TỪ CSKH */}
                    <div className="mt-2 bg-white p-3 rounded border border-blue-200 min-w-[400px]">
                      <Text strong className="text-blue-600 block mb-2">📋 Lời khai sơ bộ (Từ CSKH):</Text>
                      {selectedPatient.pre_notes ? (
                        selectedPatient.pre_notes.split(' - ').map((note, index) => (
                          <div key={index} className="mb-1 text-gray-800">
                            <span className="text-blue-400 mr-2">▪</span> {note}
                          </div>
                        ))
                      ) : (
                        <Text type="secondary italic">Chưa có ghi chú sơ bộ từ CSKH.</Text>
                      )}
                    </div>
                  </div>
                </Space>
                
                {/* NÚT MỞ SỔ Y BẠ CŨ */}
                <Button type="default" icon={<HistoryOutlined />} onClick={() => setIsHistoryVisible(true)}>
                  Tra cứu Sổ y bạ
                </Button>
              </div>

              {/* FORM NHẬP BỆNH ÁN */}
              <div className="flex-1 p-4 overflow-y-auto">
                <Form form={form} layout="vertical" onFinish={handleSubmitRecord}>
                  <Tabs defaultActiveKey="1" items={tabItems} />
                  <Divider />
                  <div className="flex justify-end">
                    <Space>
                      <Button onClick={() => setSelectedPatient(null)}>Hủy bỏ</Button>
                      <Button type="primary" htmlType="submit" disabled={selectedPatient.status === 'COMPLETED' || selectedPatient.status === 'WAITING_FOR_SALE'} icon={<CheckCircleOutlined />}>
                        Hoàn tất khám & Chuyển CSKH
                      </Button>
                    </Space>
                  </div>
                </Form>
              </div>
            </div>
          )}
        </Card>
      </Col>

      {/* DRAWER TRƯỢT TỪ BÊN PHẢI: HIỂN THỊ SỔ Y BẠ */}
      <Drawer
        title={<span className="text-blue-700"><HistoryOutlined className="mr-2"/> Sổ y bạ điện tử - {selectedPatient?.name}</span>}
        placement="right"
        width={500}
        onClose={() => setIsHistoryVisible(false)}
        open={isHistoryVisible}
      >
        <Spin spinning={loadingHistory} tip="Đang tải dữ liệu...">
          {patientHistory.length === 0 ? (
            <Empty description="Bệnh nhân chưa có lịch sử khám trước đây." />
          ) : (
            <Timeline
              items={patientHistory.map((record, index) => ({
                color: index === 0 ? 'blue' : 'gray',
                children: (
                  <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="font-bold text-gray-700 border-b pb-2 mb-2">
                      Khám ngày: {dayjs(record.exam_date).format('DD/MM/YYYY HH:mm')}
                    </div>
                    <div><Text strong>Chẩn đoán:</Text> <Text className="text-red-600">{record.diagnosis || 'Chưa có'}</Text></div>
                    <div className="mt-1"><Text strong>Ghi nhận:</Text> 
                      <div className="whitespace-pre-line text-sm text-gray-600 mt-1">{record.symptoms || 'Không có'}</div>
                    </div>
                    {record.doctor_notes && (
                      <div className="mt-1"><Text strong>Dặn dò:</Text> <Text className="italic text-gray-600">{record.doctor_notes}</Text></div>
                    )}
                  </div>
                )
              }))}
            />
          )}
        </Spin>
      </Drawer>
    </Row>
  );
}