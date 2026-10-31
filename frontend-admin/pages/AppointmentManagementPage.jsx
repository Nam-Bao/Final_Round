import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Calendar, Badge, Modal, Form, Input, Select, DatePicker, Button, List, Typography, Space, Tag, Popconfirm, message, Radio } from 'antd';
import { CalendarOutlined, PlusOutlined, PhoneOutlined, UserOutlined, DeleteOutlined, AlertOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { useLocation } from 'react-router-dom'; 
dayjs.extend(isSameOrBefore);

const { Title, Text } = Typography;

export default function AppointmentManagementPage() {
  const [appointments, setAppointments] = useState([]);
  const [medicalFollowUps, setMedicalFollowUps] = useState([]); 
  const [customers, setCustomers] = useState([]); 
  const [patientProfiles, setPatientProfiles] = useState([]); 
  
  const [doctors, setDoctors] = useState([]); 
  const [availableSlots, setAvailableSlots] = useState([]); 
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [customerType, setCustomerType] = useState('EXISTING'); 
  
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const location = useLocation(); 

  const fetchData = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
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
      message.error('Không thể tải dữ liệu');
    }
  };

  useEffect(() => { fetchData(); }, []);
  
  useEffect(() => {
      if (location.state?.autoFillCustomerId) {
         setEditingAppointment(null);
         form.resetFields();
         setIsModalVisible(true);
         setCustomerType('EXISTING');
         form.setFieldsValue({ 
             customer_id: location.state.autoFillCustomerId,
             type: 'NEW_EXAM',
             appointment_date: dayjs(),
             method: 'OFFLINE'
         });
         fetchPatientProfiles(location.state.autoFillCustomerId);
         fetchAvailableDoctors(dayjs().format('YYYY-MM-DD'));
      }
  }, [location.state, form]);

  const fetchPatientProfiles = async (userId, fallbackProfileId = null) => {
    const selectedUser = customers.find(c => c.id === userId);
    if (selectedUser && selectedUser.PatientProfiles && selectedUser.PatientProfiles.length > 0) {
        setPatientProfiles(selectedUser.PatientProfiles);
        return;
    }

    try {
       const token = sessionStorage.getItem('admin_token');
       const res = await axios.get(`http://localhost:4000/api/identity/profile/patients/user/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } });
       setPatientProfiles(res.data?.data || []);
    } catch (error) {
       setPatientProfiles([{ 
           id: fallbackProfileId || 'mock-id-ban-than', 
           full_name: selectedUser?.Profile?.full_name || 'Bản thân', 
           relationship: 'Bản thân' 
       }]);
    }
  };

  const fetchAvailableDoctors = async (dateStr) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const resDoc = await axios.get(`http://localhost:4000/api/booking/appointments/doctors-available?date=${dateStr}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setDoctors(resDoc.data?.data || []);
      return resDoc.data?.data || [];
    } catch (error) { return []; }
  };

  const fetchAvailableSlots = async (doctorId, customDateStr = null) => {
    if (!doctorId) return [];
    try {
      const formDate = form.getFieldValue('appointment_date');
      const dateStr = customDateStr || (formDate ? formDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
      
      const token = sessionStorage.getItem('admin_token');
      const resSlot = await axios.get(`http://localhost:4000/api/booking/appointments/slots-available?date=${dateStr}&doctorId=${doctorId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      setAvailableSlots(resSlot.data?.data || []);
      return resSlot.data?.data || [];
    } catch (error) { return []; }
  };

  const getUpcomingReminders = () => {
    const today = dayjs().startOf('day');
    const threeDaysLater = dayjs().add(3, 'day').endOf('day');

    const aptReminders = (appointments || []).filter(apt => {
        if (!apt.appointment_date) return false;
        const aptDate = dayjs(apt.appointment_date);
        return (apt.status === 'PENDING' || apt.status === 'CONFIRMED') && aptDate.isAfter(today) && aptDate.isSameOrBefore(threeDaysLater);
      }).map(apt => ({
         id: apt.id, isMedicalRecord: false, customer_id: apt.customer_id,
         date: apt.appointment_date, time: apt.appointment_time ? String(apt.appointment_time).slice(0,5) : '--:--',
         type: apt.type, raw: apt
      }));

    // Bệnh án không lưu customer_id => lấy tài khoản từ hồ sơ bệnh nhân (Patient.user_id), lùi về lịch hẹn cũ
    const followUpReminders = (medicalFollowUps || []).map(record => {
         const oldApt = appointments.find(a => a.id === record.appointment_id);
         return {
             id: record.id, isMedicalRecord: true,
             customer_id: record.Patient?.user_id || oldApt?.customer_id,
             patient_profile_id: record.patient_profile_id || oldApt?.patient_profile_id,
             doctor_id: record.doctor_id || oldApt?.doctor_id,
             customer_name: record.Patient?.full_name || 'Khách', customer_phone: record.Patient?.phone || 'Chưa có',
             date: record.follow_up_date, time: 'Chưa xếp giờ', type: 'FOLLOW_UP', old_time: oldApt ? oldApt.appointment_time : null, raw: record
         };
      }).filter(item => {
         const alreadyScheduled = appointments.some(apt => apt.patient_profile_id === item.patient_profile_id && apt.type === 'FOLLOW_UP' && (apt.status === 'PENDING' || apt.status === 'CONFIRMED'));
         return !alreadyScheduled;
      });

    return [...aptReminders, ...followUpReminders].sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix());
  };

  // Lịch có thể đặt cho người thân => hiện tên/SĐT của HỒ SƠ được khám, chỉ lùi về tên tài khoản khi lịch cũ chưa có hồ sơ
  const getPatientInfo = (customerId, profileId) => {
    const cust = customers.find(c => c.id === customerId);
    const profile = cust?.PatientProfiles?.find(p => p.id === profileId);
    return {
      name: profile?.full_name || cust?.Profile?.full_name,
      phone: profile?.phone || cust?.Profile?.phone
    };
  };

  const dateCellRender = (value) => {
    if (!value) return null;
    const dateStr = value.format('YYYY-MM-DD');
    const listData = (appointments || []).filter(apt => apt.appointment_date === dateStr && apt.status !== 'CANCELLED');
    
    return (
      <ul className="events p-0 m-0 list-none">
        {listData.map(item => {
           let color = 'default'; 
           if (item.status === 'WAITING_FOR_SALE' || item.status === 'COMPLETED') color = 'processing'; 
           else if (item.type === 'FOLLOW_UP') color = 'warning'; 
           
           const custName = getPatientInfo(item.customer_id, item.patient_profile_id).name || 'Khách';
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
    const safeDate = date || dayjs();
    form.resetFields();
    form.setFieldsValue({ appointment_date: safeDate, method: 'OFFLINE', type: 'NEW_EXAM' });
    setCustomerType('EXISTING');
    setEditingAppointment(null);
    setIsModalVisible(true);
    fetchAvailableDoctors(safeDate.format('YYYY-MM-DD'));
  };

  const handleEdit = async (item) => {
    if (item.isMedicalRecord) {
      setEditingAppointment(null);
      form.resetFields();
      setCustomerType('EXISTING');
      
      const targetDate = dayjs(item.date);
      form.setFieldsValue({
        customer_id: item.customer_id, patient_profile_id: item.patient_profile_id,
        type: 'FOLLOW_UP', appointment_date: targetDate, method: 'OFFLINE',
        symptoms: item.raw?.diagnosis ? `Tái khám: ${item.raw.diagnosis}` : undefined
      });

      setIsModalVisible(true);
      if (item.customer_id) fetchPatientProfiles(item.customer_id, item.patient_profile_id);
      else message.warning('Không tìm thấy tài khoản của khách, vui lòng chọn thủ công.');

      const dateStr = targetDate.format('YYYY-MM-DD');
      const docs = await fetchAvailableDoctors(dateStr);
      const oldDocId = item.doctor_id;
      if (oldDocId && docs.some(d => d.id === oldDocId)) {
         form.setFieldsValue({ doctor_id: oldDocId });
         const slots = await fetchAvailableSlots(oldDocId, dateStr);
         const oldTime = item.old_time ? String(item.old_time).slice(0, 5) : null;
         if (oldTime && slots.includes(oldTime)) form.setFieldsValue({ appointment_time: oldTime });
         else if (oldTime) message.info(`Giờ khám lần trước (${oldTime}) đã kín, vui lòng chọn giờ khác.`);
      } else if (oldDocId) {
         message.info('Bác sĩ khám lần trước không có ca vào ngày tái khám, vui lòng chọn bác sĩ khác.');
      }
    } else {
      const record = item.raw || item;
      setEditingAppointment(record);
      setCustomerType('EXISTING');
      form.setFieldsValue({
        ...record,
        appointment_date: record.appointment_date ? dayjs(record.appointment_date) : dayjs(),
        appointment_time: record.appointment_time ? String(record.appointment_time).slice(0, 5) : null,
        method: record.pre_notes?.includes('[ONLINE]') ? 'ONLINE' : 'OFFLINE',
        pre_notes: record.pre_notes?.replace('[ONLINE] ', '')
      });
      
      setIsModalVisible(true);
      if (record.customer_id) fetchPatientProfiles(record.customer_id, record.patient_profile_id);
      
      const aptDate = record.appointment_date ? dayjs(record.appointment_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      await fetchAvailableDoctors(aptDate); 
      if (record.doctor_id) await fetchAvailableSlots(record.doctor_id, aptDate);
    }
  };

  const handleDelete = async (id) => {
    try {
      const token = sessionStorage.getItem('admin_token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${id}/cancel`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success('Đã hủy lịch!');
      fetchData();
      setIsModalVisible(false);
    } catch (error) { message.error('Lỗi hủy lịch'); }
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      let finalCustomerId = values.customer_id;
      let finalPatientProfileId = values.patient_profile_id;

      if (customerType === 'NEW' && !editingAppointment) {
          const resNewUser = await axios.post(`http://localhost:4000/api/identity/users/quick-customer`, {
              email: values.new_email, full_name: values.new_full_name, phone: values.new_phone
          }, { headers: { 'Authorization': `Bearer ${token}` } });
          
          finalCustomerId = resNewUser.data.data.userId;
          finalPatientProfileId = resNewUser.data.data.patientProfileId;
      }

      const payload = {
        customer_id: finalCustomerId, patient_profile_id: finalPatientProfileId,
        doctor_id: values.doctor_id, type: values.type,
        appointment_date: values.appointment_date ? values.appointment_date.format('YYYY-MM-DD') : null,
        appointment_time: values.appointment_time, symptoms: values.symptoms,
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
      message.error(error.response?.data?.message || 'Có lỗi xảy ra!');
    } finally { setLoading(false); }
  };

  const isReadOnly = editingAppointment && (editingAppointment.status === 'WAITING_FOR_SALE' || editingAppointment.status === 'COMPLETED');

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={18} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm overflow-y-auto" styles={{ body: { padding: 10 } }}>
          <div className="flex justify-between items-center mb-4 p-2">
            <Title level={4} className="m-0 text-blue-800"><CalendarOutlined className="mr-2"/> Lịch Khám & Dịch vụ</Title>
            <Space className="text-xs font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
               <span><Badge status="processing" /> Đã khám xong</span>
               <span><Badge status="warning" /> Tái khám</span>
               <span><Badge status="default" /> Sắp tới / Chưa khám</span>
            </Space>
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
              const patient = item.isMedicalRecord ? null : getPatientInfo(item.customer_id, item.raw?.patient_profile_id);
              const custName = item.isMedicalRecord ? item.customer_name : patient.name;
              const custPhone = item.isMedicalRecord ? item.customer_phone : patient.phone;
              const daysLeft = dayjs(item.date).diff(dayjs().startOf('day'), 'day');
              
              return (
                <List.Item className="px-4 py-3 border-b border-orange-100 hover:bg-orange-100 cursor-pointer" onClick={() => handleEdit(item)}>
                  <List.Item.Meta
                    title={<b className="text-gray-800">{custName || 'Khách không tên'}</b>}
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" className="text-xs"><PhoneOutlined/> {custPhone || 'Chưa có SĐT'}</Text>
                        <Text className={`text-sm font-medium mt-1 ${item.isMedicalRecord ? 'text-red-500' : ''}`}>Ngày hẹn: {dayjs(item.date).format('DD/MM/YYYY')} ({item.time})</Text>
                      </Space>
                    }
                  />
                  <div className="text-right">
                    <Tag color={daysLeft <= 1 ? "red" : "orange"} className="mr-0 mb-1 block text-center">Còn {daysLeft} ngày</Tag>
                    {item.isMedicalRecord ? <Tag icon={<HistoryOutlined />} color="error" className="mr-0 text-xs">Y bạ: Gọi xếp lịch</Tag> : item.type === 'FOLLOW_UP' && <Tag color="cyan" className="mr-0 text-xs mt-1 block">Tái khám</Tag>}
                  </div>
                </List.Item>
              )
            }}
          />
        </Card>
      </Col>

      <Modal title={editingAppointment ? 'Cập nhật Lịch hẹn' : 'Tạo Lịch hẹn mới'} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null} width={700}>
        {isReadOnly && (
           <div className="mb-4 p-3 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-sm flex gap-2">
              <AlertOutlined className="mt-1" />
              <p>Khách hàng này <b>đã khám xong</b>. Dữ liệu đã được bác sĩ lưu vào bệnh án nên không thể chỉnh sửa hoặc hủy lịch nữa.</p>
           </div>
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ method: 'OFFLINE', type: 'NEW_EXAM' }} disabled={isReadOnly}>
          
          {!editingAppointment && (
            <div className="mb-4 text-center">
              <Radio.Group value={customerType} onChange={e => setCustomerType(e.target.value)} buttonStyle="solid">
                <Radio.Button value="EXISTING">Khách đã có tài khoản</Radio.Button>
                <Radio.Button value="NEW">Khách mới (Vãng lai)</Radio.Button>
              </Radio.Group>
            </div>
          )}

          <Row gutter={16}>
            {customerType === 'EXISTING' ? (
              <>
                <Col span={12}>
                  <Form.Item name="customer_id" label="Tài khoản Khách hàng" rules={[{ required: true, message: 'Hãy chọn tài khoản' }]}>
                    <Select 
                      showSearch placeholder="Tìm theo tên/SĐT" 
                      filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} 
                      onChange={val => { form.setFieldsValue({ patient_profile_id: null }); fetchPatientProfiles(val, null); }}
                      options={(customers || []).map(c => ({ value: c.id, label: `${c.Profile?.full_name || 'Khách'} - ${c.Profile?.phone || ''}` }))} 
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="patient_profile_id" label="Chọn Hồ Sơ Bệnh Nhân" rules={[{ required: true, message: 'Vui lòng chọn hồ sơ' }]}>
                    <Select placeholder="-- Khám cho ai? --">
                      {(patientProfiles || []).map(p => (<Select.Option key={p.id} value={p.id}>{p.full_name} ({p.relationship})</Select.Option>))}
                    </Select>
                  </Form.Item>
                </Col>
              </>
            ) : (
              <>
                <Col span={8}>
                  <Form.Item name="new_full_name" label="Họ và Tên Khách" rules={[{ required: true, message: 'Bắt buộc' }]}>
                    <Input placeholder="Nhập họ tên đầy đủ" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="new_phone" label="Số điện thoại" rules={[{ required: true, message: 'Bắt buộc' }]}>
                    <Input placeholder="Nhập số điện thoại" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="new_email" label="Email đăng nhập" rules={[{ required: true, type: 'email', message: 'Phải là Email hợp lệ' }]}>
                    <Input placeholder="Ví dụ: khachhang@gmail.com" />
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="Loại hình khám">
                <Select><Select.Option value="NEW_EXAM">Khám mới</Select.Option><Select.Option value="FOLLOW_UP">Tái khám (Chỉ định cũ)</Select.Option><Select.Option value="TREATMENT">Làm liệu trình</Select.Option></Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="method" label="Hình thức tiếp nhận">
                <Select><Select.Option value="OFFLINE">Trực tiếp tại phòng khám</Select.Option><Select.Option value="ONLINE">Tư vấn Online (Qua Video/Zalo)</Select.Option></Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="appointment_date" label="Ngày khám" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" className="w-full" onChange={(val) => {
                     form.setFieldsValue({ doctor_id: null, appointment_time: null });
                     setAvailableSlots([]);
                     if (val) {
                         fetchAvailableDoctors(val.format('YYYY-MM-DD'));
                     } else {
                         setDoctors([]);
                     }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="doctor_id" label="Bác sĩ (Tuỳ chọn)">
                <Select placeholder={doctors.length > 0 ? "Chọn Bác sĩ" : "Không có bác làm việc"} allowClear onChange={(val) => {
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
                    {(availableSlots || []).map(time => (<Select.Option key={time} value={time}>{time}</Select.Option>))}
                    {editingAppointment && editingAppointment.appointment_time && !availableSlots.includes(String(editingAppointment.appointment_time).slice(0,5)) && (
                       <Select.Option value={String(editingAppointment.appointment_time).slice(0,5)}>{String(editingAppointment.appointment_time).slice(0,5)} (Giờ cũ)</Select.Option>
                    )}
                 </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="symptoms" label="Lý do / Tình trạng ban đầu">
            <Input.TextArea rows={2} placeholder="Nhập yêu cầu hoặc tình trạng của khách hàng..." />
          </Form.Item>

          <div className="flex justify-between items-center mt-6">
            {editingAppointment && !isReadOnly ? (
              <Popconfirm title="Bạn có chắc muốn HỦY lịch này?" onConfirm={() => handleDelete(editingAppointment.id)}>
                <Button danger type="text" icon={<DeleteOutlined />}>Hủy Lịch</Button>
              </Popconfirm>
            ) : <div/>}
            
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Đóng</Button>
              {!isReadOnly && <Button type="primary" htmlType="submit" loading={loading}>Lưu Lịch Hẹn</Button>}
            </Space>
          </div>
        </Form>
      </Modal>
    </Row>
  );
}