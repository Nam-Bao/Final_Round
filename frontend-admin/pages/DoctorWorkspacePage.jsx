import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, InputNumber, Select, Button, Space, Avatar, Typography, message, Divider, DatePicker, Drawer, Timeline, Spin, Empty, Image, Modal } from 'antd';
import { PrinterOutlined, PlusOutlined, MinusCircleOutlined, UserOutlined, ClockCircleOutlined, CheckCircleOutlined, MedicineBoxOutlined, FileTextOutlined, HistoryOutlined, SolutionOutlined, ScissorOutlined, ShoppingOutlined, VideoCameraOutlined, ScanOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { openVideoCall } from '../utils/videoCall';
import PatientSafetyPanel, { SafetyWarnings } from '../components/PatientSafetyPanel';
import PatientRecordDrawer from '../components/PatientRecordDrawer';
import AiSafetyReview from '../components/AiSafetyReview';
import SkinScanReview from '../components/SkinScanReview';
import { useLiveRefresh } from '../components/Notifications';
import { openPrint } from '../utils/print';
import { API_BASE } from '../config';

const { Title, Text } = Typography;

// Đơn thuốc: { product_id, quantity } (dữ liệu cũ là mã sản phẩm, mỗi mã = 1 sản phẩm)
const medicineLabel = (m, products) => {
  const id = typeof m === 'string' ? m : m?.product_id;
  const qty = typeof m === 'string' ? 1 : m?.quantity || 1;
  return `${products.find(p => p.id === id)?.name || 'Sản phẩm'} x${qty}`;
};

const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
// Gói có giá khuyến mãi thì hiện cả giá gốc để bác sĩ tư vấn
const packageLabel = (pkg) => {
  const promo = Number(pkg.promotional_price) > 0 && Number(pkg.promotional_price) < Number(pkg.price);
  const price = promo ? `${vnd(pkg.promotional_price)} (gốc ${vnd(pkg.price)})` : vnd(pkg.price);
  return `${pkg.name} — ${pkg.total_sessions || 1} buổi — ${price}`;
};

const isOnlinePatient =(patient) => Boolean(patient?.pre_notes?.includes('[ONLINE]')); // lịch đã dời có tiền tố trước [ONLINE]

export default function DoctorWorkspacePage() {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeTab, setActiveTab] = useState('1');
  const [scanStatus, setScanStatus] = useState({ count: 0, pending: false });
  const [openScanId, setOpenScanId] = useState(null); // mở sẵn hộp xác nhận khi hoàn tất khám bị chặn
  const [packages, setPackages] = useState([]);
  const [products, setProducts] = useState([]); 
  const [spaServices, setSpaServices] = useState([]); 
  const [patients, setPatients] = useState([]);
  
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false); 

  const [form] = Form.useForm();
  const [safetyWarnings, setSafetyWarnings] = useState([]);   // cảnh báo theo đơn đang kê
  const [safetyPending, setSafetyPending] = useState(null);   // đơn đang chờ bác sĩ ghi lý do
  const [safetyReason, setSafetyReason] = useState('');
  const [safetyVersion, setSafetyVersion] = useState(0);      // tăng khi lưu sàng lọc để kiểm tra lại
  const watchedServices = Form.useWatch('spa_services', form);
  const watchedPackage = Form.useWatch('treatment_package', form);
  const watchedPrescriptions = Form.useWatch('prescriptions', form);

  // Tạm tính số tiền khách trả để bác sĩ tư vấn: cùng cách tính với hoá đơn CSKH chốt (gói lấy giá khuyến mãi nếu có).
  // Chưa gồm voucher: CSKH áp tại quầy khi thu tiền.
  const estimate = (() => {
    const services = (watchedServices || []).map((id) => spaServices.find((x) => x.id === id)).filter(Boolean);
    const pkg = packages.find((x) => x.id === watchedPackage);
    const pkgPrice = pkg ? Number(Number(pkg.promotional_price) > 0 ? pkg.promotional_price : pkg.price) : 0;
    const lines = (watchedPrescriptions || []).filter((p) => p?.product_id).map((p) => {
      const prod = products.find((x) => x.id === p.product_id);
      return prod ? { name: prod.name, quantity: p.quantity || 1, amount: Number(prod.price) * (p.quantity || 1) } : null;
    }).filter(Boolean);
    const examFee = Number(selectedPatient?.exam_fee || 0);
    const servicesTotal = services.reduce((sum, x) => sum + Number(x.price), 0);
    const productsTotal = lines.reduce((sum, x) => sum + x.amount, 0);
    const total = examFee + servicesTotal + pkgPrice + productsTotal;
    const deposit = Math.min(Number(selectedPatient?.deposit_paid || 0), total);
    return { examFee, services, pkg, pkgPrice, lines, servicesTotal, productsTotal, total, deposit, due: total - deposit };
  })();

  // Kiểm tra ngay khi bác sĩ chọn dịch vụ / gói / sản phẩm
  useEffect(() => {
    const prescriptions = (watchedPrescriptions || []).filter((p) => p?.product_id);
    if (!selectedPatient?.patient_profile_id) { setSafetyWarnings([]); return undefined; }
    const timer = setTimeout(() => {
      axios.post(`${API_BASE}/api/booking/safety/check`, {
        patient_profile_id: selectedPatient.patient_profile_id, spa_services: watchedServices || [], treatment_package: watchedPackage, prescriptions,
      }, { headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } })
        .then((r) => setSafetyWarnings(r.data.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedPatient?.patient_profile_id, watchedServices, watchedPackage, watchedPrescriptions, safetyVersion]);

  const fetchTodayAppointments = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.get(`${API_BASE}/api/booking/appointments/my-today`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data?.data) {
        setPatients(res.data.data.map(apt => ({
          id: apt.id, customer_id: apt.customer_id, patient_profile_id: apt.patient_profile_id, 
          name: apt.customer_name, dob: apt.dob, gender: apt.gender, time: String(apt.appointment_time).slice(0,5),
          status: apt.status, phone: apt.customer_phone, history: apt.symptoms || '',
          pre_notes: apt.pre_notes, pre_exam_images: apt.pre_exam_images || [], pre_exam_image_meta: apt.pre_exam_image_meta || {}, ai_consent: apt.ai_consent || null,
          exam_fee: Number(apt.exam_fee || 0), deposit_paid: Number(apt.deposit_paid || 0), type: apt.type
        })));
      }
    } catch (error) {}
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/booking/packages`).then(res => res.json()).then(data => setPackages(data.data || []));
    fetch(`${API_BASE}/api/booking/spa-services`).then(res => res.json()).then(data => setSpaServices(data.data || []));
    fetch(`${API_BASE}/api/commerce/products`).then(res => res.json()).then(data => setProducts((data.data || []).filter(item => item.type === 'PRODUCT')));
    fetchTodayAppointments();
    // CSKH chuyển khách vào hàng chờ bất cứ lúc nào
    const timer = setInterval(fetchTodayAppointments, 30000);
    return () => clearInterval(timer);
  }, []);
  useLiveRefresh(['appointments'], fetchTodayAppointments); // CSKH chuyển khách vào hàng chờ: hiện ngay



  const handleSelectPatient = async (patient) => {
    setSelectedPatient(patient);
    setActiveTab('1'); setOpenScanId(null); setScanStatus({ count: 0, pending: false });
    form.resetFields();
  };

  // Mở hồ sơ chỉ để xem; bác sĩ bấm nút thì mới chuyển trạng thái, CSKH dựa vào đó để biết phòng đang có khách
  const changeExamState = async (action, status) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      await axios.put(`${API_BASE}/api/booking/appointments/${selectedPatient.id}/${action}`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      handleUpdateStatus(status);
      fetchTodayAppointments();
    } catch (error) { message.error(error.response?.data?.message || 'Không chuyển được trạng thái'); }
  };

  const handleUpdateStatus = (status, id = selectedPatient?.id) => {
    setPatients(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    if (selectedPatient && selectedPatient.id === id) setSelectedPatient(prev => ({ ...prev, status }));
  };

  // Chọn sản phẩm => điền sẵn "Cách dùng" từ hướng dẫn sử dụng của sản phẩm (bác sĩ sửa lại cho từng khách)
  const fillUsage = async (fieldName, productId) => {
    if (!productId || form.getFieldValue(['prescriptions', fieldName, 'usage'])) return;
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.get(`${API_BASE}/api/commerce/products/print-info`, { params: { ids: productId }, headers: { Authorization: `Bearer ${token}` } });
      const usage = res.data.data?.[0]?.usage;
      if (usage && !form.getFieldValue(['prescriptions', fieldName, 'usage'])) form.setFieldValue(['prescriptions', fieldName, 'usage'], usage);
    } catch { /* không có hướng dẫn thì bác sĩ tự ghi */ }
  };

  const handleSubmitRecord = async (values, safety_reason) => {
    try {
      const examId = selectedPatient.id;
      const token = sessionStorage.getItem('admin_token');
      await axios.put(`${API_BASE}/api/booking/appointments/${selectedPatient.id}/finish-exam`, {
        symptoms: values.symptoms, diagnosis: values.diagnosis, doctor_notes: values.doctor_notes,
        follow_up_date: values.follow_up_date ? values.follow_up_date.format('YYYY-MM-DD') : null, 
        spa_services: values.spa_services, treatment_package: values.treatment_package,
        prescriptions: (values.prescriptions || []).filter(p => p?.product_id), // [{ product_id, quantity, usage }]
        safety_reason
      }, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã lưu Bệnh án! Đang chuyển ra màn hình Thu Ngân.');
      Modal.confirm({ title: 'Đã lưu bệnh án', content: 'In đơn thuốc / chỉ định điều trị để đưa khách?', okText: 'In đơn', cancelText: 'Để sau', icon: <PrinterOutlined />, onOk: () => openPrint('prescription', examId) });
      setSafetyPending(null); setSafetyReason('');
      handleUpdateStatus('WAITING_FOR_SALE'); setSelectedPatient(null); fetchTodayAppointments();
    } catch (error) {
      if (error.response?.data?.code === 'SAFETY_WARNINGS') { setSafetyPending({ values, warnings: error.response.data.warnings }); return; }
      message.error(error.response?.data?.message || 'Có lỗi xảy ra khi hoàn tất khám');
    }
  };

  // Lượt soi da AI chưa xác nhận: chỉ nhắc, không chặn (khách da nặng cần thời gian, bác sĩ xác nhận sau trong tab Soi da AI)
  const submitWithScanCheck = (values) => {
    if (!scanStatus.pending) return handleSubmitRecord(values);
    Modal.confirm({
      title: 'Lượt soi da AI của khách chưa được xác nhận',
      content: 'Bạn có thể hoàn tất khám ngay và xác nhận kết quả soi da sau (tab "Soi da AI" khi mở lại hồ sơ khách). Khách vẫn xem kết quả AI cho tới khi bác sĩ xác nhận.',
      okText: 'Hoàn tất khám, xác nhận sau',
      cancelText: 'Xác nhận ngay',
      onOk: () => handleSubmitRecord(values),
      onCancel: () => { setActiveTab('3'); setOpenScanId(`${scanStatus.latestId}#${Date.now()}`); },
    });
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
          <PatientSafetyPanel key={selectedPatient?.patient_profile_id} patientProfileId={selectedPatient?.patient_profile_id} onSaved={() => setSafetyVersion((v) => v + 1)} />
          <SafetyWarnings warnings={safetyWarnings} />
          <Form.Item name="spa_services" label={<span className="text-blue-700 font-medium">Chỉ định Dịch vụ Spa lẻ (Làm ngay)</span>}>
            <Select mode="multiple" allowClear>{spaServices.map(srv => <Select.Option key={srv.id} value={srv.id}>{`${srv.name} — ${vnd(srv.price)}`}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="treatment_package" label={<span className="text-purple-700 font-medium">Chỉ định Gói Lộ Trình (VIP)</span>}>
            <Select allowClear>{packages.map(pkg => <Select.Option key={pkg.id} value={pkg.id}>{packageLabel(pkg)}</Select.Option>)}</Select>
          </Form.Item>
          <Text className="text-green-700 font-medium block mb-2">Kê đơn Dược Mỹ Phẩm (Mua về)</Text>
          <Form.List name="prescriptions">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="flex mb-1" wrap>
                    <Form.Item name={[field.name, 'product_id']} rules={[{ required: true, message: 'Chọn sản phẩm' }]} className="mb-2">
                      <Select showSearch optionFilterProp="children" placeholder="Chọn sản phẩm" style={{ width: 340 }} onChange={(v) => fillUsage(field.name, v)}>
                        {products.map(prod => <Select.Option key={prod.id} value={prod.id}>{`${prod.name} — ${vnd(prod.price)}`}</Select.Option>)}
                      </Select>
                    </Form.Item>
                    <Form.Item name={[field.name, 'quantity']} initialValue={1} className="mb-2">
                      <InputNumber min={1} max={20} addonAfter="SL" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'usage']} className="mb-2">
                      <Input maxLength={300} placeholder="Cách dùng (VD: Tối, sau rửa mặt, chấm lên nốt mụn)" style={{ width: 360 }} />
                    </Form.Item>
                    <MinusCircleOutlined className="text-red-500" onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ quantity: 1 })} icon={<PlusOutlined />}>Thêm sản phẩm</Button>
              </>
            )}
          </Form.List>

          <div className="mt-4">
            <AiSafetyReview key={selectedPatient?.id} patientProfileId={selectedPatient?.patient_profile_id} appointmentId={selectedPatient?.id} form={form} products={products} />
          </div>

          <div className="mt-4 p-3 rounded-lg border border-blue-200 bg-blue-50">
            <Text strong className="block mb-2 text-blue-800">Tạm tính chi phí của khách</Text>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span>Phí khám</span><span>{estimate.examFee ? vnd(estimate.examFee) : 'Miễn phí (khách cũ / tái khám)'}</span></div>
              {estimate.services.map((x) => <div key={x.id} className="flex justify-between"><span>{x.name}</span><span>{vnd(x.price)}</span></div>)}
              {estimate.pkg && <div className="flex justify-between"><span>Gói {estimate.pkg.name}</span><span>{vnd(estimate.pkgPrice)}</span></div>}
              {estimate.lines.map((x, i) => <div key={i} className="flex justify-between"><span>{x.name} × {x.quantity}</span><span>{vnd(x.amount)}</span></div>)}
              <div className="flex justify-between border-t border-blue-200 pt-1 font-semibold"><span>Tổng</span><span>{vnd(estimate.total)}</span></div>
              {estimate.deposit > 0 && <div className="flex justify-between text-green-700"><span>Đã cọc khi đặt lịch</span><span>- {vnd(estimate.deposit)}</span></div>}
              <div className="flex justify-between text-base font-bold text-blue-800"><span>Khách cần trả thêm tại quầy</span><span>{vnd(estimate.due)}</span></div>
            </div>
            <Text type="secondary" className="block text-xs mt-2">Chưa gồm voucher ưu đãi (CSKH áp khi thu tiền). Gói liệu trình tính theo giá khuyến mãi nếu đang có.</Text>
          </div>
        </div>
      )
    },
    { key: '3', label: <span><ScanOutlined /> Soi da AI {scanStatus.pending ? <Tag color="orange" className="ml-1">cần xác nhận</Tag> : scanStatus.count ? <Tag className="ml-1">{scanStatus.count}</Tag> : null}</span>, forceRender: true, children: (
        <div className="p-4 bg-white rounded-lg border border-gray-100">
          {selectedPatient?.patient_profile_id
            ? <SkinScanReview key={selectedPatient.patient_profile_id} patientProfileId={selectedPatient.patient_profile_id} appointmentId={selectedPatient.id} appointment={selectedPatient} openScanId={openScanId?.split('#')[0]} openSignal={openScanId} onStatus={setScanStatus} />
            : <Empty description="Lịch hẹn chưa gắn hồ sơ người khám" />}
        </div>
      )
    },
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={7} className="h-full">
        <Card title={`Hàng chờ hôm nay (${patients.filter((p) => p.status === 'WAITING').length} khách chờ)`} variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: 0, height: 'calc(100% - 55px)', overflowY: 'auto' } }}>
          <List itemLayout="horizontal" dataSource={patients} renderItem={(item) => (
              <List.Item onClick={() => handleSelectPatient(item)} className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedPatient?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}>
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} className={(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') ? 'bg-green-500' : 'bg-blue-500'} />}
                  title={<b className="text-gray-800">{item.name}</b>}
                  description={
                    <Space size="small" className="mt-1">
                      <Tag icon={<ClockCircleOutlined />} color="default">{item.time}</Tag>
                      {isOnlinePatient(item) && <Tag icon={<VideoCameraOutlined />} color="green">Online</Tag>}
                      {item.status === 'WAITING' && <Tag color="warning">Thứ tự {patients.filter((p) => p.status === 'WAITING').indexOf(item) + 1}</Tag>}
                      {item.status === 'IN_PROGRESS' && <Tag color="processing">Đang khám</Tag>}
                      {(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') && <Tag color="success">Đã xong</Tag>}
                      {(item.status === 'COMPLETED' || item.status === 'WAITING_FOR_SALE') && <Button size="small" icon={<PrinterOutlined />} onClick={(e) => { e.stopPropagation(); openPrint('prescription', item.id); }}>In đơn</Button>}
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
                       <Tag color={selectedPatient.status === 'IN_PROGRESS' ? 'processing' : selectedPatient.status === 'WAITING' ? 'warning' : 'success'}>{selectedPatient.status === 'IN_PROGRESS' ? 'Đang khám' : selectedPatient.status === 'WAITING' ? 'Đang chờ' : 'Đã khám xong'}</Tag>
                       <Button size="small" type="dashed" icon={<SolutionOutlined />} onClick={() => setIsNotesModalVisible(true)} className="ml-2">Xem Lời khai & Hình ảnh da</Button>
                    </div>
                  </div>
                </Space>
                <Space direction="vertical" align="end">
                  {selectedPatient.status === 'WAITING' && <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => changeExamState('start-exam', 'IN_PROGRESS')}>Bắt đầu khám</Button>}
                  {selectedPatient.status === 'IN_PROGRESS' && <Button onClick={() => changeExamState('return-to-queue', 'WAITING')}>Trả về hàng chờ</Button>}
                  {isOnlinePatient(selectedPatient) && selectedPatient.status === 'IN_PROGRESS' && (
                    <Button type="primary" className="bg-green-600" icon={<VideoCameraOutlined />} onClick={() => openVideoCall({ id: selectedPatient.id, name: selectedPatient.name })}>Vào phòng khám online</Button>
                  )}
                  <Button type="default" icon={<HistoryOutlined />} onClick={() => setIsHistoryVisible(true)}>Tra cứu Sổ y bạ</Button>
                </Space>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                <Form form={form} layout="vertical" onFinish={submitWithScanCheck}>
                  <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
                  <Divider />
                  <div className="flex justify-end pb-4">
                    <Space>
                      <Button onClick={() => setSelectedPatient(null)}>Hủy bỏ</Button>
                      <Button type="primary" size="large" htmlType="submit" disabled={selectedPatient.status !== 'IN_PROGRESS'} icon={<CheckCircleOutlined />}>Hoàn tất khám</Button>
                    </Space>
                  </div>
                </Form>
              </div>
            </div>
          )}
        </Card>
      </Col>

      <Modal title="Thông tin sơ bộ từ CSKH" open={isNotesModalVisible} onCancel={() => setIsNotesModalVisible(false)} footer={<Button type="primary" onClick={() => setIsNotesModalVisible(false)}>Đóng</Button>} width={600}>
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
           {selectedPatient?.pre_notes ? selectedPatient.pre_notes.split(' - ').map((n, i) => <div key={i} className="mb-2 text-gray-800"><span className="text-blue-500 mr-2">▪</span> {n}</div>) : <Text type="secondary italic">Chưa có ghi chú sơ bộ.</Text>}
           {selectedPatient?.pre_exam_images?.length > 0 && (
             <div className="mt-4 pt-4 border-t border-blue-200">
               <Text strong className="text-gray-700 block mb-3">📷 Hình ảnh da trước khám:</Text>
               <Image.PreviewGroup><Space size="middle" wrap>{selectedPatient.pre_exam_images.map((url, i) => {
                 const m = selectedPatient.pre_exam_image_meta?.[url];
                 return (
                   <div key={i} className="text-center">
                     <Image src={url} width={80} height={80} className="rounded-lg object-cover border shadow-sm" />
                     <div className="text-[11px] text-gray-500">{m?.source === 'customer' ? 'Khách tự tải' : m?.source === 'chat' ? 'Khách gửi qua chat' : 'CSKH chụp'}{m?.angle ? ` · ${{ front: 'Chính diện', left: 'Má trái', right: 'Má phải' }[m.angle]}` : ''}</div>
                   </div>
                 );
               })}</Space></Image.PreviewGroup>
             </div>
           )}
        </div>
      </Modal>

      {/* Sổ y bạ đầy đủ (gom từ mọi service) + AI tóm tắt hồ sơ khi khách đã đồng ý */}
      <PatientRecordDrawer open={isHistoryVisible} profileId={selectedPatient?.patient_profile_id} onClose={() => setIsHistoryVisible(false)} />
      <Modal title={safetyPending?.warnings?.some((w) => w.source === 'AI') ? 'Đơn kê có cảnh báo an toàn (gồm cảnh báo của AI rà soát)' : 'Đơn kê có cảnh báo an toàn'} open={!!safetyPending} width={640} okText="Vẫn kê, lưu lý do" cancelText="Sửa lại đơn"
        okButtonProps={{ danger: true, disabled: safetyReason.trim().length < 10 }} onCancel={() => setSafetyPending(null)}
        onOk={() => handleSubmitRecord(safetyPending.values, safetyReason)}>
        <SafetyWarnings warnings={safetyPending?.warnings} />
        <Input.TextArea rows={3} maxLength={1000} value={safetyReason} onChange={(e) => setSafetyReason(e.target.value)} placeholder="Lý do vẫn kê (ít nhất 10 ký tự), sẽ lưu vào hồ sơ" />
      </Modal>
    </Row>
  );
}