import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Calendar, Badge, Modal, Form, Input, Select, DatePicker, Button, List, Typography, Space, Tag, message, Radio } from 'antd';
import { CalendarOutlined, PlusOutlined, PhoneOutlined, UserOutlined, DeleteOutlined, AlertOutlined, DollarOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLocation, useNavigate } from 'react-router-dom'; 

const { Title, Text } = Typography;

export default function AppointmentManagementPage() {
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]); 
  const [patientProfiles, setPatientProfiles] = useState([]); 
  
  const [doctors, setDoctors] = useState([]); 
  const [availableSlots, setAvailableSlots] = useState([]); 
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [customerType, setCustomerType] = useState('EXISTING'); 
  
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Hủy lịch: bên yêu cầu quyết định tiền cọc (khách => mất cọc, phòng khám => hoàn cọc)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelInitiator, setCancelInitiator] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  // Lịch do phòng khám hủy, chờ CSKH chuyển khoản hoàn cọc
  const [pendingRefunds, setPendingRefunds] = useState([]);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundRef, setRefundRef] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [resApt, resCust, resRefunds] = await Promise.all([
        axios.get('http://localhost:4000/api/booking/appointments', { headers }),
        axios.get('http://localhost:4000/api/identity/users/customers', { headers }),
        axios.get('http://localhost:4000/api/booking/appointments/pending-refunds', { headers }).catch(() => ({ data: { data: [] } }))
      ]);
      setPendingRefunds(resRefunds.data?.data || []);

      setAppointments(resApt.data?.data || []);
      setCustomers(resCust.data?.data || []);
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
           if (item.status === 'NO_SHOW') color = 'error';
           else if (item.status === 'WAITING_FOR_SALE' || item.status === 'COMPLETED') color = 'processing'; 
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
  };

  // Từ trang Gọi chăm sóc khách sang: mở sẵn lịch khách không đến được để đổi
  useEffect(() => {
    const appointmentId = location.state?.editAppointmentId;
    if (!appointmentId || appointments.length === 0) return;
    navigate(location.pathname, { replace: true, state: null });
    const target = appointments.find((apt) => apt.id === appointmentId);
    if (target) handleEdit(target);
    else message.warning('Không tìm thấy lịch hẹn cần đổi');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, appointments]);

  const NO_SHOW_GRACE_MINUTES = 15; // khớp server
  const canMarkNoShow = (apt) => apt && ['PENDING', 'CONFIRMED', 'WAITING'].includes(apt.status)
    && !dayjs().isBefore(dayjs(`${apt.appointment_date} ${String(apt.appointment_time).slice(0, 5)}`).add(NO_SHOW_GRACE_MINUTES, 'minute'));
  const handleNoShow = () => Modal.confirm({
    title: 'Ghi nhận khách không đến?',
    content: 'Khách mất tiền cọc như khi tự hủy. Cọc tư vấn đã trừ vào lịch này (nếu có) được trả lại cho khách.',
    okText: 'Khách không đến', okButtonProps: { danger: true }, cancelText: 'Đóng',
    onOk: async () => {
      try {
        const res = await axios.put(`http://localhost:4000/api/booking/appointments/${editingAppointment.id}/no-show`, {}, { headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
        message.success(res.data.message);
        setIsModalVisible(false);
        fetchData();
      } catch (error) { message.error(error.response?.data?.message || 'Không ghi nhận được'); }
    },
  });

  const openCancel = () => { setCancelInitiator(null); setCancelReason(''); setCancelOpen(true); };

  const handleCancelAppointment = async () => {
    if (!cancelInitiator) return message.warning('Chọn bên yêu cầu hủy lịch');
    if (cancelReason.trim().length < 10) return message.warning('Nhập lý do hủy (ít nhất 10 ký tự)');
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.put(`http://localhost:4000/api/booking/appointments/${editingAppointment.id}/cancel`,
        { initiator: cancelInitiator, reason: cancelReason.trim() }, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success(res.data.message || 'Đã hủy lịch!');
      setCancelOpen(false);
      setIsModalVisible(false);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Lỗi hủy lịch');
    } finally { setLoading(false); }
  };

  const handleConfirmRefund = async () => {
    if (refundRef.trim().length < 4) return message.warning('Nhập mã giao dịch chuyển khoản (ít nhất 4 ký tự)');
    setLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await axios.put(`http://localhost:4000/api/booking/appointments/${refundTarget.appointment_id}/refund-deposit`,
        { refund_ref: refundRef.trim(), note: refundNote.trim() }, { headers: { 'Authorization': `Bearer ${token}` } });
      message.success(res.data.message);
      setRefundTarget(null);
      fetchData();
    } catch (error) {
      message.error(error.response?.data?.message || 'Không ghi nhận được hoàn cọc');
    } finally { setLoading(false); }
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

  const isReadOnly = editingAppointment && ['WAITING_FOR_SALE', 'COMPLETED', 'NO_SHOW'].includes(editingAppointment.status);

  return (
    <Row gutter={16} className="h-[85vh]">
      <Col span={pendingRefunds.length > 0 ? 18 : 24} className="h-full">
        <Card variant="borderless" className="h-full shadow-sm overflow-y-auto" styles={{ body: { padding: 10 } }}>
          <div className="flex justify-between items-center mb-4 p-2">
            <Title level={4} className="m-0 text-blue-800"><CalendarOutlined className="mr-2"/> Lịch Khám & Dịch vụ</Title>
            <Space className="text-xs font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
               <span><Badge status="processing" /> Đã khám xong</span>
               <span><Badge status="warning" /> Tái khám</span>
               <span><Badge status="error" /> Khách không đến</span>
               <span><Badge status="default" /> Sắp tới / Chưa khám</span>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleSelectDate(dayjs())}>Tạo Lịch Mới</Button>
          </div>
          <Calendar cellRender={cellRender} onSelect={handleSelectDate} className="custom-calendar" />
        </Card>
      </Col>

      {pendingRefunds.length > 0 && (
      <Col span={6} className="h-full flex flex-col gap-3">
          <Card size="small" title={<span className="text-red-600"><DollarOutlined className="mr-2"/>Chờ hoàn cọc ({pendingRefunds.length})</span>} variant="borderless"
            className="shadow-sm bg-red-50 border-red-100 shrink-0" styles={{ body: { padding: 0, maxHeight: 220, overflowY: 'auto' } }}>
            <List
              dataSource={pendingRefunds}
              renderItem={item => {
                const patient = getPatientInfo(item.Appointment?.customer_id, item.Appointment?.patient_profile_id);
                return (
                  <List.Item className="px-3 py-2 border-b border-red-100">
                    <div className="w-full">
                      <div className="flex justify-between items-start gap-2">
                        <b className="text-gray-800">{patient.name || 'Khách'}</b>
                        <Tag color="red" className="mr-0">{Number(item.deposit_paid).toLocaleString('vi-VN')}đ</Tag>
                      </div>
                      <Text type="secondary" className="text-xs block"><PhoneOutlined/> {patient.phone || 'Chưa có SĐT'} · Lịch {dayjs(item.Appointment?.appointment_date).format('DD/MM')}</Text>
                      <Text className="text-xs block text-gray-500">Lý do hủy: {item.reason}</Text>
                      <Button size="small" type="primary" className="mt-1" onClick={() => { setRefundTarget(item); setRefundRef(''); setRefundNote(''); }}>Đã chuyển khoản hoàn cọc</Button>
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>
      </Col>
      )}

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
                <Radio.Button value="NEW">Khách mới (chưa có hồ sơ)</Radio.Button>
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
              <Space>
                <Button danger type="text" icon={<DeleteOutlined />} onClick={openCancel}>Hủy Lịch</Button>
                {canMarkNoShow(editingAppointment) && <Button danger onClick={handleNoShow}>Khách không đến</Button>}
              </Space>
            ) : <div/>}
            
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Đóng</Button>
              {!isReadOnly && <Button type="primary" htmlType="submit" loading={loading}>Lưu Lịch Hẹn</Button>}
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal title="Hủy lịch hẹn" open={cancelOpen} onCancel={() => setCancelOpen(false)} onOk={handleCancelAppointment}
        okText="Xác nhận hủy" okButtonProps={{ danger: true, loading }} destroyOnHidden>
        <p className="text-sm text-gray-500 mb-2">Bên yêu cầu hủy quyết định tiền cọc của khách (chính sách mục 2):</p>
        <Radio.Group value={cancelInitiator} onChange={e => setCancelInitiator(e.target.value)} className="flex flex-col gap-2 mb-3">
          <Radio value="CUSTOMER"><b>Khách yêu cầu hủy</b> <span className="text-gray-500">(khách gọi / nhắn xin hủy) - khách mất tiền cọc</span></Radio>
          <Radio value="CLINIC"><b>Phòng khám hủy</b> <span className="text-gray-500">(bác sĩ vắng, sự cố...) - hoàn cọc cho khách</span></Radio>
        </Radio.Group>
        <Input.TextArea rows={3} maxLength={500} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
          placeholder="Lý do hủy (bắt buộc, ít nhất 10 ký tự). Phòng khám hủy: lý do hiển thị cho khách." />
      </Modal>

      <Modal title="Ghi nhận hoàn cọc" open={!!refundTarget} onCancel={() => setRefundTarget(null)} onOk={handleConfirmRefund}
        okText="Xác nhận đã hoàn" okButtonProps={{ loading }} destroyOnHidden>
        {refundTarget && (
          <div className="space-y-3">
            <p className="text-sm">Chuyển khoản <b>{Number(refundTarget.deposit_paid).toLocaleString('vi-VN')}đ</b> cho khách theo tài khoản khách cung cấp, sau đó nhập mã giao dịch làm bằng chứng.</p>
            <Input placeholder="Mã giao dịch chuyển khoản" maxLength={50} value={refundRef} onChange={e => setRefundRef(e.target.value)} />
            <Input.TextArea rows={2} maxLength={500} placeholder="Ghi chú (ngân hàng, số tài khoản khách...)" value={refundNote} onChange={e => setRefundNote(e.target.value)} />
          </div>
        )}
      </Modal>
    </Row>
  );
}