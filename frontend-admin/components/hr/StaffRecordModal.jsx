import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, Tabs, Tag, Button, Space, Avatar, Alert, Spin, message } from 'antd';
import { UserOutlined, UploadOutlined, DeleteOutlined, PaperClipOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import ProfessionalFields from './ProfessionalFields';
import { uploadImage, pickFile, validateForm } from '../content/contentApi';
import {
  HR_API, ROLE_INFO, ROLE_FIELDS, GENDERS, MARITAL, EMPLOYMENT_TYPES, CONTRACT_TYPES, EMPLOYMENT_STATUS, DATE_FIELDS, TAB_OF_FIELD, toOptions,
} from './staffFields';

const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const toDay = (v) => (v ? dayjs(v) : null);
const fromDay = (v) => (v ? v.format('YYYY-MM-DD') : null);

function AvatarField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    try {
      onChange?.(await uploadImage(file));
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Không tải được ảnh');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-4">
      <Avatar size={80} src={value || undefined} icon={!value && <UserOutlined />} className="bg-blue-500 shrink-0" />
      <div className="space-y-1">
        <Space>
          <Button icon={<UploadOutlined />} loading={busy} onClick={upload}>{value ? 'Đổi ảnh' : 'Tải ảnh'}</Button>
          {value && <Button danger type="text" icon={<DeleteOutlined />} onClick={() => onChange?.(null)}>Xóa ảnh</Button>}
        </Space>
        <div className="text-xs text-gray-500">Ảnh chân dung rõ mặt, tỉ lệ vuông, tối đa 5MB. Ảnh bác sĩ, chuyên gia hiển thị công khai cho khách.</div>
      </div>
    </div>
  );
}

