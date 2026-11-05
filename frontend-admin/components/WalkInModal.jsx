import React, { useState } from 'react';
import { Modal, Input, Button, Radio, Form, DatePicker, Select, Alert, Result, Typography, message } from 'antd';
import axios from 'axios';

const { Text } = Typography;
const API = 'http://localhost:4000/api';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

// Tiếp nhận khách đến thẳng phòng khám: tìm theo SĐT, chưa có thì tạo hồ sơ nhanh, rồi đưa vào danh sách chờ
export default function WalkInModal({ open, onClose, onDone }) {
  const [form] = Form.useForm();
  const [phone, setPhone] = useState('');
  const [accounts, setAccounts] = useState(null); // null: chưa tìm
  const [picked, setPicked] = useState(null);     // `${customer_id}|${patient_profile_id}`
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const reset = () => { setPhone(''); setAccounts(null); setPicked(null); setReason(''); setDone(null); form.resetFields(); };
  const close = () => { reset(); onClose(); };

  const search = async () => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/identity/users/walk-in/lookup`, { headers: headers(), params: { phone: phone.trim() } });
      setAccounts(res.data.data || []);
      setPicked(null);
    } catch (err) { message.error(err.response?.data?.message || 'Không tìm được khách'); }
    finally { setBusy(false); }
  };

  const renewCode = async (id) => {
    try {
      const res = await axios.post(`${API}/identity/users/walk-in/${id}/claim-code`, {}, { headers: headers() });
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, claim_code: res.data.data.claim_code } : a)));
      message.success('Đã cấp mã mới');
    } catch (err) { message.error(err.response?.data?.message || 'Không cấp được mã'); }
  };

  const submit = async () => {
    let customer_id;
    let patient_profile_id;
    let claim_code = null;
    setBusy(true);
    try {
      if (accounts.length) {
        if (!picked) { message.warning('Chọn hồ sơ người khám'); return; }
        [customer_id, patient_profile_id] = picked.split('|');
        claim_code = accounts.find((a) => a.id === customer_id)?.claim_code || null;
      } else {
        const values = await form.validateFields();
        const res = await axios.post(`${API}/identity/users/walk-in`, {
          ...values, phone: phone.trim(), dob: values.dob ? values.dob.format('YYYY-MM-DD') : null,
        }, { headers: headers() });
        customer_id = res.data.data.userId;
        patient_profile_id = res.data.data.patientProfileId;
        claim_code = res.data.data.claim_code;
      }
      const res = await axios.post(`${API}/booking/appointments/walk-in`, { customer_id, patient_profile_id, reason }, { headers: headers() });
      setDone({ ...res.data, claim_code });
      onDone();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || 'Không tiếp nhận được khách');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal open={open} onCancel={close} footer={<Button type="primary" onClick={close}>Xong</Button>} title="Đã tiếp nhận khách">
        <Result status="success" title="Khách đã vào danh sách chờ" subTitle={done.is_returning_customer ? 'Khách cũ, được miễn phí khám' : `Phí khám ${money(done.exam_fee)}, thu sau khi khám xong`} className="!py-2" />
        {done.consult_credit > 0 && <Alert className="mb-2" type="success" showIcon message={`Được trừ ${money(done.consult_credit)} cọc tư vấn còn hạn`} />}
        {!done.has_free_doctor && <Alert className="mb-2" type="warning" showIcon message="Hiện chưa có bác sĩ rảnh. Mời khách ngồi chờ, CSKH sẽ mời vào phòng khi bác sĩ khám xong." />}
        {done.claim_code && (
          <Alert type="info" showIcon message={<span>Mã hồ sơ của khách: <b className="text-lg">{done.claim_code}</b></span>}
            description="Đưa mã này cho khách. Sau này khách đăng ký trên website bằng đúng SĐT và mã này thì hồ sơ khám được liên kết vào tài khoản." />
        )}
      </Modal>
    );
  }

  return (
    <Modal open={open} onCancel={close} title="Tiếp nhận khách tại quầy" okText="Đưa vào danh sách chờ" cancelText="Đóng" onOk={submit} confirmLoading={busy} okButtonProps={{ disabled: accounts === null }} destroyOnHidden>
      <Input.Search placeholder="Số điện thoại của khách" enterButton="Tìm" maxLength={10} value={phone} loading={busy}
        onChange={(e) => { setPhone(e.target.value); setAccounts(null); }} onSearch={search} />

      {accounts?.length > 0 && (
        <Radio.Group className="w-full mt-3" value={picked} onChange={(e) => setPicked(e.target.value)}>
          {accounts.map((a) => (
            <div key={a.id} className="mb-2">
              {a.profiles.map((p) => (
                <Radio key={p.id} value={`${a.id}|${p.id}`} className="!flex">{p.full_name} <Text type="secondary">({p.relationship})</Text></Radio>
              ))}
              {a.claim_code && (
                <div className="text-xs text-gray-500 ml-6">Chưa có tài khoản online, mã hồ sơ: <b>{a.claim_code}</b> <Button size="small" type="link" onClick={() => renewCode(a.id)}>Cấp mã mới</Button></div>
              )}
            </div>
          ))}
        </Radio.Group>
      )}

      {accounts?.length === 0 && (
        <Form form={form} layout="vertical" className="mt-3">
          <Alert className="mb-3" type="info" showIcon message="Chưa có hồ sơ với SĐT này, nhập thông tin để tạo mới. Không cần email." />
          <Form.Item name="full_name" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ tên' }]}><Input maxLength={100} /></Form.Item>
          <div className="flex gap-3">
            <Form.Item name="dob" label="Ngày sinh" className="flex-1"><DatePicker format="DD/MM/YYYY" className="w-full" /></Form.Item>
            <Form.Item name="gender" label="Giới tính" className="flex-1">
              <Select options={[{ value: 'FEMALE', label: 'Nữ' }, { value: 'MALE', label: 'Nam' }, { value: 'OTHER', label: 'Khác' }]} />
            </Form.Item>
          </div>
        </Form>
      )}

      {accounts !== null && (
        <Input.TextArea className="mt-3" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do đến khám" />
      )}
    </Modal>
  );
}
