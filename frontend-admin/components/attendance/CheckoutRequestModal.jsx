import React, { useState } from 'react';
import { Modal, Form, Select, TimePicker, Input, Checkbox, Upload, Alert, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { ATT_API, authConfig, errorText, uploadPhoto, fmtTime, fmtDateTime } from './attendanceApi';

// kind = EARLY_LEAVE: xin về sớm (đang trong ca) | FORGOT: giải trình quên chấm ra ca (đã hết khung QR ra ca)
export default function CheckoutRequestModal({ shift, kind, reasons, onClose, onDone }) {
  const [form] = Form.useForm();
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const description = Form.useWatch('description', form) || '';
  const leave = Form.useWatch('leave_time', form);
  const early = kind === 'EARLY_LEAVE';
  const minChars = early ? 50 : 80;
  const minWords = early ? 10 : 15;
  const words = description.trim().split(/\s+/).filter(Boolean).length;
  const end = dayjs(shift.end);
  const leaveAt = leave ? dayjs(shift.date).hour(leave.hour()).minute(leave.minute()).second(0) : null;
  const declaredEarly = !early && leaveAt && leaveAt.isBefore(end);

  const submit = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const evidence = [];
      for (const f of files) evidence.push(await uploadPhoto(f.originFileObj, f.name));
      const res = await axios.post(`${ATT_API}/checkout-requests`, {
        shift_id: shift.id,
        kind,
        reason_type: values.reason_type,
        leave_time: leaveAt.toISOString(),
        description: values.description,
        witness_name: values.witness_name,
        evidence_urls: evidence,
        committed: values.committed === true,
      }, authConfig());
      message.success(res.data.message);
      onDone();
    } catch (err) {
      message.error(errorText(err, 'Không gửi được'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`${early ? 'Xin về sớm' : 'Giải trình quên chấm ra ca'} · ${shift.label} ${dayjs(shift.date).format('DD/MM')}`}
      onCancel={onClose} onOk={submit} okText={early ? 'Gửi đơn' : 'Gửi giải trình'} confirmLoading={saving} width={600} destroyOnHidden centered
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 6 } }}>
      {early ? (
        <Alert type="info" showIcon className="mb-4"
          message="Gửi đơn xong bạn quét QR ra ca tại máy ở quầy ngay được (vẫn chụp ảnh)."
          description="Quản lý duyệt: không ảnh hưởng lương, tính 1 lần vi phạm thường. Từ chối: coi là tự ý bỏ về, tính 1 vi phạm nghiêm trọng (mất thưởng chuyên cần)." />
      ) : (
        <Alert type="warning" showIcon className="mb-4"
          message={`Hạn gửi: ${fmtDateTime(shift.explain_until)}. Mỗi ca chỉ gửi 1 lần.`}
          description="Khai giờ về trước giờ kết thúc ca sẽ được xét như về sớm. Bị từ chối hoặc không giải trình: tính 1 vi phạm nghiêm trọng." />
      )}
      <Form form={form} layout="vertical" requiredMark className="[&_.ant-form-item]:mb-3">
        {early && (
          <Form.Item name="reason_type" label="Lý do" rules={[{ required: true, message: 'Chọn lý do' }]}>
            <Select placeholder="Chọn lý do" options={Object.entries(reasons || {}).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        )}
        <Form.Item name="leave_time" label={early ? 'Giờ dự kiến về' : 'Giờ bạn thực tế rời phòng khám'}
          extra={early ? `Trước ${fmtTime(shift.end)}` : `Từ sau giờ vào ca đến ${fmtTime(shift.checkout_close_at)}`}
          rules={[{ required: true, message: 'Chọn giờ' }]}>
          <TimePicker format="HH:mm" className="w-full" showNow={early} placeholder="Chọn giờ" inputReadOnly />
        </Form.Item>
        {declaredEarly && <Alert type="warning" showIcon className="mb-3" message={`Giờ về trước ${fmtTime(shift.end)}: giải trình này sẽ được xét như về sớm.`} />}
        <Form.Item name="description" label="Mô tả chi tiết"
          extra={<span className={description.length >= minChars && words >= minWords ? 'text-green-600' : ''}>{description.length}/{minChars} ký tự · {words}/{minWords} từ tối thiểu</span>}
          rules={[
            { required: true, message: 'Nhập mô tả' },
            { validator: (_, v = '') => (v.trim().length >= minChars && v.trim().split(/\s+/).length >= minWords ? Promise.resolve() : Promise.reject(new Error(`Ít nhất ${minChars} ký tự và ${minWords} từ`))) },
          ]}>
          <Input.TextArea rows={4} maxLength={2000}
            placeholder={early ? 'VD: Con nhỏ bị sốt cao, trường mầm non gọi về đón lúc 10h, tôi cần đưa cháu đi khám.' : 'VD: Hết ca lúc 12:00 tôi vội đi đón con nên quên quét QR ra ca, đồng nghiệp ở quầy thấy tôi về lúc 12:05.'} />
        </Form.Item>
        <Form.Item name="witness_name" label={`Người xác nhận${early ? ' (không bắt buộc)' : ''}`}
          rules={early ? [] : [{ required: true, message: 'Quên chấm ra ca bắt buộc có người xác nhận' }, { min: 2 }]}>
          <Input maxLength={100} placeholder="VD: Nguyễn Văn A - CSKH" />
        </Form.Item>
        <Form.Item label="Ảnh minh chứng (không bắt buộc)" extra="Tối đa 5 ảnh">
          <Upload listType="picture" accept="image/*" multiple maxCount={5} fileList={files} beforeUpload={() => false}
            onChange={({ fileList }) => setFiles(fileList.filter((f) => (f.size || 0) <= 5 * 1024 * 1024))}>
            <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
          </Upload>
        </Form.Item>
        <Form.Item name="committed" valuePropName="checked"
          rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Bạn phải cam kết trước khi gửi'))) }]}>
          <Checkbox>Tôi cam kết nội dung trên là đúng sự thật và chịu trách nhiệm nếu khai sai.</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
