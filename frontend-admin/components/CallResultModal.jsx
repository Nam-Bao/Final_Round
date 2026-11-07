import React, { useEffect, useState } from 'react';
import { Alert, Checkbox, Col, DatePicker, Form, Input, message, Modal, Radio, Rate, Row, Select, Switch } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

export const BOOKING_API = 'http://localhost:4000/api/booking';
export const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });

export const SKIN_STATUS = { MUCH_BETTER: 'Cải thiện rõ', BETTER: 'Cải thiện ít', SAME: 'Không thay đổi', WORSE: 'Nặng hơn' };
export const ADHERENCE = { FULL: 'Dùng đủ theo phác đồ', PARTIAL: 'Thỉnh thoảng quên', STOPPED: 'Đã ngừng dùng' };
const SYMPTOMS = ['Đỏ rát', 'Ngứa', 'Bong tróc', 'Nổi mụn thêm', 'Khô căng', 'Thâm sạm'];
const MIN_REASON = 10;

const TITLES = { REMINDER: 'Nhắc lịch hẹn', REVISIT: 'Nhắc tái khám', AFTERCARE: 'Thăm hỏi sau khám' };
const reasonRules = [{ required: true, min: MIN_REASON, whitespace: true, message: `Nhập lý do, ít nhất ${MIN_REASON} ký tự` }];
const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

