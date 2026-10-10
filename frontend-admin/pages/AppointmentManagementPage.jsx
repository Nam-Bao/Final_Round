import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Calendar, Badge, Modal, Form, Input, Select, DatePicker, Button, List, Typography, Space, Tag, Popconfirm, message, Divider } from 'antd';
import { CalendarOutlined, PlusOutlined, PhoneOutlined, UserOutlined, DeleteOutlined, AlertOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;

export default function AppointmentManagementPage() {
  const [appointments, setAppointments] = useState([]);
  const [medicalFollowUps, setMedicalFollowUps] = useState([]); 
  const [customers, setCustomers] = useState([]);
  
  const [doctors, setDoctors] = useState([]); 
  const [availableSlots, setAvailableSlots] = useState([]); 
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [resApt, resCust, resFollowUps] = await Promise.all([
        axios.get('http://localhost:4000/api/booking/appointments', { headers }),
        axios.get('http://localhost:4000/api/identity/users/customers', { headers }),
        axios.get('http://localhost:4000/api/identity/medical-records/follow-ups/upcoming', { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      setAppointments(resApt.data?.data || []);
      setCustomers(resCust.data?.data || []);
      setMedicalFollowUps(resFollowUps.data?.data || []);
    } catch (error) {
      message.error('Không thể tải toàn bộ dữ liệu');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchAvailableDoctors = async (dateStr) => {
    try {
      const token = localStorage.getItem('admin_token');
      const resDoc = await axios.get(`http://localhost:4000/api/booking/appointments/doctors-available?date=${dateStr}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setDoctors(resDoc.data?.data || []);
      return resDoc.data?.data || [];
    } catch (error) {
       return [];
    }
  };

  const fetchAvailableSlots = async (doctorId, customDateStr = null) => {
    if (!doctorId) return [];
    try {
      const dateStr = customDateStr || form.getFieldValue('appointment_date').format('YYYY-MM-DD');
      const token = localStorage.getItem('admin_token');
      const resSlot = await axios.get(`http://localhost:4000/api/booking/appointments/slots-available?date=${dateStr}&doctorId=${doctorId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setAvailableSlots(resSlot.data?.data || []);
      return resSlot.data?.data || [];
    } catch (error) {
      return [];
    }
  };

  // --- LOGIC GỘP VÀ LOẠI TRỪ TRÙNG LẶP ---
  const getUpcomingReminders = () => {
    const today = dayjs().startOf('day');
    const threeDaysLater = dayjs().add(3, 'day').endOf('day');

    // 1. Nhắc nhở từ bảng Lịch Hẹn (Khách đã chốt lịch)
    const aptReminders = (appointments || [])
      .filter(apt => {
        if (!apt.appointment_date) return false;
        const aptDate = dayjs(apt.appointment_date);
        return (apt.status === 'PENDING' || apt.status === 'CONFIRMED') && aptDate.isAfter(today) && aptDate.isSameOrBefore(threeDaysLater);
      })
      .map(apt => ({
         id: apt.id,
         isMedicalRecord: false,
         customer_id: apt.customer_id,
         date: apt.appointment_date,
         time: apt.appointment_time ? String(apt.appointment_time).slice(0,5) : '--:--',
         type: apt.type,
         raw: apt
      }));

    // 2. Nhắc nhở từ Sổ Y Bạ (Bác sĩ hẹn nhưng chưa chốt giờ)
    const followUpReminders = (medicalFollowUps || [])
      .filter(record => {
         // KIỂM TRA: Nếu khách NÀY đã có 1 lịch Tái khám đang chờ/đã xác nhận -> ẨN nhắc nhở Y bạ đi
         const alreadyScheduled = appointments.some(apt => 
            apt.customer_id === record.customer_id && 
            apt.type === 'FOLLOW_UP' && 
            (apt.status === 'PENDING' || apt.status === 'CONFIRMED')
         );
         return !alreadyScheduled; // Chỉ giữ lại những người CHƯA được xếp lịch
      })
      .map(record => {
         const oldApt = appointments.find(a => a.id === record.appointment_id);
         return {
             id: record.id,
             isMedicalRecord: true,
             customer_id: record.customer_id,
             customer_name: record.Customer?.Profile?.full_name || 'Khách',
             customer_phone: record.Customer?.Profile?.phone || 'Chưa có SĐT',
             date: record.follow_up_date,
             time: 'Chưa xếp giờ',
             type: 'FOLLOW_UP',
             old_time: oldApt ? oldApt.appointment_time : null,
             raw: record
         };
      });

    return [...aptReminders, ...followUpReminders].sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix());
  };

  const dateCellRender = (value) => {
    const dateStr = value.format('YYYY-MM-DD');
    const listData = (appointments || []).filter(apt => apt.appointment_date === dateStr && apt.status !== 'CANCELLED');
    
    return (
      <ul className="events p-0 m-0 list-none">
        {listData.map(item => {
           let color = 'default';
           if (item.status === 'CONFIRMED') color = 'processing';
           if (item.type === 'FOLLOW_UP') color = 'warning';
           
           const custName = customers.find(c => c.id === item.customer_id)?.Profile?.full_name || 'Khách';
           const timeStr = item.appointment_time ? String(item.appointment_time).slice(0,5) : '--:--';

           return (
            <li key={item.id} className="mb-1 text-xs truncate cursor-pointer hover:opacity-80" onClick={(e) => { e.stopPropagation(); handleEdit(item.raw ? item.raw : item); }}>
              <Badge status={color} text={`${timeStr} - ${custName}`} />
            </li>
           );
        })}
      </ul>
    );
  };

  const cellRender = (current, info) => {
    if (info.type === 'date') return dateCellRender(current);
    return info.originNode;
  };

  const handleSelectDate = (date) => {
    setSelectedDate(date);
    form.resetFields();
    form.setFieldsValue({ appointment_date: date });
    setEditingAppointment(null);
    setIsModalVisible(true);
    fetchAvailableDoctors(date.format('YYYY-MM-DD'));
  };

  const handleEdit = async (item) => {
    if (item.isMedicalRecord) {
      setEditingAppointment(null);
      form.resetFields();
      
      const targetDate = dayjs(item.date);
      form.setFieldsValue({
        customer_id: item.customer_id,
        type: 'FOLLOW_UP',
        appointment_date: targetDate,
        method: 'OFFLINE'
      });
      
      setIsModalVisible(true); 
      
      const docs = await fetchAvailableDoctors(targetDate.format('YYYY-MM-DD'));
      const oldDocId = item.raw.doctor_id;
      
      if (oldDocId && docs.some(d => d.id === oldDocId)) {
         form.setFieldsValue({ doctor_id: oldDocId });
         
         const slots = await fetchAvailableSlots(oldDocId, targetDate.format('YYYY-MM-DD'));
         const oldTime = item.old_time ? String(item.old_time).slice(0, 5) : null;
         
         if (oldTime && slots.includes(oldTime)) {
             form.setFieldsValue({ appointment_time: oldTime });
             message.success('Đã điền tự động Bác sĩ và Giờ khám cũ!');
         } else {
             message.info('Giờ khám cũ đã bị người khác đặt hoặc đã qua, vui lòng chọn giờ khác.');
         }
      } else {
         message.info('Bác sĩ khám lần trước không có ca trực vào ngày này!');
      }
    } else {
      const record = item.raw || item;
      setEditingAppointment(record);
      form.setFieldsValue({
        ...record,
        appointment_date: record.appointment_date ? dayjs(record.appointment_date) : dayjs(),
        appointment_time: record.appointment_time ? String(record.appointment_time).slice(0, 5) : null,
        method: record.pre_notes?.includes('[ONLINE]') ? 'ONLINE' : 'OFFLINE',
        pre_notes: record.pre_notes?.replace('[ONLINE] ', '')
      });
      
      setIsModalVisible(true);
      const aptDate = record.appointment_date ? dayjs(record.appointment_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      await fetchAvailableDoctors(aptDate); 
      if (record.doctor_id) await fetchAvailableSlots(record.doctor_id, aptDate);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${id}/cancel`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã hủy lịch!');
      fetchData();
      setIsModalVisible(false);
    } catch (error) {
      message.error('Lỗi hủy lịch');
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const payload = {
        customer_id: values.customer_id,
        doctor_id: values.doctor_id,
        type: values.type,
        appointment_date: values.appointment_date ? values.appointment_date.format('YYYY-MM-DD') : null,
        appointment_time: values.appointment_time, 
        symptoms: values.symptoms,
        pre_notes: values.method === 'ONLINE' ? `[ONLINE] ${values.pre_notes || ''}` : values.pre_notes
      };

      if (editingAppointment) {
        await axios.put(`http://localhost:4000/api/booking/appointments/${editingAppointment.id}`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Cập nhật thành công!');
      } else {
        await axios.post(`http://localhost:4000/api/booking/appointments`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        message.success('Tạo lịch thành công!');
      }
      setIsModalVisible(false);
      fetchData();
    } catch (error) {
      message.error('Có lỗi xảy ra!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={18} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm overflow-y-auto" styles={{ body: { padding: 10 } }}>
          <div className="flex justify-between items-center mb-4 p-2">
            <Title level={4} className="m-0 text-blue-800"><CalendarOutlined className="mr-2"/> Lịch Khám & Dịch vụ</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleSelectDate(dayjs())}>Tạo Lịch Mới</Button>
          </div>
          <Calendar cellRender={cellRender} onSelect={handleSelectDate} className="custom-calendar" />
        </Card>
      </Col>

      <Col span={6} className="h-full">
        <Card title={<><AlertOutlined className="text-orange-500 mr-2"/> Cần gọi nhắc (3 ngày tới)</>} variant="borderless" className="h-full shadow-sm bg-orange-50 border-orange-100" styles={{ body: { padding: 0, overflowY: 'auto', height: 'calc(100% - 55px)' } }}>
          <List
            dataSource={getUpcomingReminders()}
            locale={{ emptyText: 'Không có lịch nhắc nhở nào sắp tới.' }}
            renderItem={item => {
              const cust = item.isMedicalRecord ? item : customers.find(c => c.id === item.customer_id);
              const custName = item.isMedicalRecord ? item.customer_name : cust?.Profile?.full_name;
              const custPhone = item.isMedicalRecord ? item.customer_phone : cust?.Profile?.phone;
              const daysLeft = dayjs(item.date).diff(dayjs().startOf('day'), 'day');
              
              return (
                <List.Item className="px-4 py-3 border-b border-orange-100 hover:bg-orange-100 cursor-pointer" onClick={() => handleEdit(item)}>
                  <List.Item.Meta
                    title={<b className="text-gray-800">{custName || 'Khách không tên'}</b>}
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" className="text-xs"><PhoneOutlined/> {custPhone || 'Chưa có SĐT'}</Text>
                        <Text className={`text-sm font-medium mt-1 ${item.isMedicalRecord ? 'text-red-500' : ''}`}>
                           Ngày hẹn: {dayjs(item.date).format('DD/MM/YYYY')} ({item.time})
                        </Text>
                      </Space>
                    }
                  />
                  <div className="text-right">
                    <Tag color={daysLeft <= 1 ? "red" : "orange"} className="mr-0 mb-1 block text-center">
                      Còn {daysLeft} ngày
                    </Tag>
                    {item.isMedicalRecord ? (
                      <Tag icon={<HistoryOutlined />} color="error" className="mr-0 text-xs">Y bạ: Gọi xếp lịch</Tag>
                    ) : (
                      item.type === 'FOLLOW_UP' && <Tag color="cyan" className="mr-0 text-xs mt-1 block">Tái khám</Tag>
                    )}
                  </div>
                </List.Item>
              )
            }}
          />
        </Card>
      </Col>

      <Modal
        title={editingAppointment ? 'Cập nhật Lịch hẹn' : 'Tạo Lịch hẹn mới'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ method: 'OFFLINE', type: 'NEW_EXAM' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_id" label="Khách hàng" rules={[{ required: true, message: 'Hãy chọn khách hàng' }]}>
                <Select showSearch placeholder="Tìm theo tên/SĐT" filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={(customers || []).map(c => ({ value: c.id, label: `${c.Profile?.full_name || 'Khách'} - ${c.Profile?.phone || ''}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="Loại hình" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="NEW_EXAM">Khám mới</Select.Option>
                  <Select.Option value="FOLLOW_UP">Tái khám (Chỉ định cũ)</Select.Option>
                  <Select.Option value="TREATMENT">Làm liệu trình</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="appointment_date" label="Ngày khám" rules={[{ required: true }]}>
                <DatePicker 
                  format="DD/MM/YYYY" 
                  className="w-full" 
                  onChange={(val) => {
                     form.setFieldsValue({ doctor_id: null, appointment_time: null });
                     setAvailableSlots([]);
                     if (val) fetchAvailableDoctors(val.format('YYYY-MM-DD'));
                     else setDoctors([]);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="doctor_id" label="Bác sĩ (Tuỳ chọn)">
                <Select 
                   placeholder={doctors.length > 0 ? "Chọn Bác sĩ" : "Không có bác làm việc"} 
                   allowClear
                   onChange={(val) => {
                      form.setFieldsValue({ appointment_time: null });
                      if (val) fetchAvailableSlots(val);
                      else setAvailableSlots([]);
                   }}
                >
                  {(doctors || []).map(d => <Select.Option key={d.id} value={d.id}>{d.Profile?.full_name || 'Bác sĩ'}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="appointment_time" label="Giờ khám" rules={[{ required: true, message: 'Vui lòng chọn giờ' }]}>
                 <Select placeholder="Chọn giờ trống">
                    {(availableSlots || []).map(time => (
                      <Select.Option key={time} value={time}>{time}</Select.Option>
                    ))}
                    {editingAppointment && editingAppointment.appointment_time && !availableSlots.includes(String(editingAppointment.appointment_time).slice(0,5)) && (
                       <Select.Option value={String(editingAppointment.appointment_time).slice(0,5)}>
                         {String(editingAppointment.appointment_time).slice(0,5)} (Giờ cũ)
                       </Select.Option>
                    )}
                 </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider className="my-2" />

          <Form.Item name="method" label="Hình thức tiếp nhận">
            <Select>
              <Select.Option value="OFFLINE">Trực tiếp tại phòng khám</Select.Option>
              <Select.Option value="ONLINE">Tư vấn Online (Qua điện/Zalo)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="symptoms" label="Lý do / Mô tả tình trạng chung">
            <Input.TextArea rows={2} placeholder="Nhập yêu cầu hoặc tình trạng của khách hàng..." />
          </Form.Item>

          <div className="flex justify-between items-center mt-6">
            {editingAppointment ? (
              <Popconfirm title="Bạn có chắc muốn HỦY lịch này?" onConfirm={() => handleDelete(editingAppointment.id)}>
                <Button danger type="text" icon={<DeleteOutlined />}>Hủy Lịch</Button>
              </Popconfirm>
            ) : <div/>}
            
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Đóng</Button>
              <Button type="primary" htmlType="submit" loading={loading}>Lưu Lịch Hẹn</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </Row>
  );
}