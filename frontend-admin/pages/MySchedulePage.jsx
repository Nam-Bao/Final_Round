import React, { useState, useEffect } from 'react';
import { Card, List, Tag, Button, Modal, Form, Input, message, Typography, Space, Tabs, Badge } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, InfoCircleOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'; 

dayjs.extend(isSameOrAfter); 

const { Title, Text } = Typography;

export default function MySchedulePage() {
  const [shifts, setShifts] = useState([]);
  const [requests, setRequests] = useState([]); // State chứa lịch sử xin nghỉ
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchMyShifts();
    fetchMyRequests(); // Gọi API lấy lịch sử đơn khi load trang
  }, []);

  const fetchMyShifts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/shifts/my-shifts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      const today = dayjs().startOf('day');
      const upcomingShifts = result.data.filter(s => dayjs(s.date).isSameOrAfter(today));
      setShifts(upcomingShifts);
    } catch (error) {
      message.error('Không thể tải lịch làm việc của bạn');
    } finally {
      setLoading(false);
    }
  };

  // Hàm mới: Kéo lịch sử đơn xin nghỉ
  const fetchMyRequests = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/shifts/my-requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (result.data) setRequests(result.data);
    } catch (error) {
      console.error('Lỗi tải lịch sử đơn từ', error);
    }
  };

  const openRequestModal = (shift) => {
    setSelectedShift(shift);
    setIsModalVisible(true);
  };

  const handleRequestOff = async (values) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/shifts/request-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          from_shift_id: selectedShift.id,
          reason: values.reason
        })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      message.success('Đã gửi đơn xin nghỉ/đổi ca cho Quản lý!');
      setIsModalVisible(false);
      form.resetFields();
      
      // Load lại danh sách đơn để hiển thị ngay lập tức
      fetchMyRequests(); 
    } catch (error) {
      message.error(error.message || 'Lỗi khi gửi yêu cầu');
    }
  };

  const getShiftDetails = (type) => {
    switch (type) {
      case 'MORNING': return { color: 'blue', label: 'Ca Sáng', time: '08:00 - 12:00' };
      case 'AFTERNOON': return { color: 'orange', label: 'Ca Chiều', time: '13:00 - 17:00' };
      case 'EVENING': return { color: 'purple', label: 'Ca Tối', time: '18:00 - 22:00' };
      default: return { color: 'default', label: 'Không xác định', time: '--:--' };
    }
  };

  // Giao diện render cho trạng thái đơn
  const renderStatus = (status) => {
    switch (status) {
      case 'APPROVED': return <Tag icon={<CheckCircleOutlined />} color="success">Đã duyệt</Tag>;
      case 'REJECTED': return <Tag icon={<CloseCircleOutlined />} color="error">Từ chối</Tag>;
      default: return <Tag icon={<SyncOutlined spin />} color="processing">Đang chờ</Tag>;
    }
  };

  // Cấu trúc 2 Tabs
  const tabItems = [
    {
      key: 'upcoming',
      label: <span><CalendarOutlined /> Lịch Trình Sắp Tới</span>,
      children: (
        <List
          loading={loading}
          itemLayout="horizontal"
          dataSource={shifts}
          renderItem={(shift) => {
            const shiftInfo = getShiftDetails(shift.shift_type);
            const isToday = dayjs(shift.date).isSame(dayjs(), 'day');

            return (
              <List.Item
                actions={[
                  <Button type="default" size="small" onClick={() => openRequestModal(shift)}>
                    Xin nghỉ / Đổi ca
                  </Button>
                ]}
                className={`rounded-lg mb-3 p-4 border ${isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
              >
                <List.Item.Meta
                  avatar={
                    <div className="flex flex-col items-center justify-center bg-white border border-gray-200 rounded p-2 min-w-[70px]">
                      <Text className="text-gray-500 text-xs uppercase font-bold">{dayjs(shift.date).format('ddd')}</Text>
                      <Title level={4} className="m-0 text-blue-600">{dayjs(shift.date).format('DD/MM')}</Title>
                    </div>
                  }
                  title={
                    <Space>
                      <Text strong className="text-lg">{shiftInfo.label}</Text>
                      {isToday && <Tag color="error">Hôm nay</Tag>}
                    </Space>
                  }
                  description={
                    <Space className="mt-1">
                      <Tag icon={<ClockCircleOutlined />} color={shiftInfo.color}>{shiftInfo.time}</Tag>
                      <Text type="secondary">Trạng thái: {shift.status}</Text>
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
          locale={{ emptyText: 'Bạn không có ca làm việc nào sắp tới.' }}
        />
      )
    },
    {
      key: 'requests',
      label: <span><FileTextOutlined /> Lịch Sử Đơn Từ</span>,
      children: (
        <List
          dataSource={requests}
          renderItem={(req) => {
            let shiftInfo = { label: 'Ca không xác định' };
            let dateStr = '--/--/----';
            if (req.WorkShift) {
              shiftInfo = getShiftDetails(req.WorkShift.shift_type);
              dateStr = dayjs(req.WorkShift.date).format('DD/MM/YYYY');
            }

            return (
              <List.Item className="bg-gray-50 rounded-lg mb-3 p-4 border border-gray-200">
                <List.Item.Meta
                  title={
                    <div className="flex justify-between items-center mb-1">
                      <Space>
                        <Text strong>Xin nghỉ {shiftInfo.label}</Text>
                        <Tag>{dateStr}</Tag>
                      </Space>
                      {renderStatus(req.status)}
                    </div>
                  }
                  description={
                    <div className="flex flex-col gap-1">
                      <Text className="text-gray-600"><b>Lý do:</b> {req.reason}</Text>
                      <Text className="text-xs text-gray-400">Gửi lúc: {dayjs(req.createdAt).format('HH:mm - DD/MM/YYYY')}</Text>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
          locale={{ emptyText: 'Bạn chưa gửi đơn xin nghỉ/đổi ca nào.' }}
        />
      )
    }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <Card bordered={false} className="shadow-sm">
        <Tabs items={tabItems} defaultActiveKey="upcoming" />
      </Card>

      <Modal title="Gửi Đơn Xin Nghỉ / Đổi Ca" open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
          <InfoCircleOutlined className="mr-2" />
          Bạn đang làm đơn cho <b>{selectedShift ? getShiftDetails(selectedShift.shift_type).label : ''}</b> ngày <b>{selectedShift ? dayjs(selectedShift.date).format('DD/MM/YYYY') : ''}</b>. Yêu cầu sẽ được gửi tới Quản lý để phê duyệt.
        </div>
        
        <Form form={form} layout="vertical" onFinish={handleRequestOff}>
          <Form.Item name="reason" label="Lý do cụ thể (hoặc đề xuất người làm thay)" rules={[{ required: true, message: 'Vui lòng nhập lý do!' }]}>
            <Input.TextArea rows={4} placeholder="VD: Nhà có việc bận đột xuất, xin đổi ca với BS. Nam..." />
          </Form.Item>
          <Form.Item className="text-right mb-0">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit">Gửi Yêu Cầu</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}