// Tài liệu đính kèm: ảnh chụp bằng cấp, hợp đồng...
function DocumentsField({ value = [], onChange }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return message.warning('Nhập tên tài liệu trước');
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    try {
      onChange?.([...value, { name: name.trim(), url: await uploadImage(file) }]);
      setName('');
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Không tải được tài liệu');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Alert type="warning" showIcon message="Ảnh tải lên được lưu trên Cloudinary qua đường dẫn công khai. Không tải ảnh CCCD hay tài liệu có số tài khoản." />
      {value.map((d, i) => (
        <div key={d.url} className="flex items-center justify-between border rounded-lg px-3 py-2">
          <a href={d.url} target="_blank" rel="noopener noreferrer"><PaperClipOutlined /> {d.name}</a>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <Space.Compact className="w-full">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="Tên tài liệu, VD: Bằng tốt nghiệp đại học" />
        <Button icon={<UploadOutlined />} loading={busy} onClick={add}>Tải ảnh</Button>
      </Space.Compact>
    </div>
  );
}

// Ô nhập phần riêng theo vai trò
function RoleField({ field }) {
  const name = ['role_data', field.key];
  return (
    <Col xs={24} md={field.wide ? 24 : 12}>
      <Form.Item name={name} label={field.label}>
        {field.type === 'date' ? <DatePicker className="w-full" format="DD/MM/YYYY" />
          : field.type === 'list' ? <Select mode="tags" open={false} suffixIcon={null} placeholder={field.placeholder || 'Gõ rồi nhấn Enter để thêm'} />
            : <Input maxLength={300} />}
      </Form.Item>
    </Col>
  );
}

// Tạo / sửa hồ sơ nhân sự của 1 tài khoản. account: { user_id, email, role, record }
export default function StaffRecordModal({ account, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('personal');
  const [restoring, setRestoring] = useState(false);
  const contractType = Form.useWatch('contract_type', form);
  const employmentStatus = Form.useWatch('employment_status', form);
  const role = account.role;
  const info = ROLE_INFO[role];
  const fields = ROLE_FIELDS[role] || [];
  const isProfessional = ['DOCTOR', 'EXPERT'].includes(role);
  const isNew = !account.record;

  useEffect(() => {
    let mounted = true;
    axios.get(`${HR_API}/${account.user_id}`, authConfig())
      .then((res) => {
        if (!mounted) return;
        const { profile, record, professional, deleted } = res.data.data;
        setRestoring(!!deleted);
        const roleData = { ...(record?.role_data || {}) };
        fields.filter((f) => f.type === 'date').forEach((f) => { roleData[f.key] = toDay(roleData[f.key]); });
        const dates = Object.fromEntries(DATE_FIELDS.filter((k) => k !== 'dob').map((k) => [k, toDay(record?.[k])]));
        form.setFieldsValue({
          nationality: 'Việt Nam', employment_status: 'WORKING', employment_type: role === 'EXPERT' ? 'COLLABORATOR' : 'FULL_TIME',
          contract_type: role === 'EXPERT' ? 'SERVICE' : 'PROBATION', position: info.position,
          ...(record || {}),
          ...dates,
          full_name: profile.full_name, gender: profile.gender, phone: profile.phone, avatar: profile.avatar || null, dob: toDay(profile.dob),
          role_data: roleData,
          documents: record?.documents || [],
          professional: {
            specialty: role === 'DOCTOR' ? 'Bác sĩ Da liễu' : undefined,
            ...(professional || {}),
            education: professional?.education || [], work_history: professional?.work_history || [],
            certificates: professional?.certificates || [], expertise: professional?.expertise || [],
          },
        });
      })
      .catch((err) => { message.error(err.response?.data?.message || 'Không tải được hồ sơ'); onClose(); })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [account.user_id]);

  const save = async () => {
    // Lỗi ở tab khác => mở đúng tab đó
    const ok = await form.validateFields().then(() => true).catch((e) => {
      const first = e.errorFields?.[0]?.name?.[0];
      const target = Object.entries(TAB_OF_FIELD).find(([, list]) => list.includes(first))?.[0];
      if (target) setTab(target);
      return false;
    });
    if (!ok) return validateForm(form);
    const v = form.getFieldsValue(true); // gồm cả ô ở tab chưa mở
    const roleData = { ...(v.role_data || {}) };
    fields.filter((f) => f.type === 'date').forEach((f) => { roleData[f.key] = fromDay(roleData[f.key]); });
    const payload = { ...v, ...Object.fromEntries(DATE_FIELDS.map((k) => [k, fromDay(v[k])])), role_data: roleData };
    setSaving(true);
    try {
      const res = isNew
        ? await axios.post(HR_API, { ...payload, user_id: account.user_id }, authConfig())
        : await axios.put(`${HR_API}/${account.user_id}`, payload, authConfig());
      message.success(res.data.message);
      onSaved();
    } catch (err) {
      message.error(err.response?.data?.message || 'Không lưu được hồ sơ');
    } finally {
      setSaving(false);
    }
  };

  const date = (name, label, rules) => (
    <Form.Item name={name} label={label} rules={rules}><DatePicker className="w-full" format="DD/MM/YYYY" /></Form.Item>
  );
  const need = (message_) => [{ required: true, message: message_ }];
  const needsEnd = ['PROBATION', 'FIXED_TERM', 'SERVICE'].includes(contractType);

  const personal = (
    <>
      <Form.Item name="avatar" label="Ảnh đại diện"><AvatarField /></Form.Item>
      <Row gutter={12}>
        <Col xs={24} md={12}><Form.Item name="full_name" label="Họ và tên" rules={need('Nhập họ tên')}><Input maxLength={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="gender" label="Giới tính" rules={need('Chọn giới tính')}><Select options={GENDERS} /></Form.Item></Col>
        <Col xs={12} md={6}>{date('dob', 'Ngày sinh', need('Chọn ngày sinh'))}</Col>
        <Col xs={24} md={8}><Form.Item name="phone" label="Số điện thoại" rules={[...need('Nhập SĐT'), { pattern: /^0\d{9,10}$/, message: 'SĐT không hợp lệ' }]}><Input maxLength={11} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="Email tài khoản"><Input value={account.email} disabled /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="education_level" label="Trình độ học vấn"><Input maxLength={100} placeholder="Đại học, Cao đẳng..." /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item name="national_id" label="Số CCCD" rules={[...need('Nhập số CCCD'), { pattern: /^\d{12}$/, message: 'Gồm đúng 12 chữ số' }]}><Input maxLength={12} /></Form.Item></Col>
        <Col xs={24} md={6}>{date('national_id_issue_date', 'Ngày cấp')}</Col>
        <Col xs={24} md={10}><Form.Item name="national_id_issue_place" label="Nơi cấp"><Input maxLength={200} /></Form.Item></Col>
        <Col xs={24}><Form.Item name="permanent_address" label="Địa chỉ thường trú" rules={need('Nhập địa chỉ thường trú')}><Input maxLength={300} /></Form.Item></Col>
        <Col xs={24}><Form.Item name="current_address" label="Địa chỉ hiện tại"><Input maxLength={300} placeholder="Để trống nếu trùng địa chỉ thường trú" /></Form.Item></Col>
        <Col xs={8}><Form.Item name="nationality" label="Quốc tịch"><Input maxLength={50} /></Form.Item></Col>
        <Col xs={8}><Form.Item name="ethnicity" label="Dân tộc"><Input maxLength={50} /></Form.Item></Col>
        <Col xs={8}><Form.Item name="marital_status" label="Hôn nhân"><Select allowClear options={MARITAL} /></Form.Item></Col>
      </Row>
      <div className="font-semibold mb-2">Liên hệ khẩn cấp</div>
      <Row gutter={12}>
        <Col xs={24} md={10}><Form.Item name="emergency_contact_name" label="Họ tên" rules={need('Nhập người liên hệ')}><Input maxLength={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item name="emergency_contact_relation" label="Quan hệ"><Input maxLength={50} placeholder="Vợ, chồng, bố..." /></Form.Item></Col>
        <Col xs={12} md={8}><Form.Item name="emergency_contact_phone" label="Số điện thoại" rules={[...need('Nhập SĐT'), { pattern: /^0\d{9,10}$/, message: 'SĐT không hợp lệ' }]}><Input maxLength={11} /></Form.Item></Col>
      </Row>
    </>
  );

  const work = (
    <Row gutter={12}>
      <Col xs={24} md={12}><Form.Item name="position" label="Chức danh" rules={need('Nhập chức danh')}><Input maxLength={100} /></Form.Item></Col>
      <Col xs={12} md={6}><Form.Item name="employment_type" label="Hình thức" rules={need('Chọn hình thức')}><Select options={toOptions(EMPLOYMENT_TYPES)} /></Form.Item></Col>
      <Col xs={12} md={6}>
        <Form.Item name="employment_status" label="Trạng thái"><Select options={Object.entries(EMPLOYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} /></Form.Item>
      </Col>
      <Col xs={12}>{date('start_date', 'Ngày vào làm', need('Chọn ngày vào làm'))}</Col>
      <Col xs={12}>{date('end_date', 'Ngày nghỉ việc', employmentStatus === 'RESIGNED' ? need('Chọn ngày nghỉ việc') : undefined)}</Col>
      {employmentStatus === 'RESIGNED' && account.account_status === 'ACTIVE' && (
        <Col xs={24}><Alert className="!mb-3" type="warning" showIcon message="Tài khoản đăng nhập của nhân viên này vẫn đang hoạt động. Admin cần khóa tài khoản ở trang Quản lý người dùng." /></Col>
      )}
      <Col xs={24}><div className="font-semibold mb-2">Hợp đồng</div></Col>
      <Col xs={24} md={12}><Form.Item name="contract_type" label="Loại hợp đồng" rules={need('Chọn loại hợp đồng')}><Select options={toOptions(CONTRACT_TYPES)} /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="contract_no" label="Số hợp đồng"><Input maxLength={50} /></Form.Item></Col>
      <Col xs={12}>{date('contract_start', 'Ngày bắt đầu')}</Col>
      <Col xs={12}>{date('contract_end', 'Ngày kết thúc', needsEnd ? need('Chọn ngày kết thúc') : undefined)}</Col>
    </Row>
  );

  const finance = (
    <Row gutter={12}>
      <Col xs={24} md={12}><Form.Item name="tax_code" label="Mã số thuế cá nhân" rules={[{ pattern: /^\d{10}(-?\d{3})?$/, message: 'Gồm 10 hoặc 13 chữ số' }]}><Input maxLength={14} /></Form.Item></Col>
      <Col xs={24} md={12}><Form.Item name="social_insurance_no" label="Số sổ BHXH"><Input maxLength={15} /></Form.Item></Col>
      <Col xs={24} md={8}><Form.Item name="bank_name" label="Ngân hàng nhận lương"><Input maxLength={100} /></Form.Item></Col>
      <Col xs={24} md={8}><Form.Item name="bank_account_no" label="Số tài khoản" rules={[{ pattern: /^\d{6,30}$/, message: 'Chỉ gồm chữ số' }]}><Input maxLength={30} /></Form.Item></Col>
      <Col xs={24} md={8}><Form.Item name="bank_account_name" label="Tên chủ tài khoản"><Input maxLength={100} /></Form.Item></Col>
      <Col xs={24} md={12}>{date('health_check_date', 'Khám sức khỏe định kỳ gần nhất')}</Col>
      <Col xs={24}><Form.Item name="notes" label="Ghi chú nội bộ"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item></Col>
    </Row>
  );

  const career = (
    <>
      <Row gutter={12}>{fields.map((f) => <RoleField key={f.key} field={f} />)}</Row>
      {isProfessional && (
        <>
          <div className="font-semibold mb-2 mt-2">Hồ sơ công khai trên website</div>
          <ProfessionalFields isExpert={role === 'EXPERT'} />
        </>
      )}
    </>
  );

  return (
    <Modal open width={880} centered destroyOnHidden onCancel={onClose} onOk={save} okText={isNew ? 'Tạo hồ sơ' : 'Lưu thay đổi'} confirmLoading={saving}
      title={<span>{isNew ? 'Tạo hồ sơ nhân sự' : `Hồ sơ ${account.record.employee_code}`} <Tag color={info.color} className="ml-1">{info.label}</Tag></span>}
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto', paddingRight: 8 } }}>
      <Spin spinning={loading}>
        {restoring && <Alert className="mb-3" type="info" showIcon message="Tài khoản này từng có hồ sơ đã xóa. Dữ liệu cũ được điền sẵn, lưu lại sẽ khôi phục hồ sơ và giữ nguyên mã nhân viên." />}
        <Form form={form} layout="vertical" className="[&_.ant-form-item]:mb-3">
          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: 'personal', label: 'Thông tin cá nhân', forceRender: true, children: personal },
            { key: 'work', label: 'Công việc & hợp đồng', forceRender: true, children: work },
            { key: 'finance', label: 'Thuế, bảo hiểm, lương', forceRender: true, children: finance },
            { key: 'career', label: 'Hồ sơ nghề nghiệp', forceRender: true, children: career },
            { key: 'docs', label: 'Tài liệu', forceRender: true, children: <Form.Item name="documents" noStyle><DocumentsField /></Form.Item> },
          ]} />
        </Form>
      </Spin>
    </Modal>
  );
}
