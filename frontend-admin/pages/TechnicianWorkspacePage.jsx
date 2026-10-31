import React, { useState, useEffect } from 'react';
import { Row, Col, Card, List, Tag, Tabs, Form, Input, Button, Space, Avatar, Typography, message, Progress, Upload } from 'antd';
import { UserOutlined, PlayCircleOutlined, CheckCircleOutlined, HistoryOutlined, FileTextOutlined, CameraOutlined } from '@ant-design/icons';
import axios from 'axios'; 

const { Title, Text } = Typography;

export default function TechnicianWorkspacePage() {
  const [activeTab, setActiveTab] = useState('waiting');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  
  // State xử lý ảnh upload
  const [uploadedImages, setUploadedImages] = useState([]);

  const [queues, setQueues] = useState({ waiting: [], inProgress: [], completed: [] });

  const fetchQueues = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
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

  useEffect(() => {
    fetchQueues();
  }, []);

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    form.resetFields();
    setUploadedImages(customer.post_treatment_images || []); // Gắn ảnh nếu đã hoàn thành
  };

  const handleStartService = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/sessions/${selectedCustomer.id}/status`, 
        { status: 'IN_PROGRESS', type: selectedCustomer.type }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      message.success('Đã nhận khách! Bắt đầu tính giờ dịch vụ.');
      setSelectedCustomer(null);
      fetchQueues(); 
    } catch (error) { message.error('Lỗi khi nhận ca làm!'); }
  };

  const handleCompleteService = async (values) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/sessions/${selectedCustomer.id}/status`, 
        { 
          status: 'COMPLETED', 
          technician_note: values.technician_note, 
          type: selectedCustomer.type,
          post_treatment_images: uploadedImages // Gửi ảnh lên server
        }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      message.success('Đã hoàn thành ca làm! Khách hàng đã được xử lý.');
      setSelectedCustomer(null);
      setUploadedImages([]);
      fetchQueues(); 
    } catch (error) { message.error('Lỗi khi hoàn thành ca làm!'); } 
    finally { setLoading(false); }
  };

  // Upload ảnh tùy chỉnh
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
      message.success('Tải ảnh lên thành công!');
    } catch (err) { onError(err); message.error(err.message); }
  };

  const handleRemoveImage = (indexToRemove) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const isTechnicianBusy = queues.inProgress?.length > 0;

  const queueTabs = [
    { key: 'waiting', label: <span className="text-blue-600 font-bold">⏳ Chờ ({queues.waiting?.length || 0})</span> },
    { key: 'inProgress', label: <span className="text-orange-600 font-bold">🛏️ Đang làm ({queues.inProgress?.length || 0})</span> },
    { key: 'completed', label: `✅ Xong (${queues.completed?.length || 0})` }
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
              locale={{ emptyText: 'Chưa có ca làm việc nào.' }}
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
                        <Text type="secondary" className="text-xs truncate">{item.service_name}</Text>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-700">Buổi: {item.current_session} / {item.total_sessions}</span>
                          {item.type === 'PACKAGE' ? <Tag color="orange">GÓI VIP</Tag> : <Tag color="cyan">LẺ</Tag>}
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
              <HistoryOutlined className="text-6xl mb-4 text-gray-200" />
              <Title level={4} type="secondary">Chưa chọn ca làm</Title>
              <Text>Chọn một khách hàng bên trái để thực hiện.</Text>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <Space size="middle">
                  <Avatar size={50} icon={<UserOutlined />} className="bg-gray-400" />
                  <div>
                    <Title level={4} className="m-0 text-gray-800">{selectedCustomer.customer_name}</Title>
                    <Text type="secondary">Dịch vụ: <b>{selectedCustomer.service_name}</b> (Buổi {selectedCustomer.current_session})</Text>
                  </div>
                </Space>
                {activeTab === 'waiting' && (
                  <Button 
                    type="primary" size="large" icon={<PlayCircleOutlined />} 
                    onClick={handleStartService}
                    disabled={isTechnicianBusy}
                    title={isTechnicianBusy ? "Phải hoàn thành ca hiện tại trước" : ""}
                  >
                    Bắt đầu làm dịch vụ
                  </Button>
                )}
              </div>

              <div className="flex-1 p-6 overflow-y-auto">
                <div className="bg-orange-50 p-4 rounded-lg mb-6 border border-orange-200">
                  <Title level={5} className="text-orange-700 m-0"><FileTextOutlined className="mr-2"/> Thông tin Chỉ định</Title>
                  <p className="mt-2 text-base text-gray-800">Loại hình: {selectedCustomer.type === 'PACKAGE' ? 'Sử dụng Gói Liệu Trình' : 'Sử dụng Dịch Vụ Lẻ'}</p>
                </div>

                <div className="mb-6">
                  <Text className="font-semibold block mb-2">Tiến độ liệu trình:</Text>
                  <Progress percent={Math.round(((selectedCustomer.current_session - 1) / selectedCustomer.total_sessions) * 100)} status="active" />
                </div>

                {activeTab === 'inProgress' && (
                  <Form form={form} layout="vertical" onFinish={handleCompleteService}>
                    <Form.Item label={<b className="text-gray-700">Ảnh da sau dịch vụ (Tối đa 5 ảnh)</b>}>
                       <Upload listType="picture-card" customRequest={handleCustomUpload} showUploadList={false} accept="image/*">
                         <div><CameraOutlined /><div style={{ marginTop: 8 }}>Chụp / Tải lên</div></div>
                       </Upload>
                       {uploadedImages.length > 0 && (
                         <div className="flex flex-wrap gap-3 mt-3">
                            {uploadedImages.map((url, i) => (
                              <div key={i} className="relative group">
                                <img src={url} alt={`Sau DV ${i}`} className="w-20 h-20 rounded-lg object-cover border shadow-sm" />
                                <button type="button" onClick={() => handleRemoveImage(i)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 z-10">✕</button>
                              </div>
                            ))}
                         </div>
                       )}
                    </Form.Item>

                    <Form.Item name="technician_note" label={<b className="text-gray-700">Ghi chú thực hiện</b>} rules={[{ required: true, message: 'Vui lòng nhập ghi chú!' }]}>
                      <Input.TextArea rows={4} placeholder="VD: Đã làm sạch sâu, nặn mụn máu, thoa serum B5..." />
                    </Form.Item>
                    <div className="text-right">
                      <Button type="primary" htmlType="submit" loading={loading} icon={<CheckCircleOutlined />} size="large" className="bg-green-600 hover:bg-green-500">
                        Hoàn Thành Ca & Lưu Nhật Ký
                      </Button>
                    </div>
                  </Form>
                )}

                {activeTab === 'completed' && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <Title level={5} className="text-green-700 m-0"><CheckCircleOutlined className="mr-2"/> Đã hoàn thành</Title>
                    <p className="mt-2 text-gray-700 mb-2"><b>Ghi chú:</b> {selectedCustomer.technician_note}</p>
                    
                    {uploadedImages.length > 0 && (
                       <div className="flex flex-wrap gap-2 mt-2">
                          {uploadedImages.map((url, i) => (
                            <img key={i} src={url} alt={`Kết quả ${i}`} className="w-16 h-16 rounded object-cover border" />
                          ))}
                       </div>
                    )}
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
