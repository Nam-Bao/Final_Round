import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message, DatePicker, Alert } from 'antd';
import { UserOutlined, PhoneOutlined, SolutionOutlined, CheckCircleOutlined, ReloadOutlined, FolderOpenOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ConsultantWorkspacePage() {
  const [activeTab, setActiveTab] = useState('reschedule'); 
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]); 
  const [form] = Form.useForm();

  // Đổi tên hotLeads thành profiles ở giao diện (Backend vẫn trả về hotLeads)
  const [queues, setQueues] = useState({ checkIn: [], hotLeads: [], followUp: [], reschedule: [] });

  const fetchQueues = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('http://localhost:4000/api/booking/appointments/consultant-queues', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.data) setQueues(res.data.data);

      const docRes = await axios.get('http://localhost:4000/api/identity/users/doctors', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (docRes.data.data) setDoctors(docRes.data.data);

    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, []);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    form.resetFields();
    
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
      const token = localStorage.getItem('admin_token');
      
      if (activeTab === 'reschedule') {
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/reschedule`, {
          doctor_id: values.doctor_id,
          appointment_date: values.appointment_date.format('YYYY-MM-DD'),
          appointment_time: values.appointment_time,
          note: values.note
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã dời lịch & chốt Bác sĩ mới thành công!');
      }
      else if (activeTab === 'checkIn') {
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/pre-check`, values, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        message.success('Đã lưu hồ sơ sơ bộ và chuyển cho Bác sĩ!');
      } 
      else if (activeTab === 'followUp') {
        await axios.post(`http://localhost:4000/api/booking/follow-ups`, {
          appointment_id: selectedCustomer.id,
          customer_id: selectedCustomer.customer_id,
          ...values
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã lưu nhật ký cuộc gọi!');
      }
      
      setSelectedCustomer(null);
      fetchQueues(); 
    } catch (error) {
      message.error('Có lỗi xảy ra khi xử lý hệ thống!');
    } finally {
      setLoading(false);
    }
  };

  // --- 1. FORM XỬ LÝ DỜI LỊCH ---
  const RenderRescheduleForm = () => {
    const oldDoctor = doctors.find(d => d.id === selectedCustomer?.doctor_id);
    const oldDoctorName = oldDoctor?.Profile?.full_name || 'Bác sĩ không xác định';

    return (
      <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
        <Alert
          message="Yêu cầu dời lịch/đổi bác sĩ khẩn cấp"
          description={
            <div>
              Lịch hẹn này bị gián đoạn do <b>BS. {oldDoctorName}</b> nghỉ đột xuất. <br/>
              Vui lòng gọi điện xin lỗi khách hàng và thỏa thuận đổi sang Bác sĩ khác hoặc ngày khác.
            </div>
          }
          type="error"
          showIcon
          className="mb-5 border-red-300 bg-red-50"
        />
        
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4 shadow-sm">
          <Title level={5} className="mt-0 text-blue-700">Thông tin xếp lại lịch</Title>
          <Form.Item name="doctor_id" label="Bác sĩ mới" rules={[{ required: true, message: 'Hãy chọn bác sĩ' }]}>
            <Select placeholder="-- Chọn Bác sĩ thay thế --">
              {doctors.map(d => (
                <Select.Option key={d.id} value={d.id}>
                  {d.Profile?.full_name} {d.id === selectedCustomer?.doctor_id ? '(Bác sĩ cũ)' : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="appointment_date" label="Ngày mới" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="appointment_time" label="Giờ mới" rules={[{ required: true }]}>
                <Select placeholder="Chọn giờ">
                  <Select.Option value="09:00">09:00</Select.Option>
                  <Select.Option value="10:00">10:00</Select.Option>
                  <Select.Option value="14:00">14:00</Select.Option>
                  <Select.Option value="15:00">15:00</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="Ghi chú CSKH">
            <Input.TextArea rows={2} placeholder="VD: Khách đồng ý đổi sang BS. Mai lúc 14h..." />
          </Form.Item>
        </div>
        <div className="text-right">
          <Button type="primary" htmlType="submit" size="large" loading={loading} icon={<ReloadOutlined />}>Xác nhận Dời lịch</Button>
        </div>
      </Form>
    );
  };

  // --- 2. FORM KHAI THÁC SƠ BỘ ---
  const RenderPreDoctorForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
      <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
        <Title level={5} className="text-blue-700 m-0"><SolutionOutlined className="mr-2"/> Khai thác thông tin sơ bộ</Title>
        <Text type="secondary">Ghi nhận tình trạng trước khi chuyển vào phòng khám cho Bác sĩ.</Text>
      </div>
      
      <Form.Item name="reason" label="Lý do khám (Tình trạng mong muốn khắc phục)">
        <Input.TextArea rows={2} placeholder="VD: Bị nổi mụn viêm nhiều ở trán, muốn da sáng hơn..." />
      </Form.Item>
      
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="current_skincare" label="Mỹ phẩm đang sử dụng">
            <Input.TextArea rows={2} placeholder="VD: SRM Hada Labo, Kem chống nắng Anessa..." />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="lifestyle" label="Thói quen sinh hoạt">
            <Input.TextArea rows={2} placeholder="VD: Thức khuya sau 12h, hay ăn cay nóng..." />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="budget" label="Ngân sách dự kiến của khách">
        <Select placeholder="-- Đánh giá ngân sách --">
          <Select.Option value="LOW">Thấp (Dưới 1 triệu)</Select.Option>
          <Select.Option value="MEDIUM">Trung bình (1 - 3 triệu)</Select.Option>
          <Select.Option value="HIGH">Cao (Không quan tâm giá)</Select.Option>
        </Select>
      </Form.Item>
      
      <Form.Item name="pre_notes" label="Ghi chú nội bộ cho Bác sĩ">
        <Input.TextArea rows={2} placeholder="VD: Khách nhạy cảm về giá, Bác sĩ ưu tiên gói cơ bản..." />
      </Form.Item>
      
      <div className="text-right">
        <Button type="primary" htmlType="submit" loading={loading} icon={<CheckCircleOutlined />}>Lưu hồ sơ & Chuyển Bác Sĩ</Button>
      </div>
    </Form>
  );

  // --- 3. MỚI: XEM HỒ SƠ TỔNG QUAN (Thay thế cho Chốt Sale) ---
  const RenderProfileView = () => {
    // Tách dữ liệu CSKH khai báo
    const csNotes = selectedCustomer.pre_notes ? selectedCustomer.pre_notes.split(' - ') : [];

    return (
      <div className="space-y-6">
        <Alert 
          message="Hồ sơ khách hàng hoàn chỉnh" 
          description="Khách hàng đã hoàn thành buổi khám. Dưới đây là thông tin tổng hợp từ CSKH và Bác sĩ." 
          type="info" 
          showIcon 
          className="mb-4 bg-blue-50 border-blue-200"
        />

        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <Title level={5} className="text-blue-700 mt-0 border-b pb-2 mb-4">1. Lịch sử khai báo (CSKH)</Title>
          {csNotes.length > 0 ? (
            <ul className="list-disc pl-5 text-gray-700 space-y-2">
              {csNotes.map((note, idx) => <li key={idx}><b>{note.split(':')[0]}:</b> {note.split(':')[1]}</li>)}
            </ul>
          ) : (
            <Text type="secondary italic">Chưa có thông tin khai báo sơ bộ.</Text>
          )}
        </div>

        <div className="bg-white p-5 rounded-lg border border-orange-200 shadow-sm">
          <Title level={5} className="text-orange-700 mt-0 border-b pb-2 mb-4">2. Y lệnh & Kết luận (Từ Bác sĩ)</Title>
          <div className="text-gray-800 bg-orange-50 p-4 rounded min-h-[80px]">
            {selectedCustomer.symptoms ? (
               <div dangerouslySetInnerHTML={{ __html: selectedCustomer.symptoms.replace(/\n/g, '<br/>') }} />
            ) : (
              <Text type="secondary italic">Chưa có kết luận y khoa.</Text>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- 4. FORM CSKH GỌI ĐIỆN ---
  const RenderFollowUpForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
      <div className="bg-green-50 p-4 rounded-lg mb-4 border border-green-100">
        <Title level={5} className="text-green-700 m-0"><PhoneOutlined className="mr-2"/> Trạng thái Lịch hẹn</Title>
        <Text className="text-base text-gray-800">Lịch khám ngày: <b>{selectedCustomer.appointment_date}</b></Text>
      </div>
      <Form.Item name="call_status" label="Trạng thái cuộc gọi" rules={[{ required: true }]}>
        <Select placeholder="-- Tình trạng liên hệ --">
          <Select.Option value="SUCCESS">Nghe máy - Da phục hồi tốt</Select.Option>
          <Select.Option value="COMPLAINT">Nghe máy - Có phàn nàn/kích ứng</Select.Option>
          <Select.Option value="NO_ANSWER">Không nhấc máy / Máy bận</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="call_note" label="Nội dung trao đổi">
        <Input.TextArea rows={3} placeholder="Ghi lại chi tiết phản hồi của khách hàng..." />
      </Form.Item>
      <div className="text-right">
        <Button type="primary" htmlType="submit" loading={loading}>Lưu Nhật Ký Cuộc Gọi</Button>
      </div>
    </Form>
  );

  // Đổi nhãn tab "Chốt sale" thành "Hồ sơ khách hàng" (Vẫn dùng mảng queues.hotLeads từ backend)
  const queueTabs = [
    { key: 'reschedule', label: <span className="text-red-600 font-bold">🚨 Xử lý dời lịch ({queues.reschedule?.length || 0})</span> },
    { key: 'checkIn', label: `👋 Khách Mới (${queues.checkIn?.length || 0})` },
    { key: 'hotLeads', label: <span className="text-blue-600 font-medium">🗂️ Hồ sơ khách hàng ({queues.hotLeads?.length || 0})</span> },
    { key: 'followUp', label: `📞 Gọi thăm hỏi (${queues.followUp?.length || 0})` }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={8} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm" styles={{ body: { padding: '0 0 10px 0', height: '100%', display: 'flex', flexDirection: 'column' } }}>
          <div className="px-4 pt-2 border-b border-gray-200">
            <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); setSelectedCustomer(null); }} items={queueTabs} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <List
              itemLayout="horizontal"
              dataSource={queues[activeTab]}
              locale={{ emptyText: 'Hiện không có khách hàng nào trong phễu này.' }}
              renderItem={(item) => (
                <List.Item 
                  onClick={() => handleSelectCustomer(item)}
                  className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedCustomer?.id === item.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={activeTab === 'hotLeads' ? <FolderOpenOutlined /> : <UserOutlined />} className={activeTab === 'reschedule' ? 'bg-red-500' : 'bg-blue-500'} />}
                    title={<b className={activeTab === 'reschedule' ? "text-red-600" : "text-gray-800"}>{item.customer_name}</b>}
                    description={
                      <Space direction="vertical" size={0} className="w-full mt-1">
                        <Text type="secondary" className="text-xs"><PhoneOutlined /> {item.customer_phone}</Text>
                        <div className="mt-1 flex justify-between">
                          {activeTab === 'reschedule' && <Tag color="error">Cần đổi lịch</Tag>}
                          {activeTab === 'checkIn' && <Tag color="processing">Đang chờ phục vụ</Tag>}
                          {activeTab === 'hotLeads' && <Tag color="cyan">Khám xong</Tag>}
                          {activeTab === 'followUp' && <Tag color="default">Cần gọi lại</Tag>}
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
              <Text>Hãy chọn một khách hàng từ phễu bên trái để xem hoặc xử lý hồ sơ.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className={`p-4 border-b flex justify-between items-center ${activeTab === 'reschedule' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <Space size="middle">
                  <Avatar size={50} icon={activeTab === 'hotLeads' ? <FolderOpenOutlined /> : <UserOutlined />} className={activeTab === 'reschedule' ? 'bg-red-400' : 'bg-gray-400'} />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title>
                    <Text type="secondary">SĐT: {selectedCustomer.customer_phone}</Text>
                  </div>
                </Space>
                {activeTab === 'reschedule' && (
                   <div className="text-right">
                     <Text type="secondary" className="text-xs block">Lịch cũ bị hủy:</Text>
                     <Text strong className="text-red-600">{dayjs(selectedCustomer.appointment_date).format('DD/MM/YYYY')} - {selectedCustomer.appointment_time}</Text>
                   </div>
                )}
              </div>
              <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'reschedule' && <RenderRescheduleForm />}
                {activeTab === 'checkIn' && <RenderPreDoctorForm />}
                
                {/* HIỂN THỊ HỒ SƠ MỚI Ở ĐÂY */}
                {activeTab === 'hotLeads' && <RenderProfileView />}
                
                {activeTab === 'followUp' && <RenderFollowUpForm />}
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}