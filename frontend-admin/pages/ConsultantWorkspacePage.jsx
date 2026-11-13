import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, DatePicker, Alert, Upload, Modal, Radio } from 'antd';
import { UserOutlined, PhoneOutlined, SolutionOutlined, CheckCircleOutlined, ReloadOutlined, CameraOutlined, ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import WalkInModal from '../components/WalkInModal';
import PatientSafetyPanel from '../components/PatientSafetyPanel';
import { useLiveRefresh } from '../components/Notifications';

const { Title, Text } = Typography;
const { Search } = Input; // THÊM COMPONENT SEARCH
const DOCTOR_STATE = {
  FREE: { color: 'success', text: 'Đang rảnh' },
  BUSY: { color: 'processing', text: 'Đang khám' },
  QUEUED: { color: 'warning', text: 'Có khách chờ' },
  OFF_SHIFT: { color: 'default', text: 'Chưa vào ca' },
};

export default function ConsultantWorkspacePage() {
  const [activeTab, setActiveTab] = useState('checkIn'); 
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]); 
  const [form] = Form.useForm();
  
  const [uploadedImages, setUploadedImages] = useState([]);
  const [screened, setScreened] = useState(false); // đã xác nhận sàng lọc an toàn hôm nay
  const [queues, setQueues] = useState({ checkIn: [], walkIn: [], reschedule: [] });
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [doctorBoard, setDoctorBoard] = useState([]); // tình trạng bác sĩ còn ca hôm nay
  
  // STATE MỚI: Dùng để tìm kiếm khách hàng
  const [searchTerm, setSearchTerm] = useState('');

  const fetchQueues = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.get('http://localhost:4000/api/booking/appointments/consultant-queues', { headers: { 'Authorization': `Bearer ${token}` } });
      
      if (res.data.data) {
         const rawQueues = res.data.data;
         rawQueues.checkIn = rawQueues.checkIn.filter(apt => !apt.pre_notes?.includes('[ONLINE]'));
         setQueues(rawQueues);
      }
      const docRes = await axios.get('http://localhost:4000/api/identity/users/doctors', { headers: { 'Authorization': `Bearer ${token}` } });
      if (docRes.data.data) setDoctors(docRes.data.data);
    } catch (error) { console.error('Lỗi tải dữ liệu:', error); }
  };

  useEffect(() => { fetchQueues(); }, []);
  useLiveRefresh(['appointments'], fetchQueues);

  const fetchDoctorBoard = () => axios.get('http://localhost:4000/api/booking/appointments/walk-in/doctor-board', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` } })
    .then((res) => setDoctorBoard(res.data.data || []))
    .catch(() => message.error('Không tải được tình trạng bác sĩ'));

  // Mời khách vào phòng: có cảnh báo thì CSKH xác nhận rồi gửi lại
  const inviteWalkIn = async (payload, confirm_warnings = false) => {
    const invited = () => { message.success('Đã mời khách vào phòng khám!'); setSelectedCustomer(null); fetchQueues(); };
    try {
      await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/invite`, { ...payload, confirm_warnings }, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` } });
      invited();
    } catch (error) {
      const data = error.response?.data;
      if (data?.code !== 'NEEDS_CONFIRM') { message.error(data?.message || 'Không mời được khách'); return; }
      Modal.confirm({
        title: 'Vẫn mời khách vào phòng này?',
        content: <ul className="list-disc pl-4">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>,
        okText: 'Vẫn mời', cancelText: 'Chọn lại',
        onOk: () => inviteWalkIn(payload, true),
        onCancel: fetchDoctorBoard,
      });
    }
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setScreened(false);
    form.resetFields();
    setUploadedImages([]); 
    
    if (activeTab === 'walkIn') {
      form.setFieldsValue({ reason: customer.symptoms });
      fetchDoctorBoard();
    }
    if (activeTab === 'reschedule') {
      form.setFieldsValue({
        doctor_id: customer.doctor_id,
        appointment_date: dayjs(customer.appointment_date),
        appointment_time: customer.appointment_time.slice(0, 5) 
      });
    }
  };

  const handleSubmitForm = async (values) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      
      if (activeTab === 'reschedule') {
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/reschedule`, {
          doctor_id: values.doctor_id, appointment_date: values.appointment_date.format('YYYY-MM-DD'), appointment_time: values.appointment_time, note: values.note
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã dời lịch & chốt Bác sĩ mới thành công!');
      }
      else if (activeTab === 'checkIn') {
        const payload = { ...values, pre_exam_images: uploadedImages };
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/pre-check`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã chuyển hồ sơ cho bác sĩ. Khách chờ tới lượt trong hàng chờ của bác sĩ.');
      } 
      else if (activeTab === 'walkIn') {
        await inviteWalkIn({ ...values, pre_exam_images: uploadedImages });
        return;
      }
      
      setSelectedCustomer(null);
      fetchQueues(); 
    } catch (error) { message.error(error.response?.data?.message || 'Có lỗi xảy ra khi xử lý hệ thống!'); } finally { setLoading(false); }
  };

  // Khách chờ lâu nên về: chưa khám thì không phát sinh tiền
  const handleWalkInLeft = () => Modal.confirm({
    title: `Ghi nhận ${selectedCustomer.customer_name} đã rời đi?`,
    content: 'Khách được đưa khỏi danh sách chờ và không phát sinh phí khám.',
    okText: 'Khách đã rời đi', okButtonProps: { danger: true }, cancelText: 'Đóng',
    onOk: async () => {
      try {
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/cancel`, { initiator: 'CUSTOMER', reason: 'Khách đến thẳng đã rời đi, chưa khám' }, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}` } });
        setSelectedCustomer(null);
        fetchQueues();
      } catch (error) { message.error(error.response?.data?.message || 'Không ghi nhận được'); }
    },
  });

  const handleCustomUpload = async ({ file, onSuccess, onError }) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const formData = new FormData();
      formData.append('image', file);
      
      const uploadRes = await fetch('http://localhost:4000/api/media/upload', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message || 'Tải ảnh thất bại!');
      
      setUploadedImages(prev => [...prev, uploadData.url]);
      onSuccess("ok");
      message.success('Tải ảnh lên máy chủ thành công!');
    } catch (err) { onError(err); message.error(err.message); }
  };

  const handleRemoveImage = (indexToRemove) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const RenderRescheduleForm = () => {
    const oldDoctorName = doctors.find(d => d.id === selectedCustomer?.doctor_id)?.Profile?.full_name || 'Bác sĩ không xác định';
    return (
      <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
        <Alert message="Yêu cầu dời lịch khẩn cấp" description={<div>Lịch hẹn bị gián đoạn do <b>BS. {oldDoctorName}</b> nghỉ đột xuất.</div>} type="error" showIcon className="mb-5 border-red-300 bg-red-50" />
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4 shadow-sm">
          <Title level={5} className="mt-0 text-blue-700">Thông tin xếp lại lịch</Title>
          <Form.Item name="doctor_id" label="Bác sĩ mới" rules={[{ required: true }]}><Select placeholder="-- Chọn Bác sĩ --">{doctors.map(d => (<Select.Option key={d.id} value={d.id}>{d.Profile?.full_name}</Select.Option>))}</Select></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="appointment_date" label="Ngày mới" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" className="w-full" /></Form.Item></Col>
            <Col span={12}><Form.Item name="appointment_time" label="Giờ mới" rules={[{ required: true }]}><Select placeholder="Chọn giờ"><Select.Option value="09:00">09:00</Select.Option><Select.Option value="10:00">10:00</Select.Option><Select.Option value="14:00">14:00</Select.Option><Select.Option value="15:00">15:00</Select.Option></Select></Form.Item></Col>
          </Row>
          <Form.Item name="note" label="Ghi chú CSKH"><Input.TextArea rows={2} className="w-full" /></Form.Item>
        </div>
        <div className="text-right"><Button type="primary" htmlType="submit" size="large" loading={loading} icon={<ReloadOutlined />}>Xác nhận Dời lịch</Button></div>
      </Form>
    );
  };

  const needsScreening = !!selectedCustomer?.patient_profile_id && !screened;
  const RenderPreDoctorForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
      <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
        <Title level={5} className="text-blue-700 m-0"><SolutionOutlined className="mr-2"/> Khai thác & Ghi nhận tình trạng da</Title>
        <Text type="secondary">Chụp ảnh da mặt thực tế và khai thác nhu cầu của khách tại quầy.</Text>
      </div>
      
      <Form.Item label={<b className="text-gray-700">Ảnh tình trạng da (Tối đa 5 ảnh)</b>}>
         <Upload listType="picture-card" customRequest={handleCustomUpload} showUploadList={false} accept="image/*">
           <div><CameraOutlined /><div style={{ marginTop: 8 }}>Chụp / Tải lên</div></div>
         </Upload>
         {uploadedImages.length > 0 && (
           <div className="flex flex-wrap gap-3 mt-3">
              {uploadedImages.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt={`Da ${i}`} className="w-20 h-20 rounded-lg object-cover border border-gray-300 shadow-sm" />
                  <button type="button" onClick={() => handleRemoveImage(i)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer">✕</button>
                </div>
              ))}
           </div>
         )}
      </Form.Item>
      
      {activeTab === 'walkIn' && (
        <Form.Item name="doctor_id" rules={[{ required: true, message: 'Chọn bác sĩ' }]}
          label={<span>Mời vào phòng bác sĩ <Button size="small" type="link" icon={<ReloadOutlined />} onClick={fetchDoctorBoard}>Tải lại</Button></span>}>
          <Radio.Group className="w-full">
            {doctorBoard.length === 0 && <Text type="secondary">Hiện không có bác sĩ còn ca hôm nay</Text>}
            {doctorBoard.map((d) => (
              <Radio key={d.doctor_id} value={d.doctor_id} className="!flex w-full border rounded-lg p-2 mb-2">
                <b>{d.doctor_name}</b> <Tag color={DOCTOR_STATE[d.state].color}>{DOCTOR_STATE[d.state].text}</Tag>
                <div className="text-xs text-gray-500">
                  {d.current && <div>Đang khám: {d.current.name}{d.current.started_at ? ` (từ ${dayjs(d.current.started_at).format('HH:mm')})` : ''}</div>}
                  {d.waiting.length > 0 && <div>Đang chờ: {d.waiting.join(', ')}</div>}
                  <div>{d.next_booked ? `Khách hẹn tiếp theo: ${d.next_booked.time} - ${d.next_booked.name}` : 'Không còn khách hẹn hôm nay'}</div>
                </div>
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
      )}

      <Form.Item name="reason" label="Lý do khám (Tình trạng mong muốn khắc phục)"><Input.TextArea rows={2} className="w-full" /></Form.Item>
      
      <Row gutter={16}>
        <Col span={12}><Form.Item name="current_skincare" label="Mỹ phẩm đang sử dụng"><Input.TextArea rows={1} className="w-full" /></Form.Item></Col>
        <Col span={12}>
          <Form.Item name="budget" label="Ngân sách dự kiến của khách"><Select placeholder="-- Đánh giá --"><Select.Option value="LOW">Thấp (Dưới 1 triệu)</Select.Option><Select.Option value="MEDIUM">Trung bình (1 - 3 triệu)</Select.Option><Select.Option value="HIGH">Cao</Select.Option></Select></Form.Item>
        </Col>
      </Row>

      <Form.Item name="pre_notes" label="Ghi chú nội bộ cho Bác sĩ"><Input.TextArea rows={2} className="w-full" /></Form.Item>
      
      <div className="text-right">
        {needsScreening && <div className="text-xs text-orange-600 mb-2">Bấm "Xác nhận đã hỏi khách" ở khung Sàng lọc an toàn trước khi chuyển hồ sơ.</div>}
        <Button type="primary" htmlType="submit" loading={loading} disabled={needsScreening} icon={<CheckCircleOutlined />}>{activeTab === 'walkIn' ? 'Mời Khách Vào Phòng' : 'Lưu Hồ Sơ & Chuyển Phòng Khám'}</Button>
      </div>
    </Form>
  );

  const queueTabs = [
    { key: 'checkIn', label: `👋 Khách đặt hôm nay (${queues.checkIn?.length || 0})` },
    { key: 'walkIn', label: `🪑 Danh sách chờ (${queues.walkIn?.length || 0})` },
    { key: 'reschedule', label: <span className="text-red-600 font-bold">🚨 Xử lý dời lịch ({queues.reschedule?.length || 0})</span> }
  ];

  // Logic Lọc danh sách theo ô tìm kiếm
  const currentList = queues[activeTab] || [];
  const filteredList = currentList.filter(item => 
    (item.customer_name && item.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.customer_phone && item.customer_phone.includes(searchTerm))
  );

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={8} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: '0 0 10px 0', height: '100%', display: 'flex', flexDirection: 'column' } }}>
          <div className="px-4 pt-2 border-b border-gray-200">
             <Button block type="primary" className="mb-2" onClick={() => setWalkInOpen(true)}>Tiếp nhận khách tại quầy</Button>
             <Tabs size="small" tabBarGutter={12} className="[&_.ant-tabs-nav-list]:!flex-wrap [&_.ant-tabs-nav-wrap]:!whitespace-normal [&_.ant-tabs-nav-operations]:!hidden [&_.ant-tabs-ink-bar]:!hidden [&_.ant-tabs-tab-active]:!border-b-2 [&_.ant-tabs-tab-active]:!border-blue-500" activeKey={activeTab} onChange={(key) => { setActiveTab(key); setSelectedCustomer(null); setSearchTerm(''); }} items={queueTabs} />
             {/* THANH TÌM KIẾM KHÁCH HÀNG */}
             <Search 
                placeholder="Tìm tên hoặc SĐT khách..." 
                allowClear 
                onChange={e => setSearchTerm(e.target.value)}
                value={searchTerm}
                className="mb-3"
             />
          </div>
          <div className="flex-1 overflow-y-auto">
            <List
              itemLayout="horizontal" dataSource={filteredList} locale={{ emptyText: 'Hiện không có khách hàng nào trong phễu này.' }}
              renderItem={(item) => (
                <List.Item onClick={() => handleSelectCustomer(item)} className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedCustomer?.id === item.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}>
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} className={activeTab === 'reschedule' ? 'bg-red-500' : 'bg-blue-500'} />}
                    title={<b className={activeTab === 'reschedule' ? "text-red-600" : "text-gray-800"}>{item.customer_name}</b>}
                    description={
                      <Space direction="vertical" size={0} className="w-full mt-1">
                        <Text type="secondary" className="text-xs"><PhoneOutlined /> {item.customer_phone}</Text>
                        <div className="mt-1 flex gap-2 flex-wrap">
                          {/* ĐÃ THÊM: HIỂN THỊ CA KHÁM (GIỜ) */}
                          <Tag icon={<ClockCircleOutlined />} color="default">{activeTab === 'walkIn' ? `Đến ${dayjs(item.arrived_at).format('HH:mm')}` : String(item.appointment_time).slice(0, 5)}</Tag>
                          {activeTab === 'walkIn' && <Tag color="warning">Đã chờ {dayjs().diff(dayjs(item.arrived_at), 'minute')} phút</Tag>}
                          {activeTab === 'walkIn' && <Tag color={item.exam_fee ? 'blue' : 'green'}>{item.exam_fee ? 'Thu phí sau khám' : 'Miễn phí khám'}</Tag>}
                          
                          {activeTab === 'reschedule' && <Tag color="error">Cần đổi lịch</Tag>}
                          {activeTab === 'checkIn' && <Tag color="processing">Đang chờ phục vụ</Tag>}
                        </div>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        </Card>
      </Col>
      <Col span={16} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm flex flex-col" styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}>
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <SolutionOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn khách hàng</Title>
              <Text>Hãy chọn một khách hàng từ phễu bên trái để xử lý.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className={`p-4 border-b flex justify-between items-center ${activeTab === 'reschedule' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <Space size="middle">
                  <Avatar size={50} icon={<UserOutlined />} className={activeTab === 'reschedule' ? 'bg-red-400' : 'bg-gray-400'} />
                  <div><Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title><Text type="secondary">SĐT: {selectedCustomer.customer_phone}</Text></div>
                </Space>
                {activeTab === 'walkIn' && <Button danger onClick={handleWalkInLeft}>Khách đã rời đi</Button>}
              </div>
              <div className="flex-1 p-6 overflow-y-auto overflow-x-hidden">
                {activeTab === 'reschedule' && <RenderRescheduleForm />}
                {(activeTab === 'checkIn' || activeTab === 'walkIn') && <PatientSafetyPanel key={selectedCustomer.id} patientProfileId={selectedCustomer.patient_profile_id} onStatus={setScreened} />}
                {(activeTab === 'checkIn' || activeTab === 'walkIn') && <RenderPreDoctorForm />}
              </div>
            </div>
          )}
        </Card>
      </Col>
      <WalkInModal open={walkInOpen} onClose={() => setWalkInOpen(false)} onDone={fetchQueues} />
    </Row>
  );
}