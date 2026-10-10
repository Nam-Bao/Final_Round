import React, { useState, useEffect } from 'react';
import { Card, List, Tag, Button, Modal, Form, Input, message, Typography, Space, Tabs, Alert } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, InfoCircleOutlined, FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, AlertOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'; 

dayjs.extend(isSameOrAfter); 

const { Title, Text } = Typography;

export default function MySchedulePage() {
  const [shifts, setShifts] = useState([]);
  const [requests, setRequests] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchMyShifts();
    fetchMyRequests(); 
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
      
      // Nếu là ca có khách, tự động thêm tiền tố [KHẨN CẤP] vào lý do để Backend/Quản lý dễ nhận biết
      const finalReason = selectedShift?.appointment_count > 0 
        ? `[KHẨN CẤP - Đã có khách] ${values.reason}` 
        : values.reason;

      const res = await fetch('http://localhost:4000/api/booking/shifts/request-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          from_shift_id: selectedShift.id,
          reason: finalReason
        })
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      message.success('Đã gửi đơn xin nghỉ cho Quản lý!');
      setIsModalVisible(false);
      form.resetFields();
      
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

  const checkShiftStatus = (date, shiftType) => {
    const now = dayjs();
    const shiftDate = dayjs(date);

    if (shiftDate.isAfter(now, 'day')) return 'UPCOMING';
    if (shiftDate.isBefore(now, 'day')) return 'PASSED';

    const currentHour = now.hour();
    let startHour = 0, endHour = 24;
    
    if (shiftType === 'MORNING') { startHour = 8; endHour = 12; }
    else if (shiftType === 'AFTERNOON') { startHour = 13; endHour = 17; }
    else if (shiftType === 'EVENING') { startHour = 18; endHour = 22; }

    if (currentHour < startHour) return 'UPCOMING'; 
    if (currentHour >= startHour && currentHour < endHour) return 'IN_PROGRESS'; 
    return 'PASSED'; 
  };

  const renderStatus = (status) => {
    switch (status) {
      case 'APPROVED': return <Tag icon={<CheckCircleOutlined />} color="success">Đã duyệt</Tag>;
      case 'REJECTED': return <Tag icon={<CloseCircleOutlined />} color="error">Từ chối</Tag>;
      default: return <Tag icon={<SyncOutlined spin />} color="processing">Đang chờ</Tag>;
    }
  };

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
            const timeStatus = checkShiftStatus(shift.date, shift.shift_type);
            
            // Xác định xem ca này có khách chưa
            const hasAppointments = shift.appointment_count > 0; 

            let statusTag = <Tag color="default">{shift.status}</Tag>;
            if (timeStatus === 'IN_PROGRESS') {
              statusTag = <Tag color="processing" icon={<SyncOutlined spin />}>Đang trong ca làm</Tag>;
            } else if (timeStatus === 'PASSED') {
              statusTag = <Tag color="success">Đã hoàn thành</Tag>;
            } else if (isToday) {
              statusTag = <Tag color="warning">Sắp diễn ra</Tag>;
            }

            // Giao diện Nút bấm theo chuẩn "Nghỉ Đột Xuất"
            let actionButton = null;
            if (timeStatus === 'UPCOMING') {
              if (hasAppointments) {
                // Ca đã có khách -> Nút màu đỏ (Danger)
                actionButton = (
                  <Button danger type="primary" size="small" onClick={() => openRequestModal(shift)}>
                    Nghỉ Đột Xuất
                  </Button>
                );
              } else {
                // Ca rảnh -> Nút bình thường
                actionButton = (
                  <Button type="primary" ghost size="small" onClick={() => openRequestModal(shift)}>
                    Xin nghỉ / Đổi ca
                  </Button>
                );
              }
            }

            return (
              <List.Item
                actions={actionButton ? [actionButton] : []}
                className={`rounded-lg mb-3 p-4 border ${isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
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
                      {isToday && timeStatus === 'UPCOMING' && <Tag color="error">Hôm nay</Tag>}
                    </Space>
                  }
                  description={
                    <Space className="mt-1" wrap>
                      <Tag icon={<ClockCircleOutlined />} color={shiftInfo.color}>{shiftInfo.time}</Tag>
                      {statusTag}
                      {hasAppointments && <Tag color="magenta">Có {shift.appointment_count} khách đặt</Tag>}
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
            let shiftInfo = { label: 'Ca không xác định', time: '' };
            let dateStr = '--/--/----';
            if (req.WorkShift) {
              shiftInfo = getShiftDetails(req.WorkShift.shift_type);
              dateStr = dayjs(req.WorkShift.date).format('DD/MM/YYYY');
            }
            
            // Highlight đơn khẩn cấp
            const isEmergency = req.reason.includes('[KHẨN CẤP');

            return (
              <List.Item className={`rounded-lg mb-3 p-4 border ${isEmergency ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <List.Item.Meta
                  title={
                    <div className="flex justify-between items-center mb-1">
                      <Space>
                        <Text strong className={isEmergency ? "text-red-700" : "text-blue-700"}>
                          Xin nghỉ {shiftInfo.label}
                        </Text>
                        <Tag icon={<ClockCircleOutlined />}>{shiftInfo.time}</Tag>
                      </Space>
                      {renderStatus(req.status)}
                    </div>
                  }
                  description={
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-2">
                         <CalendarOutlined className="text-gray-400"/>
                         <Text className="text-gray-600">Ngày làm việc: <b className="text-gray-800">{dateStr}</b></Text>
                      </div>
                      <div className="p-3 bg-white border border-gray-200 rounded">
                        <Text className="text-gray-600"><b>Lý do:</b> {req.reason}</Text>
                      </div>
                      <Text className="text-xs text-gray-400 mt-1">Gửi lúc: {dayjs(req.createdAt).format('HH:mm - DD/MM/YYYY')}</Text>
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

  // Kiểm tra xem ca đang chọn có khách hay không để hiển thị Modal cảnh báo
  const isEmergencyModal = selectedShift?.appointment_count > 0;

  return (
    <div className="max-w-4xl mx-auto">
      <Card bordered={false} className="shadow-sm">
        <Tabs items={tabItems} defaultActiveKey="upcoming" />
      </Card>

      <Modal title={isEmergencyModal ? "🚨 YÊU CẦU NGHỈ ĐỘT XUẤT" : "Gửi Đơn Xin Nghỉ / Đổi Ca"} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        
        {isEmergencyModal ? (
          <div className="mb-4 p-3 bg-red-50 text-red-800 rounded border border-red-200 text-sm">
            <AlertOutlined className="mr-2 text-red-600 text-lg" />
            <b>CẢNH BÁO NGHIÊM TRỌNG:</b> Ca làm này đang có <b>{selectedShift.appointment_count} khách hàng</b> chờ khám. Việc bạn nghỉ đột xuất sẽ gây gián đoạn quy trình. Vui lòng ghi rõ lý do bất khả kháng và đề xuất hướng giải quyết (ví dụ: nhờ bác sĩ khác thế ca).
          </div>
        ) : (
          <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
            <InfoCircleOutlined className="mr-2" />
            Bạn đang làm đơn cho <b>{selectedShift ? getShiftDetails(selectedShift.shift_type).label : ''}</b> ngày <b>{selectedShift ? dayjs(selectedShift.date).format('DD/MM/YYYY') : ''}</b>. Yêu cầu sẽ được gửi tới Quản lý để phê duyệt.
          </div>
        )}
        
        <Form form={form} layout="vertical" onFinish={handleRequestOff}>
          <Form.Item name="reason" label="Lý do cụ thể / Đề xuất hỗ trợ" rules={[{ required: true, message: 'Vui lòng nhập lý do!' }]}>
            <Input.TextArea rows={4} placeholder={isEmergencyModal ? "VD: Tôi bị tai nạn giao thông khẩn cấp, nhờ Quản lý dời lịch khách..." : "VD: Nhà có việc bận đột xuất, xin đổi ca..."} />
          </Form.Item>
          <Form.Item className="text-right mb-0">
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" danger={isEmergencyModal} htmlType="submit">Gửi Yêu Cầu</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}