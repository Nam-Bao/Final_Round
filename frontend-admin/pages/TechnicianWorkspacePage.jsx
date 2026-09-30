import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Button, Space, Avatar, Typography, message, Progress } from 'antd';
import { UserOutlined, PlayCircleOutlined, CheckCircleOutlined, HistoryOutlined, FileTextOutlined } from '@ant-design/icons';
import axios from 'axios'; // Bổ sung import axios

const { Title, Text } = Typography;

export default function TechnicianWorkspacePage() {
  const [activeTab, setActiveTab] = useState('waiting');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // 1. CHUẨN BỊ STATE ĐỂ HỨNG DỮ LIỆU TỪ BACKEND
  const [queues, setQueues] = useState({ waiting: [], inProgress: [], completed: [] });

  // 2. HÀM KÉO DỮ LIỆU THẬT
  const fetchQueues = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get('http://localhost:4000/api/booking/sessions/technician-queues', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.data) {
        setQueues(res.data.data);
      }
    } catch (error) {
      console.error('Lỗi tải hàng đợi KTV:', error);
      message.error('Không thể tải danh sách ca làm.');
    }
  };

  // Tự động kéo dữ liệu khi load trang
  useEffect(() => {
    fetchQueues();
  }, []);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    form.resetFields();
  };

  // 3. HÀM XỬ LÝ NHẬN CA (GỌI API)
  const handleStartService = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/sessions/${selectedCustomer.id}/status`, 
        { status: 'IN_PROGRESS' }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      message.success('Đã nhận khách! Bắt đầu tính giờ dịch vụ.');
      setSelectedCustomer(null);
      fetchQueues(); // Tải lại danh sách để phễu tự động nhảy sang "Đang thực hiện"
    } catch (error) {
      message.error('Lỗi khi nhận ca làm!');
      console.error(error);
    }
  };

  // 4. HÀM XỬ LÝ HOÀN THÀNH CA (GỌI API)
  const handleCompleteService = async (values) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/sessions/${selectedCustomer.id}/status`, 
        { 
          status: 'COMPLETED', 
          technician_note: values.technician_note // Lưu nội dung KTV ghi chú
        }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      message.success('Đã hoàn thành ca làm! Hệ thống đã trừ 1 buổi của khách.');
      setSelectedCustomer(null);
      fetchQueues(); // Tải lại danh sách để phễu nhảy sang "Đã xong"
    } catch (error) {
      message.error('Lỗi khi hoàn thành ca làm!');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const queueTabs = [
    { key: 'waiting', label: <span className="text-blue-600 font-bold">⏳ Chờ phục vụ ({queues.waiting?.length || 0})</span> },
    { key: 'inProgress', label: <span className="text-orange-600 font-bold">🛏️ Đang thực hiện ({queues.inProgress?.length || 0})</span> },
    { key: 'completed', label: `✅ Đã xong (${queues.completed?.length || 0})` }
  ];

  return (
    <Row gutter={16} className="h-[85vh]">
      {/* CỘT TRÁI: HÀNG ĐỢI */}
      <Col span={8} className="h-full">
        <Card className="h-full shadow-sm" bodyStyle={{ padding: '0 0 10px 0', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div className="px-4 pt-2 border-b border-gray-200">
            <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); setSelectedCustomer(null); }} items={queueTabs} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <List
              itemLayout="horizontal"
              dataSource={queues[activeTab]}
              locale={{ emptyText: 'Chưa có ca làm việc nào ở trạng thái này.' }}
              renderItem={(item) => (
                <List.Item 
                  onClick={() => handleSelectCustomer(item)}
                  className={`cursor-pointer px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedCustomer?.id === item.id ? 'bg-blue-100 border-l-4 border-l-blue-500' : ''}`}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} className={activeTab === 'completed' ? 'bg-green-500' : 'bg-blue-500'} />}
                    title={<b className="text-gray-800">{item.customer_name}</b>}
                    description={
                      <Space direction="vertical" size={0} className="w-full mt-1">
                        <Text type="secondary" className="text-xs truncate">{item.package_name}</Text>
                        <div className="mt-2 text-xs font-semibold text-blue-700">
                          Buổi: {item.current_session} / {item.total_sessions}
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

      {/* CỘT PHẢI: BÀN ĐIỀU KHIỂN DỊCH VỤ */}
      <Col span={16} className="h-full">
        <Card className="h-full shadow-sm flex flex-col" bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedCustomer ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <HistoryOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn ca làm</Title>
              <Text>Chọn một khách hàng bên trái để xem Y Lệnh và bắt đầu thực hiện.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* HEADER CA LÀM */}
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <Space size="middle">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-gray-400" />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title>
                    <Text type="secondary">Gói: <b>{selectedCustomer.package_name}</b> (Buổi {selectedCustomer.current_session})</Text>
                  </div>
                </Space>
                {activeTab === 'waiting' && (
                  <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={handleStartService}>
                    Bắt đầu làm dịch vụ
                  </Button>
                )}
              </div>

              <div className="flex-1 p-6 overflow-y-auto">
                {/* HIỂN THỊ Y LỆNH BÁC SĨ (LUÔN CÓ) */}
                <div className="bg-orange-50 p-4 rounded-lg mb-6 border border-orange-200">
                  <Title level={5} className="text-orange-700 m-0"><FileTextOutlined className="mr-2"/> Y Lệnh & Chỉ định từ Bác sĩ</Title>
                  <p className="mt-2 text-base text-gray-800">{selectedCustomer.doctor_note || "Không có ghi chú đặc biệt."}</p>
                </div>

                <div className="mb-6">
                  <Text className="font-semibold block mb-2">Tiến độ liệu trình hiện tại:</Text>
                  <Progress percent={Math.round(((selectedCustomer.current_session - 1) / selectedCustomer.total_sessions) * 100)} status="active" />
                </div>

                {/* FORM GHI CHÚ KHI ĐANG LÀM */}
                {activeTab === 'inProgress' && (
                  <Form form={form} layout="vertical" onFinish={handleCompleteService}>
                    <Form.Item name="technician_note" label="Ghi chú sau khi thực hiện (Tình trạng da, phản ứng khách...)" rules={[{ required: true, message: 'Vui lòng nhập ghi chú ca làm!' }]}>
                      <Input.TextArea rows={4} placeholder="VD: Khách chịu đau tốt, nặn mụn ra nhiều máu thâm, đã làm sạch kĩ..." />
                    </Form.Item>
                    <div className="text-right">
                      <Button type="primary" htmlType="submit" loading={loading} icon={<CheckCircleOutlined />} size="large" className="bg-green-600 hover:bg-green-500">
                        Hoàn Thành Ca & Trừ 1 Buổi
                      </Button>
                    </div>
                  </Form>
                )}

                {/* XEM LẠI GHI CHÚ KHI ĐÃ HOÀN THÀNH */}
                {activeTab === 'completed' && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <Title level={5} className="text-green-700 m-0"><CheckCircleOutlined className="mr-2"/> Đã hoàn thành ca này</Title>
                    <p className="mt-2 text-gray-700"><b>Ghi chú của bạn:</b> {selectedCustomer.technician_note}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}