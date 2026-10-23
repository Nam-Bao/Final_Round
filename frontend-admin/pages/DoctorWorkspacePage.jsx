import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, Divider, DatePicker, Drawer, Timeline, Spin, Empty, Image, Modal } from 'antd';
import { UserOutlined, ClockCircleOutlined, CheckCircleOutlined, MedicineBoxOutlined, FileTextOutlined, HistoryOutlined, SolutionOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DoctorWorkspacePage() {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [spaServices, setSpaServices] = useState([]); 
  const [patients, setPatients] = useState([]);
  
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false); // State cho Modal Lời khai
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [form] = Form.useForm();

  const fetchTodayAppointments = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('http://localhost:4000/api/booking/appointments/my-today', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.data?.data) {
        const formattedPatients = res.data.data.map(apt => ({
          id: apt.id,
          customer_id: apt.customer_id, 
          patient_profile_id: apt.patient_profile_id, // Lấy ID hồ sơ thực sự
          name: apt.customer_name, 
          dob: apt.dob,
          gender: apt.gender,
          time: String(apt.appointment_time).slice(0,5),
          status: apt.status,
          phone: apt.customer_phone, 
          history: apt.symptoms || '',
          pre_notes: apt.pre_notes,
          pre_exam_images: apt.pre_exam_images || []
        }));
        setPatients(formattedPatients);
      }
    } catch (error) {
      console.error('Lỗi tải danh sách bệnh nhân', error);
    }
  };

  useEffect(() => {
    fetch('http://localhost:4000/api/booking/packages').then(res => res.json()).then(data => setPackages(data.data || []));
    fetch('http://localhost:4000/api/booking/spa-services').then(res => res.json()).then(data => setSpaServices(data.data || []));
    fetch('http://localhost:4000/api/commerce/products').then(res => res.json()).then(data => setProducts((data.data || []).filter(item => item.type === 'PRODUCT')));
    fetchTodayAppointments();
  }, []);

  const fetchPatientHistory = async (patientProfileId) => {
    setLoadingHistory(true);
    try {
      const token = localStorage.getItem('admin_token');
      // Sửa lỗi: Gọi đúng ID của hồ sơ y tế (patientProfileId), không gọi customer_id
      const res = await axios.get(`http://localhost:4000/api/identity/medical-records/${patientProfileId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setPatientHistory(res.data?.data || []);
    } catch (error) { setPatientHistory([]); } 
    finally { setLoadingHistory(false); }
  };

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    form.resetFields();
    fetchPatientHistory(patient.patient_profile_id); // Đã truyền đúng ID

    if (patient.status === 'WAITING') {
       try {
         const token = localStorage.getItem('admin_token');
         await axios.put(`http://localhost:4000/api/booking/appointments/${patient.id}`, { status: 'IN_PROGRESS' }, { headers: { 'Authorization': `Bearer ${token}` } });
         handleUpdateStatus('IN_PROGRESS', patient.id);
       } catch (e) { console.warn("Lỗi update trạng thái IN_PROGRESS"); }
    }
  };

  const handleUpdateStatus = (status, id = selectedPatient?.id) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    if (selectedPatient && selectedPatient.id === id) {
        setSelectedPatient(prev => ({ ...prev, status }));
    }
  };

  const handleSubmitRecord = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${selectedPatient.id}/finish-exam`, {
        symptoms: values.symptoms,
        diagnosis: values.diagnosis,
        doctor_notes: values.doctor_notes,
        follow_up_date: values.follow_up_date ? values.follow_up_date.format('YYYY-MM-DD') : null, 
        spa_services: values.spa_services,
        treatment_package: values.treatment_package,
        prescriptions: values.prescriptions
      }, { headers: { 'Authorization': `Bearer ${token}` } });

      message.success('Đã lưu Bệnh án! Đang chuyển ra màn hình Thu Ngân / Chốt Sale.');
      handleUpdateStatus('WAITING_FOR_SALE'); 
      setSelectedPatient(null); 
      fetchTodayAppointments(); 
    } catch (error) { message.error('Có lỗi xảy ra khi hoàn tất khám'); }
  };

  const calculateAge = (dob) => {
    if (!dob) return 'Chưa rõ';
    return dayjs().diff(dayjs(dob), 'year') + ' tuổi';
  };

  const formatGender = (gender) => {
    if (gender === 'MALE') return 'Nam';
    if (gender === 'FEMALE') return 'Nữ';
    return 'Khác';
  };

  const tabItems = [
    {
      key: '1',
      label: <><FileTextOutlined /> Bệnh án & Chẩn đoán</>,
      children: (
        <div className="p-4 bg-white rounded-lg border border-gray-100">
          <Form.Item name="symptoms" label="Mô tả lâm sàng & Triệu chứng">
            <Input.TextArea rows={3} placeholder="VD: Da tiết nhiều dầu vùng chữ T..." />
          </Form.Item>
          <Form.Item name="diagnosis" label="Chẩn đoán cuối cùng">
            <Input placeholder="VD: Mụn trứng cá cấp độ 3 - Da nhạy cảm" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="doctor_notes" label="Dặn dò chăm sóc tại nhà">
                <Input.TextArea rows={2} placeholder="VD: Kiêng đồ cay nóng, chống nắng kỹ..." />
              </Form.Item>
            </Col>
            <Col span={8}>
               <Form.Item name="follow_up_date" label="Ngày tái khám dự kiến">
                 <DatePicker format="DD/MM/YYYY" className="w-full" placeholder="Chọn ngày" />
               </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: '2',
      label: <><MedicineBoxOutlined /> Lộ trình & Kê đơn (Chuyển Thu ngân)</>,
      children: (
        <div className="p-4 bg-white rounded-lg border border-gray-100">
          <Form.Item name="spa_services" label={<span className="text-blue-700 font-medium">Chỉ định Dịch vụ Spa lẻ (Làm ngay)</span>}>
            <Select mode="multiple" placeholder="-- Chọn dịch vụ --" allowClear>
              {spaServices.map(srv => <Select.Option key={srv.id} value={srv.id}>{srv.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="treatment_package" label={<span className="text-purple-700 font-medium">Chỉ định Gói Lộ Trình (VIP)</span>}>
            <Select placeholder="-- Chọn lộ trình dài hạn --" allowClear>
              {packages.map(pkg => <Select.Option key={pkg.id} value={pkg.id}>{pkg.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="prescriptions" label={<span className="text-green-700 font-medium">Kê đơn Dược Mỹ Phẩm (Mua về)</span>}>
            <Select mode="multiple" placeholder="-- Chọn dược mỹ phẩm --" allowClear>
              {products.map(prod => <Select.Option key={prod.id} value={prod.id}>{prod.name}</Select.Option>)}
            </Select>
          </Form.Item>
        </div>
      ),
    }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
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
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
                <Space size="middle" align="start">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-blue-600 mt-1" />
                  <div>
                    <Title level={4} className="m-0 text-blue-700">{selectedPatient.name}</Title>
                    <div className="mt-1 mb-2">
                        <Space split={<Divider type="vertical" />}>
                           <Text type="secondary">Tuổi: <span className="font-medium text-gray-700">{calculateAge(selectedPatient.dob)}</span></Text>
                           <Text type="secondary">Giới tính: <span className="font-medium text-gray-700">{formatGender(selectedPatient.gender)}</span></Text>
                           <Text type="secondary">SĐT: <span className="font-medium text-gray-700">{selectedPatient.phone}</span></Text>
                        </Space>
                    </div>
                    <div className="mt-2">
                       <Tag color={selectedPatient.status === 'WAITING_FOR_SALE' ? 'success' : 'processing'}>
                          {selectedPatient.status === 'WAITING_FOR_SALE' ? 'Đã khám xong' : 'Đang tiến hành khám...'}
                       </Tag>
                       <Button size="small" type="dashed" icon={<SolutionOutlined />} onClick={() => setIsNotesModalVisible(true)} className="ml-2">
                         Xem Lời khai & Hình ảnh da
                       </Button>
                    </div>
                  </div>
                </Space>
                <Button type="default" icon={<HistoryOutlined />} onClick={() => setIsHistoryVisible(true)}>Tra cứu Sổ y bạ</Button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                <Form form={form} layout="vertical" onFinish={handleSubmitRecord}>
                  <Tabs defaultActiveKey="1" items={tabItems} />
                  <Divider />
                  <div className="flex justify-end pb-4">
                    <Space>
                      <Button onClick={() => setSelectedPatient(null)}>Hủy bỏ</Button>
                      <Button type="primary" size="large" htmlType="submit" disabled={selectedPatient.status === 'COMPLETED' || selectedPatient.status === 'WAITING_FOR_SALE'} icon={<CheckCircleOutlined />}>
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

      {/* MODAL LỜI KHAI SƠ BỘ */}
      <Modal title="Thông tin sơ bộ từ CSKH" open={isNotesModalVisible} onCancel={() => setIsNotesModalVisible(false)} footer={<Button type="primary" onClick={() => setIsNotesModalVisible(false)}>Đóng</Button>} width={600}>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
           {selectedPatient?.pre_notes ? (
             selectedPatient.pre_notes.split(' - ').map((note, index) => (
               <div key={index} className="mb-2 text-gray-800"><span className="text-blue-500 mr-2">▪</span> {note}</div>
             ))
           ) : <Text type="secondary italic">Chưa có ghi chú sơ bộ.</Text>}
           
           {selectedPatient?.pre_exam_images && selectedPatient.pre_exam_images.length > 0 && (
             <div className="mt-4 pt-4 border-t border-blue-200">
               <Text strong className="text-gray-700 block mb-3">📷 Hình ảnh da trước khám:</Text>
               <Image.PreviewGroup>
                  <Space size="middle" wrap>
                    {selectedPatient.pre_exam_images.map((url, i) => (
                       <Image key={i} src={url} width={80} height={80} className="rounded-lg object-cover border border-gray-300 shadow-sm" />
                    ))}
                  </Space>
               </Image.PreviewGroup>
             </div>
           )}
        </div>
      </Modal>

      <Drawer title={<span className="text-blue-700"><HistoryOutlined className="mr-2"/> Sổ y bạ điện tử</span>} placement="right" width={500} onClose={() => setIsHistoryVisible(false)} open={isHistoryVisible}>
        <Spin spinning={loadingHistory} description="Đang tải dữ liệu...">
          {patientHistory.length === 0 ? <Empty description="Bệnh nhân chưa có lịch sử khám." /> : (
            <Timeline items={patientHistory.map((record, index) => ({
                color: index === 0 ? 'blue' : 'gray',
                children: (
                  <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="font-bold text-gray-700 border-b pb-2 mb-2">Khám ngày: {dayjs(record.exam_date).format('DD/MM/YYYY HH:mm')}</div>
                    <div><Text strong>Chẩn đoán:</Text> <Text className="text-red-600">{record.diagnosis || 'Chưa có'}</Text></div>
                    <div className="mt-1"><Text strong>Ghi nhận:</Text> <div className="whitespace-pre-line text-sm text-gray-600 mt-1">{record.symptoms || 'Không có'}</div></div>
                    {record.doctor_notes && <div className="mt-1"><Text strong>Dặn dò:</Text> <Text className="italic text-gray-600">{record.doctor_notes}</Text></div>}
                  </div>
                )
              }))} />
          )}
        </Spin>
      </Drawer>
    </Row>
  );
}