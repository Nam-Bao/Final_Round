import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, Form, Input, message, Typography, Space, Tabs, Select, DatePicker, List, Tag, Row, Col } from 'antd';
import { FileTextOutlined, AlertOutlined, InfoCircleOutlined, CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'; 
import isoWeek from 'dayjs/plugin/isoWeek'; 

dayjs.extend(isSameOrAfter); 
dayjs.extend(isoWeek);

const { Title, Text } = Typography;

export default function MySchedulePage() {
  const [shifts, setShifts] = useState([]);
  const [requests, setRequests] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  
  const [currentWeekStart, setCurrentWeekStart] = useState(dayjs().startOf('isoWeek'));
  const [isEmergencyModal, setIsEmergencyModal] = useState(false);
  const [selectedShiftForModal, setSelectedShiftForModal] = useState(null);

  // ÉP REACT RE-RENDER KHI BIẾN DATE THAY ĐỔI TRONG FORM
  const selectedDateValue = Form.useWatch('date', form);

  useEffect(() => {
    fetchMyShifts();
    fetchMyRequests(); 
  }, [currentWeekStart]); 

  const fetchMyShifts = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('http://localhost:4000/api/booking/shifts/my-shifts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      
      setShifts(result.data || []);
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

  const openRequestModal = () => {
    form.resetFields();
    setIsEmergencyModal(false);
    setSelectedShiftForModal(null);
    setIsModalVisible(true);
  };

  const handleShiftSelectionChange = () => {
     const dateVal = form.getFieldValue('date');
     const shiftVal = form.getFieldValue('shift_id');

     if (dateVal && shiftVal) {
        const targetShift = shifts.find(s => s.id === shiftVal);
        if (targetShift) {
            setSelectedShiftForModal(targetShift);
            if (targetShift.appointment_count > 0) {
                setIsEmergencyModal(true); 
            } else {
                setIsEmergencyModal(false); 
            }
        }
     }
  };

  const handleRequestOff = async (values) => {
    try {
      if (!selectedShiftForModal) {
         return message.error('Vui lòng chọn ca làm việc hợp lệ để xin nghỉ!');
      }

      const token = localStorage.getItem('admin_token');
      
      const finalReason = selectedShiftForModal.appointment_count > 0 
        ? `[KHẨN CẤP - Đã có khách] ${values.reason}` 
        : values.reason;

      const res = await fetch('http://localhost:4000/api/booking/shifts/request-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          from_shift_id: selectedShiftForModal.id,
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

  const nextWeek = () => setCurrentWeekStart(prev => prev.add(1, 'week'));
  const prevWeek = () => setCurrentWeekStart(prev => prev.subtract(1, 'week'));
  const currentWeek = () => setCurrentWeekStart(dayjs().startOf('isoWeek'));

  const weekDays = Array.from({ length: 7 }).map((_, i) => currentWeekStart.add(i, 'day'));
  const shiftTypes = ['MORNING', 'AFTERNOON', 'EVENING'];
  const shiftLabels = { 
     MORNING: { title: 'Sáng', time: '08:00 - 12:00' }, 
     AFTERNOON: { title: 'Chiều', time: '13:00 - 17:00' }, 
     EVENING: { title: 'Tối', time: '18:00 - 22:00' } 
  };

  // Xác định vai trò của người dùng hiện tại (DOCTOR, CONSULTANT, SALES, ...)
  let role = 'GUEST';
  try {
    const userStr = localStorage.getItem('admin_user');
    if (userStr && userStr !== "undefined") {
      role = JSON.parse(userStr).role;
    }
  } catch (error) {}

  const renderTimetable = () => {
    return (
      <div className="bg-white p-4 rounded-xl border border-gray-200 overflow-x-auto">
        <div className="flex justify-between items-center mb-4 min-w-[800px]">
           <Title level={4} className="m-0 text-blue-800">Lịch làm việc theo tuần</Title>
           <Space>
             <Button icon={<LeftOutlined />} onClick={prevWeek} />
             <Button onClick={currentWeek} type="primary" ghost>Tuần hiện tại</Button>
             <Button icon={<RightOutlined />} onClick={nextWeek} />
           </Space>
        </div>

        <table className="w-full border-collapse min-w-[800px] text-sm">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 py-3 text-blue-800 w-[120px]">Ca làm</th>
              {weekDays.map(day => (
                <th key={day.format('YYYY-MM-DD')} className="border border-gray-400 bg-gray-100 py-3 text-center">
                  <div className="text-blue-800 font-bold">{day.format('dddd').replace('Monday', 'Thứ 2').replace('Tuesday', 'Thứ 3').replace('Wednesday', 'Thứ 4').replace('Thursday', 'Thứ 5').replace('Friday', 'Thứ 6').replace('Saturday', 'Thứ 7').replace('Sunday', 'Chủ nhật')}</div>
                  <div className="font-medium text-blue-600">{day.format('DD/MM/YYYY')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shiftTypes.map(type => (
              <tr key={type}>
                <td className="border border-gray-400 bg-yellow-50 py-6 text-center text-gray-800">
                  <div className="font-bold text-lg">{shiftLabels[type].title}</div>
                  <div className="text-xs font-medium opacity-70 mt-1">{shiftLabels[type].time}</div>
                </td>
                {weekDays.map(day => {
                  const dateStr = day.format('YYYY-MM-DD');
                  const shift = shifts.find(s => s.date === dateStr && s.shift_type === type);
                  
                  return (
                    <td key={dateStr} className="border border-gray-400 p-2 text-center h-[80px] align-middle hover:bg-gray-50 transition-colors">
                      {shift ? (
                        <div className="flex flex-col items-center gap-1">
                          {role === 'DOCTOR' ? (
                              <span className={`px-3 py-1 rounded-full font-medium shadow-sm ${shift.appointment_count > 0 ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-green-100 text-green-700 border border-green-300'}`}>
                                 {shift.appointment_count > 0 ? `Có ${shift.appointment_count} khách` : 'Chưa có khách đặt'}
                              </span>
                          ) : (
                              <span className="px-3 py-1 rounded-full font-medium shadow-sm bg-blue-100 text-blue-700 border border-blue-300">
                                 Có lịch làm
                              </span>
                          )}
                          
                          {shift.status !== 'SCHEDULED' && <span className="text-xs font-bold text-blue-600 mt-1">[{shift.status}]</span>}
                        </div>
                      ) : (
                        <span className="text-gray-300 italic">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const tabItems = [
    {
      key: 'upcoming',
      label: <span><CalendarOutlined /> Lịch Làm Việc Của Tôi</span>,
      children: (
        <div className="space-y-4">
          <div className="text-right">
             <Button type="primary" danger onClick={openRequestModal}>
               Xin nghỉ / Đổi ca
             </Button>
          </div>
          {loading ? <div className="text-center py-10">Đang tải...</div> : renderTimetable()}
        </div>
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
             let dateStr = dayjs(req.createdAt).format('DD/MM/YYYY'); 
             
             if (req.WorkShift) {
                switch(req.WorkShift.shift_type) {
                  case 'MORNING': shiftInfo = { label: 'Ca Sáng', time: '08:00 - 12:00' }; break;
                  case 'AFTERNOON': shiftInfo = { label: 'Ca Chiều', time: '13:00 - 17:00' }; break;
                  case 'EVENING': shiftInfo = { label: 'Ca Tối', time: '18:00 - 22:00' }; break;
                  default: break;
                }
                dateStr = dayjs(req.WorkShift.date).format('DD/MM/YYYY');
             }
             const isEmergency = req.reason.includes('[KHẨN CẤP');
             
             let statusTag = <Tag color="processing">Đang chờ</Tag>;
             if (req.status === 'APPROVED') statusTag = <Tag color="success">Đã duyệt</Tag>;
             if (req.status === 'REJECTED') statusTag = <Tag color="error">Từ chối</Tag>;

             return (
               <List.Item className={`rounded-lg mb-3 p-4 border ${isEmergency ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                 <div className="w-full">
                   <div className="flex justify-between mb-2">
                     <Text strong className={isEmergency ? "text-red-700" : "text-blue-700"}>Xin nghỉ {shiftInfo.label} ({dateStr})</Text>
                     {statusTag}
                   </div>
                   <div className="bg-white p-2 border rounded"><Text type="secondary">Lý do:</Text> {req.reason}</div>
                 </div>
               </List.Item>
             );
          }}
          locale={{ emptyText: 'Bạn chưa gửi đơn xin nghỉ/đổi ca nào.' }}
        />
      )
    }
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <Card bordered={false} className="shadow-sm">
        <Tabs items={tabItems} defaultActiveKey="upcoming" />
      </Card>

      <Modal title={isEmergencyModal ? "🚨 YÊU CẦU NGHỈ ĐỘT XUẤT" : "Gửi Đơn Xin Nghỉ / Đổi Ca"} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null}>
        
        {isEmergencyModal ? (
          <div className="mb-4 p-3 bg-red-50 text-red-800 rounded border border-red-200 text-sm">
            <AlertOutlined className="mr-2 text-red-600 text-lg" />
            <b>CẢNH BÁO NGHIÊM TRỌNG:</b> Ca làm này đang có khách hàng chờ khám. Việc bạn nghỉ đột xuất sẽ gây gián đoạn quy trình. Vui lòng ghi rõ lý do bất khả kháng và đề xuất hướng giải quyết.
          </div>
        ) : (
          <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
            <InfoCircleOutlined className="mr-2" />
            Vui lòng chọn ngày và ca làm việc bạn muốn xin nghỉ. Yêu cầu sẽ được gửi tới Quản lý để phê duyệt.
          </div>
        )}
        
        <Form form={form} layout="vertical" onFinish={handleRequestOff}>
          <Row gutter={16}>
             <Col span={12}>
                <Form.Item name="date" label="Ngày làm việc" rules={[{ required: true, message: 'Chọn ngày' }]}>
                   <DatePicker 
                     format="DD/MM/YYYY" 
                     className="w-full" 
                     onChange={() => {
                        form.setFieldsValue({ shift_id: null }); // Xóa trắng ca khi đổi ngày
                        handleShiftSelectionChange();
                     }} 
                   />
                </Form.Item>
             </Col>
             <Col span={12}>
                <Form.Item name="shift_id" label="Ca làm việc" rules={[{ required: true, message: 'Chọn ca' }]}>
                   {/* Đã thêm selectedDateValue vào Dependencies để ép list Cập nhật */}
                   <Select placeholder="Chọn ca muốn nghỉ" onChange={handleShiftSelectionChange}>
                      {shifts.filter(s => s.date === selectedDateValue?.format('YYYY-MM-DD')).map(s => (
                         <Select.Option key={s.id} value={s.id}>
                            {s.shift_type === 'MORNING' ? 'Ca Sáng (08:00 - 12:00)' : s.shift_type === 'AFTERNOON' ? 'Ca Chiều (13:00 - 17:00)' : 'Ca Tối (18:00 - 22:00)'}
                         </Select.Option>
                      ))}
                   </Select>
                </Form.Item>
             </Col>
          </Row>

          <Form.Item name="reason" label="Lý do cụ thể / Đề xuất hỗ trợ" rules={[{ required: true, message: 'Vui lòng nhập lý do!' }]}>
            <Input.TextArea rows={4} placeholder={isEmergencyModal ? "VD: Tôi bị tai nạn giao thông khẩn cấp..." : "VD: Nhà có việc bận đột xuất, xin đổi ca..."} />
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