// Chọn ngày, bác sĩ, giờ còn trống. Ưu tiên bác sĩ và giờ của lần khám trước nếu còn ca, còn chỗ
function SlotPicker({ form, item, lockDate }) {
  const date = Form.useWatch('appointment_date', form);
  const doctorId = Form.useWatch('doctor_id', form);
  const dateKey = date ? date.format('YYYY-MM-DD') : null;
  const [doctors, setDoctors] = useState(null);
  const [slots, setSlots] = useState(null);

  useEffect(() => {
    if (!dateKey) return undefined;
    let active = true;
    setDoctors(null);
    axios.get(`${BOOKING_API}/appointments/doctors-available`, { ...authConfig(), params: { date: dateKey } })
      .then((res) => {
        if (!active) return;
        const list = res.data?.data || [];
        setDoctors(list);
        const keep = [form.getFieldValue('doctor_id'), item.doctor_id].find((id) => list.some((d) => d.id === id));
        form.setFieldsValue({ doctor_id: keep });
      })
      .catch(() => active && setDoctors([]));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    setSlots(null);
    if (!dateKey || !doctorId) return undefined;
    let active = true;
    axios.get(`${BOOKING_API}/appointments/slots-available`, { ...authConfig(), params: { date: dateKey, doctorId } })
      .then((res) => {
        if (!active) return;
        // Hôm nay chỉ còn các giờ chưa qua
        const now = dayjs();
        const list = (res.data?.data || []).filter((time) => dayjs(`${dateKey} ${time}`).isAfter(now));
        setSlots(list);
        const keep = [form.getFieldValue('appointment_time'), item.old_time].find((time) => list.includes(time));
        form.setFieldsValue({ appointment_time: keep });
      })
      .catch(() => active && setSlots([]));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, doctorId]);

  const oldDoctorOff = doctors && item.doctor_id && !doctors.some((d) => d.id === item.doctor_id);
  return (
    <>
      <Row gutter={12}>
        <Col xs={24} sm={8}>
          <Form.Item name="appointment_date" label="Ngày khám" rules={[{ required: true, message: 'Chọn ngày' }]}>
            <DatePicker className="w-full" format="DD/MM/YYYY" disabled={lockDate} allowClear={false}
              disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item name="doctor_id" label="Bác sĩ có ca" rules={[{ required: true, message: 'Chọn bác sĩ' }]}>
            <Select placeholder="Chọn bác sĩ" loading={!doctors && !!dateKey} notFoundContent="Ngày này chưa có bác sĩ trực"
              options={(doctors || []).map((d) => ({ value: d.id, label: d.Profile?.full_name || d.email }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={6}>
          <Form.Item name="appointment_time" label="Giờ trống" rules={[{ required: true, message: 'Chọn giờ' }]}>
            <Select placeholder="Chọn giờ" disabled={!doctorId} notFoundContent="Hết giờ trống"
              options={(slots || []).map((time) => ({ value: time, label: time }))} />
          </Form.Item>
        </Col>
      </Row>
      {oldDoctorOff && <Alert type="warning" showIcon className="mb-3" title={`${item.doctor_name || 'Bác sĩ khám lần trước'} không có ca ngày này, vui lòng chọn bác sĩ khác hoặc ngày khác.`} />}
    </>
  );
}

function AftercareFields({ form }) {
  const skin = Form.useWatch(['aftercare', 'skin_status'], form);
  const complaint = Form.useWatch(['aftercare', 'complaint'], form);
  const mustExplain = skin === 'WORSE' || complaint;
  return (
    <>
      <Form.Item name={['aftercare', 'skin_status']} label="Tình trạng da sau khám" rules={[{ required: true, message: 'Chọn tình trạng da' }]}>
        <Radio.Group options={toOptions(SKIN_STATUS)} />
      </Form.Item>
      <Form.Item name={['aftercare', 'symptoms']} label="Biểu hiện khách đang gặp">
        <Checkbox.Group options={SYMPTOMS} />
      </Form.Item>
      <Form.Item name={['aftercare', 'adherence']} label="Dùng thuốc, mỹ phẩm theo phác đồ" rules={[{ required: true, message: 'Chọn mức độ' }]}>
        <Radio.Group options={toOptions(ADHERENCE)} />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item name={['aftercare', 'satisfaction']} label="Mức độ hài lòng" rules={[{ required: true, message: 'Chọn số sao' }]}>
            <Rate allowClear={false} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name={['aftercare', 'complaint']} label="Khách có khiếu nại" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="Có" unCheckedChildren="Không" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="note" label="Nội dung trao đổi với khách" rules={mustExplain ? reasonRules : []}>
        <Input.TextArea rows={3} maxLength={2000} placeholder={mustExplain ? 'Ghi rõ tình trạng hoặc nội dung khiếu nại' : 'Khách phản hồi thêm điều gì'} />
      </Form.Item>
    </>
  );
}

// call: { type: REMINDER | REVISIT | AFTERCARE, item }. onDone(needsReschedule) chạy sau khi lưu xong
export default function CallResultModal({ call, onClose, onDone }) {
  const { type, item } = call;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const outcome = Form.useWatch('outcome', form);
  const decision = Form.useWatch('decision', form);

  const unbooked = type === 'REVISIT' && item.kind === 'RECORD';
  const overdue = dayjs(item.date).isBefore(dayjs(), 'day');
  const pickSlot = type === 'REVISIT' && ((outcome === 'CAN_COME' && unbooked) || (outcome === 'CANNOT_COME' && decision === 'CHANGE'));

  const saveLog = (values, extra) => axios.post(`${BOOKING_API}/follow-ups/calls`, {
    call_type: type,
    appointment_id: item.appointment_id,
    medical_record_id: item.medical_record_id,
    outcome: values.outcome,
    reason: values.reason,
    note: values.note,
    aftercare: values.aftercare,
    ...extra,
  }, authConfig());

  const bookRevisit = async (values) => {
    const res = await axios.post(`${BOOKING_API}/appointments`, {
      customer_id: item.customer_id,
      patient_profile_id: item.patient_profile_id,
      doctor_id: values.doctor_id,
      type: 'FOLLOW_UP',
      appointment_date: values.appointment_date.format('YYYY-MM-DD'),
      appointment_time: values.appointment_time,
      pre_notes: item.diagnosis ? `Tái khám: ${item.diagnosis}` : 'Tái khám theo hẹn của bác sĩ',
    }, authConfig());
    return res.data.data.id;
  };

  // Đổi / hủy / đặt lịch trước; lịch đã xử lý xong mà nhật ký lỗi thì báo riêng để CSKH biết lịch vẫn đúng
  const applyRevisit = async (values) => {
    if (values.outcome === 'NO_ANSWER') return { outcome: 'NO_ANSWER' };
    if (values.outcome === 'CAN_COME') return unbooked ? { outcome: 'CAN_COME', appointment_id: await bookRevisit(values) } : { outcome: 'CAN_COME' };
    if (values.decision === 'CANCEL') {
      if (!unbooked) {
        await axios.put(`${BOOKING_API}/appointments/${item.appointment_id}/cancel`, { initiator: 'CUSTOMER', reason: values.reason }, authConfig());
      }
      return { outcome: 'CANCELLED' };
    }
    if (unbooked) return { outcome: 'RESCHEDULED', appointment_id: await bookRevisit(values) };
    await axios.put(`${BOOKING_API}/appointments/${item.appointment_id}/reschedule`, {
      doctor_id: values.doctor_id,
      appointment_date: values.appointment_date.format('YYYY-MM-DD'),
      appointment_time: values.appointment_time,
      note: values.reason,
    }, authConfig());
    return { outcome: 'RESCHEDULED' };
  };

  const submit = async (values) => {
    setSaving(true);
    try {
      const extra = type === 'REVISIT' ? await applyRevisit(values) : {};
      try {
        await saveLog(values, extra);
      } catch (error) {
        if (type !== 'REVISIT' || values.outcome === 'NO_ANSWER') throw error;
        message.warning('Lịch đã được cập nhật nhưng chưa lưu được nhật ký cuộc gọi.');
        onDone(false);
        return;
      }
      message.success('Đã lưu kết quả cuộc gọi');
      onDone(type === 'REMINDER' && values.outcome === 'CANNOT_COME');
    } catch (error) {
      message.error(error.response?.data?.message || 'Không lưu được kết quả cuộc gọi');
    } finally {
      setSaving(false);
    }
  };

  const outcomeOptions = type === 'AFTERCARE'
    ? [{ value: 'ANSWERED', label: 'Khách nghe máy' }, { value: 'NO_ANSWER', label: 'Không nghe máy' }]
    : [{ value: 'CAN_COME', label: 'Khách đến được' }, { value: 'CANNOT_COME', label: 'Khách không đến được' }, { value: 'NO_ANSWER', label: 'Không nghe máy' }];

  const scheduleText = item.time
    ? `${item.time} ngày ${dayjs(item.date).format('DD/MM/YYYY')}`
    : `ngày ${dayjs(item.date).format('DD/MM/YYYY')}, chưa xếp giờ`;

  return (
    <Modal open title={`${TITLES[type]}: ${item.customer_name}`} onCancel={onClose} onOk={form.submit} confirmLoading={saving}
      okText={type === 'REMINDER' && outcome === 'CANNOT_COME' ? 'Lưu và mở Quản lý lịch hẹn' : 'Lưu kết quả'} cancelText="Đóng" width={640} destroyOnHidden>
      <div className="mb-4 text-sm text-gray-600 space-y-0.5">
        <div>SĐT: <a href={`tel:${item.customer_phone}`} className="font-semibold">{item.customer_phone || 'Chưa có'}</a></div>
        <div>{type === 'AFTERCARE' ? 'Ngày khám' : 'Lịch'}: <b>{scheduleText}</b>{item.doctor_name ? ` • ${item.doctor_name}` : ''}</div>
        {item.diagnosis && <div>Chẩn đoán: {item.diagnosis}</div>}
      </div>

      <Form form={form} layout="vertical" onFinish={submit}
        initialValues={{ appointment_date: overdue ? dayjs() : dayjs(item.date), doctor_id: item.doctor_id }}>
        <Form.Item name="outcome" label="Kết quả cuộc gọi" rules={[{ required: true, message: 'Chọn kết quả cuộc gọi' }]}>
          <Radio.Group options={outcomeOptions} optionType="button" buttonStyle="solid" />
        </Form.Item>

        {outcome === 'CAN_COME' && !unbooked && <Alert type="success" showIcon className="mb-3" title={`Giữ nguyên lịch ${scheduleText}.`} />}
        {outcome === 'CAN_COME' && unbooked && <Alert type="info" showIcon className="mb-3" title="Bác sĩ mới hẹn ngày, chưa có giờ khám. Chọn giờ để giữ chỗ cho khách." />}

        {outcome === 'CANNOT_COME' && (
          <Form.Item name="reason" label="Lý do khách không đến được" rules={reasonRules}>
            <Input.TextArea rows={2} maxLength={500} placeholder="Ví dụ: khách đi công tác đến hết tuần" />
          </Form.Item>
        )}
        {outcome === 'CANNOT_COME' && type === 'REMINDER' && (
          <Alert type="info" showIcon className="mb-3" title="Sau khi lưu, trang Quản lý lịch hẹn sẽ mở sẵn lịch này để đổi." />
        )}
        {outcome === 'CANNOT_COME' && type === 'REVISIT' && (
          <Form.Item name="decision" label="Xử lý lịch tái khám" rules={[{ required: true, message: 'Chọn cách xử lý' }]}>
            <Radio.Group options={[{ value: 'CHANGE', label: 'Đổi ngày hoặc bác sĩ' }, { value: 'CANCEL', label: 'Hủy tái khám' }]} />
          </Form.Item>
        )}
        {pickSlot && <SlotPicker form={form} item={item} lockDate={outcome === 'CAN_COME' && !overdue} />}
        {outcome === 'CANNOT_COME' && decision === 'CANCEL' && !unbooked && (
          <Alert type="warning" showIcon className="mb-3" title="Lịch sẽ bị hủy theo yêu cầu của khách. Tiền cọc (nếu có) xử lý như khách tự hủy." />
        )}

        {type === 'AFTERCARE' && outcome === 'ANSWERED' && <AftercareFields form={form} />}
        {!(type === 'AFTERCARE' && outcome === 'ANSWERED') && outcome && (
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
