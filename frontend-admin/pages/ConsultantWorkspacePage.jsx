import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Select, Button, Space, Avatar, Typography, message } from 'antd';
import { UserOutlined, PhoneOutlined, DollarOutlined, SolutionOutlined, GiftOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

export default function ConsultantWorkspacePage() {
  const [activeTab, setActiveTab] = useState('checkIn');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Khởi tạo mảng rỗng chờ dữ liệu thật
  const [queues, setQueues] = useState({ checkIn: [], hotLeads: [], followUp: [] });

  // 1. KÉO DỮ LIỆU TỪ BACKEND
  const fetchQueues = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      // API này chúng ta sẽ viết ở bước tiếp theo bên service-booking
      const res = await axios.get('http://localhost:4000/api/booking/appointments/consultant-queues', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.data) {
        setQueues(res.data.data);
      }
    } catch (error) {
      console.error('Lỗi tải danh sách khách hàng:', error);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, []);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    form.resetFields();
  };

  // 2. XỬ LÝ KHI BẤM NÚT LƯU Ở TỪNG TAB
  const handleSubmitForm = async (values) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      
      // Kịch bản 1: Khách mới đến -> Chuyển vào phòng Bác sĩ
      if (activeTab === 'checkIn') {
        await axios.put(`http://localhost:4000/api/booking/appointments/${selectedCustomer.id}/pre-check`, values, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        message.success('Đã chuyển khách hàng cho Bác sĩ!');
      } 
      // Kịch bản 2: Bác sĩ khám xong -> Chốt Sale & Tạo Hóa Đơn
      else if (activeTab === 'hotLeads') {
        // Gọi sang service-commerce để tạo Order
        await axios.post(`http://localhost:4000/api/commerce/orders`, {
          appointment_id: selectedCustomer.id,
          customer_id: selectedCustomer.customer_id,
          ...values
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã chốt hóa đơn & Chuyển cho Thu ngân!');
      } 
      // Kịch bản 3: CSKH -> Lưu nhật ký
      else if (activeTab === 'followUp') {
        await axios.post(`http://localhost:4000/api/booking/follow-ups`, {
          appointment_id: selectedCustomer.id,
          customer_id: selectedCustomer.customer_id,
          ...values
        }, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Đã lưu nhật ký cuộc gọi!');
      }

      // Xử lý xong thì reset form và tải lại danh sách
      setSelectedCustomer(null);
      fetchQueues(); 
    } catch (error) {
      message.error('Có lỗi xảy ra khi xử lý!');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // --- CÁC COMPONENT FORM GIAO DIỆN KHÔNG ĐỔI ---
  const RenderPreDoctorForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
      <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
        <Title level={5} className="text-blue-700 m-0"><SolutionOutlined className="mr-2"/> Khai thác thông tin sơ bộ</Title>
        <Text type="secondary">Ghi nhận tình trạng trước khi chuyển vào phòng khám cho Bác sĩ.</Text>
      </div>
      <Form.Item name="current_skincare" label="Mỹ phẩm đang sử dụng ở nhà">
        <Input.TextArea rows={2} placeholder="VD: Sữa rửa mặt Hada Labo, không dùng kem chống nắng..." />
      </Form.Item>
      <Form.Item name="budget" label="Ngân sách dự kiến của khách">
        <Select placeholder="-- Đánh giá ngân sách --">
          <Select.Option value="LOW">Thấp (Dưới 1 triệu)</Select.Option>
          <Select.Option value="MEDIUM">Trung bình (1 - 3 triệu)</Select.Option>
          <Select.Option value="HIGH">Cao (Không quan tâm giá)</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item name="pre_notes" label="Ghi chú nội bộ cho Bác sĩ">
        <Input.TextArea rows={2} placeholder="VD: Khách khá nhạy cảm về giá, Bác sĩ ưu tiên các gói cơ bản trước." />
      </Form.Item>
      <div className="text-right">
        <Button type="primary" htmlType="submit" loading={loading} icon={<CheckCircleOutlined />}>Lưu hồ sơ & Chuyển Bác Sĩ</Button>
      </div>
    </Form>
  );

  const RenderPostDoctorForm = () => (
    <Form form={form} layout="vertical" onFinish={handleSubmitForm}>
      <div className="bg-orange-50 p-4 rounded-lg mb-4 border border-orange-100">
        <Title level={5} className="text-orange-700 m-0"><DollarOutlined className="mr-2"/> Y Lệnh Từ Bác Sĩ</Title>
        <p className="mt-2 text-base font-semibold text-gray-800">{selectedCustomer.symptoms || "Không có chỉ định đặc biệt"}</p>
      </div>
      
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="upsale_products" label="Upsale (Bán thêm/Gợi ý)">
            <Select mode="multiple" placeholder="Gợi ý thêm sản phẩm...">
              <Select.Option value="prod1">Mặt nạ phục hồi (150,000đ)</Select.Option>
              <Select.Option value="prod2">Bông tẩy trang (50,000đ)</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="discount_amount" label="Tiền giảm giá (Voucher)">
             <InputNumber className="w-full" min={0} placeholder="Nhập số tiền giảm (VNĐ)" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
          </Form.Item>
        </Col>
      </Row>
      
      <Form.Item name="final_note" label="Ghi chú chốt đơn (Dành cho Lễ tân thu tiền)">
        <Input placeholder="VD: Khách chuyển khoản 50%, quẹt thẻ 50%" />
      </Form.Item>
      <div className="text-right">
        <Button type="primary" danger htmlType="submit" size="large" loading={loading} icon={<GiftOutlined />}>Chốt Hóa Đơn & Gửi Thu Ngân</Button>
      </div>
    </Form>
  );

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

  const queueTabs = [
    { key: 'hotLeads', label: <span className="text-orange-600 font-bold">🔥 Chốt Sale ({queues.hotLeads?.length || 0})</span> },
    { key: 'checkIn', label: `👋 Khách Mới (${queues.checkIn?.length || 0})` },
    { key: 'followUp', label: `📞 CSKH (${queues.followUp?.length || 0})` }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={8} className="h-full">
        <Card className="h-full shadow-sm" bodyStyle={{ padding: '0 0 10px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                    avatar={<Avatar icon={<UserOutlined />} className={activeTab === 'hotLeads' ? 'bg-orange-500' : 'bg-blue-500'} />}
                    title={<b className="text-gray-800">{item.customer_name || 'Khách hàng'}</b>}
                    description={
                      <Space direction="vertical" size={0} className="w-full mt-1">
                        <Text type="secondary" className="text-xs"><PhoneOutlined /> {item.customer_phone || 'Chưa có SĐT'}</Text>
                        <div className="mt-1 flex justify-between">
                          {activeTab === 'hotLeads' && <Tag color="error">Vừa ra phòng khám</Tag>}
                          {activeTab === 'checkIn' && <Tag color="processing">Đang chờ soi da</Tag>}
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
        <Card className="h-full shadow-sm flex flex-col" bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <SolutionOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn khách hàng</Title>
              <Text>Hãy chọn một khách hàng từ phễu bên trái để bắt đầu nghiệp vụ.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <Space size="middle">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-gray-400" />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title>
                    <Text type="secondary">SĐT: {selectedCustomer.customer_phone}</Text>
                  </div>
                </Space>
              </div>
              <div className="flex-1 p-6 overflow-y-auto">
                {activeTab === 'checkIn' && <RenderPreDoctorForm />}
                {activeTab === 'hotLeads' && <RenderPostDoctorForm />}
                {activeTab === 'followUp' && <RenderFollowUpForm />}
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}