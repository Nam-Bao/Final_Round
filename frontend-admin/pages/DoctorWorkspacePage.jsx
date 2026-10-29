import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, Divider, DatePicker, Drawer, Timeline, Spin, Empty, Image, Modal } from 'antd';
import { UserOutlined, ClockCircleOutlined, CheckCircleOutlined, MedicineBoxOutlined, FileTextOutlined, HistoryOutlined, SolutionOutlined, ScissorOutlined, ShoppingOutlined, VideoCameraOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import VideoCallModal from '../components/VideoCallModal';

const { Title, Text } = Typography;

const isOnlinePatient = (patient) => Boolean(patient?.pre_notes?.startsWith('[ONLINE]'));

export default function DoctorWorkspacePage() {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [spaServices, setSpaServices] = useState([]); 
  const [patients, setPatients] = useState([]);
  
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false); 
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  const [form] = Form.useForm();

  const fetchTodayAppointments = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('http://localhost:4000/api/booking/appointments/my-today', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data?.data) {
        setPatients(res.data.data.map(apt => ({
          id: apt.id, customer_id: apt.customer_id, patient_profile_id: apt.patient_profile_id, 
          name: apt.customer_name, dob: apt.dob, gender: apt.gender, time: String(apt.appointment_time).slice(0,5),
          status: apt.status, phone: apt.customer_phone, history: apt.symptoms || '',
          pre_notes: apt.pre_notes, pre_exam_images: apt.pre_exam_images || []
        })));
      }
    } catch (error) {}
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
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [medRes, sessionRes, aptRes] = await Promise.all([
        axios.get(`http://localhost:4000/api/identity/medical-records/${patientProfileId}`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`http://localhost:4000/api/booking/sessions/patient/${patientProfileId}`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`http://localhost:4000/api/booking/appointments/patient/${patientProfileId}`, { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      const medData = Array.isArray(medRes.data?.data) ? medRes.data.data : [];
      const sessionData = Array.isArray(sessionRes.data?.data) ? sessionRes.data.data : [];
      const aptData = Array.isArray(aptRes.data?.data) ? aptRes.data.data : [];

      const combinedHistory = [
        ...medData.map(r => {
          const apt = aptData.find(a => a.id === r.appointment_id);
          return { type: 'EXAM', date: r.exam_date, data: { ...r, prescribed_services: apt?.prescribed_services, prescribed_packages: apt?.prescribed_packages, prescribed_medicines: apt?.prescribed_medicines }, id: `exam_${r.id}` };
        }),
        ...sessionData.map(s => ({ type: 'TREATMENT', date: s.session_date, data: s, id: `session_${s.id}` }))
      ].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

      setPatientHistory(combinedHistory);
    } catch (error) {} finally { setLoadingHistory(false); }
  };

  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    form.resetFields();
    fetchPatientHistory(patient.patient_profile_id); 
    if (patient.status === 'WAITING') {
       try {
         const token = localStorage.getItem('admin_token');
         await axios.put(`http://localhost:4000/api/booking/appointments/${patient.id}`, { status: 'IN_PROGRESS' }, { headers: { 'Authorization': `Bearer ${token}` } });
         handleUpdateStatus('IN_PROGRESS', patient.id);
       } catch (e) {}
    }
  };

  const handleUpdateStatus = (status, id = selectedPatient?.id) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    if (selectedPatient && selectedPatient.id === id) setSelectedPatient(prev => ({ ...prev, status }));
  };

  const handleSubmitRecord = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${selectedPatient.id}/finish-exam`, {
        symptoms: values.symptoms, diagnosis: values.diagnosis, doctor_notes: values.doctor_notes,
        follow_up_date: values.follow_up_date ? values.follow_up_date.format('YYYY-MM-DD') : null, 
        spa_services: values.spa_services, treatment_package: values.treatment_package, prescriptions: values.prescriptions
      }, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã lưu Bệnh án! Đang chuyển ra màn hình Thu Ngân.');
      handleUpdateStatus('WAITING_FOR_SALE'); setSelectedPatient(null); fetchTodayAppointments(); 
    } catch (error) { message.error('Có lỗi xảy ra khi hoàn tất khám'); }
  };

  const tabItems = [
    { key: '1', label: <><FileTextOutlined /> Bệnh án & Chẩn đoán</>, children: (
        <div className="p-4 bg-white rounded-lg border border-gray-100">
          <Form.Item name="symptoms" label="Mô tả lâm sàng & Triệu chứng"><Input.TextArea rows={3}/></Form.Item>
          <Form.Item name="diagnosis" label="Chẩn đoán cuối cùng"><Input/></Form.Item>
          <Row gutter={16}>
            <Col span={16}><Form.Item name="doctor_notes" label="Dặn dò chăm sóc tại nhà"><Input.TextArea rows={2}/></Form.Item></Col>
            <Col span={8}><Form.Item name="follow_up_date" label="Ngày tái khám dự kiến"><DatePicker format="DD/MM/YYYY" className="w-full"/></Form.Item></Col>
          </Row>
        </div>
      )
    },
    { key: '2', label: <><MedicineBoxOutlined /> Lộ trình & Kê đơn</>, children: (
        <div className="p-4 bg-white rounded-lg border border-gray-100">
          <Form.Item name="spa_services" label={<span className="text-blue-700 font-medium">Chỉ định Dịch vụ Spa lẻ (Làm ngay)</span>}>
            <Select mode="multiple" allowClear>{spaServices.map(srv => <Select.Option key={srv.id} value={srv.id}>{srv.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="treatment_package" label={<span className="text-purple-700 font-medium">Chỉ định Gói Lộ Trình (VIP)</span>}>
            <Select allowClear>{packages.map(pkg => <Select.Option key={pkg.id} value={pkg.id}>{pkg.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="prescriptions" label={<span className="text-green-700 font-medium">Kê đơn Dược Mỹ Phẩm (Mua về)</span>}>
            <Select mode="multiple" allowClear>{products.map(prod => <Select.Option key={prod.id} value={prod.id}>{prod.name}</Select.Option>)}</Select>
          </Form.Item>
        </div>
      )
    }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={7} className="h-full">
        <Card title="Danh sách chờ (Hôm nay)" variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: 0, height: 'calc(100% - 55px)', overflowY: 'auto' } }}>
          <List itemLayout="horizontal" dataSource={patients} renderItem={(item) => (
              <List.Item onClick={() => handleSelectPatient(item)} className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedPatient?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}>
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} className={(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') ? 'bg-green-500' : 'bg-blue-500'} />}
                  title={<b className="text-gray-800">{item.name}</b>}
                  description={
                    <Space size="small" className="mt-1">
                      <Tag icon={<ClockCircleOutlined />} color="default">{item.time}</Tag>
                      {isOnlinePatient(item) && <Tag icon={<VideoCameraOutlined />} color="green">Online</Tag>}
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
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><MedicineBoxOutlined className="text-6xl mb-4 text-gray-200" /><Title level={4} type="secondary">Chưa chọn bệnh nhân</Title></div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
                <Space size="middle" align="start">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-blue-600 mt-1" />
                  <div>
                    <Title level={4} className="m-0 text-blue-700">{selectedPatient.name}</Title>
                    <div className="mt-1 mb-2"><Space split={<Divider type="vertical" />}>
                           <Text type="secondary">Tuổi: <span className="font-medium text-gray-700">{!selectedPatient.dob ? 'Chưa rõ' : dayjs().diff(dayjs(selectedPatient.dob), 'year')}</span></Text>
                           <Text type="secondary">Giới tính: <span className="font-medium text-gray-700">{selectedPatient.gender === 'MALE' ? 'Nam' : selectedPatient.gender === 'FEMALE' ? 'Nữ' : 'Khác'}</span></Text>
                           <Text type="secondary">SĐT: <span className="font-medium text-gray-700">{selectedPatient.phone}</span></Text>
                    </Space></div>
                    <div className="mt-2">
                       <Tag color={selectedPatient.status === 'WAITING_FOR_SALE' ? 'success' : 'processing'}>{selectedPatient.status === 'WAITING_FOR_SALE' ? 'Đã khám xong' : 'Đang tiến hành khám...'}</Tag>
                       <Button size="small" type="dashed" icon={<SolutionOutlined />} onClick={() => setIsNotesModalVisible(true)} className="ml-2">Xem Lời khai & Hình ảnh da</Button>
                    </div>
                  </div>
                </Space>
                <Space direction="vertical" align="end">
                  {isOnlinePatient(selectedPatient) && selectedPatient.status !== 'COMPLETED' && selectedPatient.status !== 'WAITING_FOR_SALE' && (
                    <Button type="primary" className="bg-green-600" icon={<VideoCameraOutlined />} onClick={() => setIsVideoOpen(true)}>Vào phòng khám online</Button>
                  )}
                  <Button type="default" icon={<HistoryOutlined />} onClick={() => setIsHistoryVisible(true)}>Tra cứu Sổ y bạ</Button>
                </Space>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                <Form form={form} layout="vertical" onFinish={handleSubmitRecord}>
                  <Tabs defaultActiveKey="1" items={tabItems} />
                  <Divider />
                  <div className="flex justify-end pb-4">
                    <Space>
                      <Button onClick={() => setSelectedPatient(null)}>Hủy bỏ</Button>
                      <Button type="primary" size="large" htmlType="submit" disabled={selectedPatient.status === 'COMPLETED' || selectedPatient.status === 'WAITING_FOR_SALE'} icon={<CheckCircleOutlined />}>Hoàn tất khám</Button>
                    </Space>
                  </div>
                </Form>
              </div>
            </div>
          )}
        </Card>
      </Col>

      <VideoCallModal
        open={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        appointmentId={selectedPatient?.id}
        patientName={selectedPatient?.name}
      />

      <Modal title="Thông tin sơ bộ từ CSKH" open={isNotesModalVisible} onCancel={() => setIsNotesModalVisible(false)} footer={<Button type="primary" onClick={() => setIsNotesModalVisible(false)}>Đóng</Button>} width={600}>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
           {selectedPatient?.pre_notes ? selectedPatient.pre_notes.split(' - ').map((n, i) => <div key={i} className="mb-2 text-gray-800"><span className="text-blue-500 mr-2">▪</span> {n}</div>) : <Text type="secondary italic">Chưa có ghi chú sơ bộ.</Text>}
           {selectedPatient?.pre_exam_images?.length > 0 && (
             <div className="mt-4 pt-4 border-t border-blue-200">
               <Text strong className="text-gray-700 block mb-3">📷 Hình ảnh da trước khám:</Text>
               <Image.PreviewGroup><Space size="middle" wrap>{selectedPatient.pre_exam_images.map((url, i) => <Image key={i} src={url} width={80} height={80} className="rounded-lg object-cover border shadow-sm" />)}</Space></Image.PreviewGroup>
             </div>
           )}
        </div>
      </Modal>

      <Drawer title={<span className="text-blue-700"><HistoryOutlined className="mr-2"/> Sổ y bạ điện tử</span>} placement="right" width={550} onClose={() => setIsHistoryVisible(false)} open={isHistoryVisible}>
        <Spin spinning={loadingHistory} description="Đang tải dữ liệu...">
          {patientHistory.length === 0 ? <Empty description="Bệnh nhân chưa có lịch sử khám." /> : (
            <Timeline items={patientHistory.map((item, index) => {
              if (item.type === 'EXAM') {
                 return { color: 'blue', dot: <MedicineBoxOutlined className="text-blue-600"/>,
                   children: (
                     <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                       <div className="font-bold text-blue-700 border-b border-blue-200 pb-2 mb-2">Khám ngày: {dayjs(item.date).format('DD/MM/YYYY')}</div>
                       <div><Text strong>Chẩn đoán:</Text> <Text className="text-red-600">{item.data.diagnosis || 'Chưa có'}</Text></div>
                       <div className="mt-1"><Text strong>Triệu chứng:</Text> <div className="whitespace-pre-line text-sm text-gray-700 mt-1">{item.data.symptoms || 'Không có'}</div></div>
                       
                       {(item.data.prescribed_services?.length > 0 || item.data.prescribed_packages?.length > 0 || item.data.prescribed_medicines?.length > 0) && (
                         <div className="mt-2 p-2 bg-white rounded border border-blue-100 text-xs">
                           <Text strong className="block mb-1 text-purple-700"><ShoppingOutlined/> Dịch vụ & Thuốc:</Text>
                           {item.data.prescribed_services?.length > 0 && <div>• {item.data.prescribed_services.map(id => spaServices.find(s=>s.id === id)?.name).join(', ')}</div>}
                           {item.data.prescribed_packages?.length > 0 && <div>• {item.data.prescribed_packages.map(id => packages.find(p=>p.id === id)?.name).join(', ')}</div>}
                           {item.data.prescribed_medicines?.length > 0 && <div>• {item.data.prescribed_medicines.map(id => products.find(p=>p.id === id)?.name).join(', ')}</div>}
                         </div>
                       )}

                       {item.data.pre_exam_images?.length > 0 && (
                          <div className="mt-2 flex gap-2">{item.data.pre_exam_images.map((img, i) => <Image key={i} src={img} width={40} height={40} className="rounded object-cover" />)}</div>
                       )}
                     </div>
                   )
                 }
              } else {
                 return { color: 'green', dot: <ScissorOutlined className="text-green-600"/>,
                   children: (
                     <div className="mb-4 bg-green-50 p-3 rounded-lg border border-green-200">
                       <div className="font-bold text-green-700 border-b border-green-200 pb-2 mb-2">Dịch vụ: {dayjs(item.date).format('DD/MM/YYYY')}</div>
                       <div><Text strong>Thực hiện:</Text> {item.data.service_name}</div>
                       <div className="mt-1"><Text strong>KTV Ghi chú:</Text> <Text className="text-gray-700">{item.data.technician_note}</Text></div>
                       {item.data.post_treatment_images?.length > 0 && (
                          <div className="mt-2 flex gap-2">{item.data.post_treatment_images.map((img, i) => <Image key={i} src={img} width={40} height={40} className="rounded object-cover" />)}</div>
                       )}
                     </div>
                   )
                 }
              }
            })} />
          )}
        </Spin>
      </Drawer>
    </Row>
  );
}