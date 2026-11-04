import React, { useState } from 'react';
import { Modal, Form, Select, TimePicker, Input, Checkbox, Upload, Alert, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { ATT_API, authConfig, errorText, uploadPhoto, fmtDateTime } from './attendanceApi';

const MIN_CHARS = 80;
const MIN_WORDS = 15;

// Giải trình khi lỡ giờ quét QR. Mỗi ca chỉ gửi 1 lần, gửi rồi không sửa được => kiểm tra kỹ trước khi gửi.
export default function ExplanationModal({ shift, reasons, onClose, onDone }) {
  const [form] = Form.useForm();
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const reasonType = Form.useWatch('reason_type', form);
  const description = Form.useWatch('description', form) || '';
  const reason = reasons?.[reasonType];
  const words = description.trim().split(/\s+/).filter(Boolean).length;

  const submit = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    if (reason?.evidence && !files.length) return message.error('Lý do này bắt buộc có ảnh minh chứng');
    setSaving(true);
    try {
      const evidence = [];
      for (const f of files) evidence.push(await uploadPhoto(f.originFileObj, f.name));
      const arrival = dayjs(shift.date).hour(values.arrival_time.hour()).minute(values.arrival_time.minute()).second(0);
      const res = await axios.post(`${ATT_API}/explanations`, {
        shift_id: shift.id,
        reason_type: values.reason_type,
        arrival_time: arrival.toISOString(),
        description: values.description,
        witness_name: values.witness_name,
        evidence_urls: evidence,
        committed: values.committed === true,
      }, authConfig());
      message.success(res.data.message);
      onDone();
    } catch (err) {
      message.error(errorText(err, 'Không gửi được giải trình'));
    } finally {
      setSaving(false);
    }
  };

  const openAt = dayjs(shift.open_at);
  const end = dayjs(shift.end);

  return (
    <Modal open title={`Giải trình chấm công · ${shift.label} ${dayjs(shift.date).format('DD/MM/YYYY')}`} onCancel={onClose} onOk={submit}
      okText="Gửi giải trình" confirmLoading={saving} width={620} destroyOnHidden centered
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto', paddingRight: 6 } }}>
      <Alert type="warning" showIcon className="mb-4"
        message={`Hạn gửi: ${fmtDateTime(shift.explain_until)}. Mỗi ca chỉ được gửi 1 lần và không sửa được sau khi gửi.`}
        description="Quá hạn hoặc bị từ chối, ca sẽ bị tính vắng. Khai sai sự thật sẽ bị xử lý theo quy định." />
      <Form form={form} layout="vertical" requiredMark className="[&_.ant-form-item]:mb-3">
        <Form.Item name="reason_type" label="Lý do" rules={[{ required: true, message: 'Chọn lý do' }]}>
          <Select placeholder="Chọn lý do" options={Object.entries(reasons || {}).map(([value, r]) => ({
            value,
            label: `${r.label}${r.evidence ? ' · cần ảnh' : ''}${r.witness ? ' · cần người xác nhận' : ''}`,
          }))} />
        </Form.Item>
        <Form.Item name="arrival_time" label="Giờ bạn có mặt thực tế tại phòng khám"
          extra={`Trong khoảng ${openAt.format('HH:mm')} – ${end.format('HH:mm')}`}
          rules={[{ required: true, message: 'Nhập giờ có mặt' }]}>
          <TimePicker format="HH:mm" minuteStep={1} className="w-full" placeholder="Chọn giờ" showNow={false}
            disabledTime={() => ({
              disabledHours: () => Array.from({ length: 24 }, (_, h) => h).filter((h) => h < openAt.hour() || h > end.hour()),
            })} />
        </Form.Item>
        <Form.Item name="description" label="Mô tả chi tiết"
          extra={<span className={description.length >= MIN_CHARS && words >= MIN_WORDS ? 'text-green-600' : ''}>{description.length}/{MIN_CHARS} ký tự · {words}/{MIN_WORDS} từ tối thiểu</span>}
          rules={[
            { required: true, message: 'Nhập mô tả' },
            { validator: (_, v = '') => (v.trim().length >= MIN_CHARS && v.trim().split(/\s+/).length >= MIN_WORDS ? Promise.resolve() : Promise.reject(new Error(`Ít nhất ${MIN_CHARS} ký tự và ${MIN_WORDS} từ`))) },
          ]}>
          <Input.TextArea rows={5} maxLength={2000}
            placeholder={'Nêu rõ: chuyện gì xảy ra, lúc mấy giờ, ở đâu, vì sao không chấm công kịp.\nVD: 7h35 trên đường Nguyễn Văn Linh xảy ra va chạm giữa 2 xe máy, đoạn đường kẹt khoảng 30 phút, tôi đến phòng khám lúc 8h22.'} />
        </Form.Item>
        <Form.Item name="witness_name" label={`Người xác nhận${reason?.witness ? '' : ' (không bắt buộc)'}`}
          extra="Đồng nghiệp hoặc người giao việc có thể xác nhận, ghi rõ họ tên và chức vụ"
          rules={reason?.witness ? [{ required: true, message: 'Lý do này bắt buộc có người xác nhận' }, { min: 2 }] : []}>
          <Input maxLength={100} placeholder="VD: Nguyễn Văn A - CSKH" />
        </Form.Item>
        <Form.Item label={`Ảnh minh chứng${reason?.evidence ? ' (bắt buộc)' : ' (không bắt buộc)'}`} required={!!reason?.evidence}
          extra="Giấy khám bệnh, ảnh hiện trường, ảnh chụp màn hình lỗi... tối đa 5 ảnh">
          <Upload listType="picture" accept="image/*" multiple maxCount={5} fileList={files} beforeUpload={() => false}
            onChange={({ fileList }) => setFiles(fileList.filter((f) => (f.size || 0) <= 5 * 1024 * 1024))}>
            <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
          </Upload>
        </Form.Item>
        <Form.Item name="committed" valuePropName="checked"
          rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Bạn phải cam kết trước khi gửi'))) }]}>
          <Checkbox>Tôi cam kết nội dung giải trình là đúng sự thật và chịu trách nhiệm nếu khai sai.</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
