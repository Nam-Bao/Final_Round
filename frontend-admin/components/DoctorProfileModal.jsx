import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Divider, message, Spin } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

const API = 'http://localhost:4000/api/identity/users';
const TITLES = ['BS', 'BSCKI', 'BSCKII', 'ThS.BS', 'TS.BS', 'PGS.TS.BS', 'GS.TS.BS'];
// Chuyên gia tư vấn có thể không phải bác sĩ (cử nhân dinh dưỡng, dược sĩ mỹ phẩm...)
const EXPERT_TITLES = [...TITLES, 'CN', 'ThS', 'TS', 'DS', 'ThS.DS'];

export const CONSULT_FIELD_OPTIONS = [
  { value: 'DERMATOLOGY', label: 'Da liễu' },
  { value: 'NUTRITION', label: 'Dinh dưỡng' },
  { value: 'COSMETICS', label: 'Mỹ phẩm' },
];

// Admin / Quản lý cập nhật hồ sơ chuyên môn của bác sĩ / chuyên gia tư vấn
// (hiển thị công khai cho khách ở trang Đội ngũ bác sĩ, Đặt lịch khám, Đặt lịch tư vấn).
export default function DoctorProfileModal({ doctor, onClose }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isExpert = doctor.role === 'EXPERT';

  useEffect(() => {
    let isMounted = true;
    const headers = { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` };
    Promise.all([
      fetch(`${API}/doctors/public/${doctor.id}`).then((r) => (r.ok ? r.json() : { data: {} })),
      // Thù lao là thông tin nội bộ, không có trong hồ sơ công khai
      isExpert ? fetch(`${API}/experts`, { headers }).then((r) => (r.ok ? r.json() : { data: [] })) : Promise.resolve({ data: [] }),
    ])
      .then(([{ data = {} }, experts]) => {
        if (!isMounted) return;
        const internal = (experts.data || []).find((e) => e.id === doctor.id) || {};
        form.setFieldsValue({
          consult_field: data.consult_field || undefined,
          session_fee: internal.session_fee ?? undefined,
          title: data.title || undefined,
          specialty: data.specialty || (isExpert ? undefined : 'Bác sĩ Da liễu'),
          workplace: data.workplace,
          experience_years: data.experience_years,
          license_number: data.license_number,
          bio: data.bio,
          education: data.education?.length ? data.education : [{}],
          work_history: data.work_history?.length ? data.work_history : [{}],
          certificates: data.certificates || [],
          expertise: data.expertise || [],
        });
      })
      .catch(() => message.error('Không tải được hồ sơ hiện tại'))
      .finally(() => isMounted && setLoading(false));
    return () => { isMounted = false; };
  }, [doctor.id, form, isExpert]);

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/${doctor.id}/doctor-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message);
      message.success('Đã cập nhật hồ sơ chuyên môn');
      onClose();
    } catch (err) {
      message.error(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Hồ sơ chuyên môn — ${doctor.Profile?.full_name || doctor.email}`}
      open
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
    >
      <p className="text-gray-500 text-sm mb-4">
        Thông tin này hiển thị công khai cho khách hàng. Chỉ nhập sau khi đã đối chiếu bằng cấp và chứng chỉ hành nghề bản gốc.
      </p>
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {isExpert && (
            <Space className="w-full bg-purple-50 border border-purple-200 rounded-lg px-3 pt-3 mb-4" align="start" wrap>
              <Form.Item label="Lĩnh vực tư vấn" name="consult_field" style={{ width: 200 }} rules={[{ required: true, message: 'Chọn lĩnh vực' }]}>
                <Select options={CONSULT_FIELD_OPTIONS} placeholder="Chọn lĩnh vực" />
              </Form.Item>
              <Form.Item
                label="Thù lao mỗi ca hoàn thành (nội bộ)"
                name="session_fee"
                style={{ width: 260 }}
                tooltip="Dùng để tính tiền trả chuyên gia cuối tháng. Không hiển thị cho khách."
                rules={[{ required: true, message: 'Nhập thù lao' }]}
              >
                <InputNumber min={0} max={10000000} step={50000} className="w-full" addonAfter="đ"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => v.replace(/\./g, '')} />
              </Form.Item>
            </Space>
          )}
          <Space className="w-full" align="start" wrap>
            <Form.Item label="Học hàm / học vị" name="title" style={{ width: 160 }}>
              <Select allowClear placeholder="Chọn" options={(isExpert ? EXPERT_TITLES : TITLES).map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item label={isExpert ? 'Chuyên môn' : 'Chuyên khoa'} name="specialty" style={{ width: 260 }} rules={[{ required: true, message: 'Nhập chuyên môn' }]}>
              <Input maxLength={150} />
            </Form.Item>
            <Form.Item label="Số năm kinh nghiệm" name="experience_years" style={{ width: 160 }}>
              <InputNumber min={0} max={60} className="w-full" />
            </Form.Item>
          </Space>
          <Space className="w-full" align="start" wrap>
            <Form.Item label="Nơi công tác" name="workplace" style={{ width: 420 }}>
              <Input maxLength={200} placeholder="VD: Phòng khám Da liễu GlowSkin" />
            </Form.Item>
            <Form.Item label="Số chứng chỉ hành nghề" name="license_number" style={{ width: 200 }}>
              <Input maxLength={50} />
            </Form.Item>
          </Space>
          <Form.Item label="Giới thiệu ngắn" name="bio">
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>

          <Divider titlePlacement="start" plain>Quá trình đào tạo</Divider>
          <Form.List name="education">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="baseline" className="w-full" wrap>
                    <Form.Item name={[name, 'degree']} rules={[{ required: true, message: 'Nhập bằng cấp' }]} style={{ width: 220 }}>
                      <Input placeholder="Bằng cấp (VD: Bác sĩ Đa khoa)" maxLength={150} />
                    </Form.Item>
                    <Form.Item name={[name, 'school']} rules={[{ required: true, message: 'Nhập nơi đào tạo' }]} style={{ width: 300 }}>
                      <Input placeholder="Nơi đào tạo" maxLength={200} />
                    </Form.Item>
                    <Form.Item name={[name, 'year']} style={{ width: 100 }}>
                      <InputNumber placeholder="Năm" min={1950} max={new Date().getFullYear()} className="w-full" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500" />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Thêm bằng cấp</Button>
              </>
            )}
          </Form.List>

          <Divider titlePlacement="start" plain>Kinh nghiệm công tác</Divider>
          <Form.List name="work_history">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="baseline" className="w-full" wrap>
                    <Form.Item name={[name, 'position']} rules={[{ required: true, message: 'Nhập chức vụ' }]} style={{ width: 200 }}>
                      <Input placeholder="Chức vụ (VD: Bác sĩ điều trị)" maxLength={150} />
                    </Form.Item>
                    <Form.Item name={[name, 'place']} rules={[{ required: true, message: 'Nhập nơi công tác' }]} style={{ width: 260 }}>
                      <Input placeholder="Nơi công tác" maxLength={200} />
                    </Form.Item>
                    <Form.Item name={[name, 'from']} rules={[{ required: true, message: 'Năm bắt đầu' }]} style={{ width: 90 }}>
                      <InputNumber placeholder="Từ năm" min={1950} max={new Date().getFullYear()} className="w-full" />
                    </Form.Item>
                    <Form.Item name={[name, 'to']} style={{ width: 90 }} tooltip="Để trống nếu đang làm">
                      <InputNumber placeholder="Đến (trống = nay)" min={1950} max={new Date().getFullYear()} className="w-full" />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500" />
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Thêm nơi công tác</Button>
              </>
            )}
          </Form.List>

          <Divider titlePlacement="start" plain>Chứng chỉ & thế mạnh</Divider>
          <Form.Item label="Chứng chỉ chuyên môn" name="certificates" tooltip="Gõ rồi nhấn Enter để thêm từng chứng chỉ">
            <Select mode="tags" tokenSeparators={['\n']} placeholder="VD: Chứng chỉ Laser trong Da liễu thẩm mỹ - 2020" open={false} />
          </Form.Item>
          <Form.Item label={isExpert ? 'Thế mạnh tư vấn' : 'Thế mạnh điều trị'} name="expertise" tooltip="Gõ rồi nhấn Enter để thêm">
            <Select mode="tags" placeholder="VD: Mụn trứng cá, Nám da..." open={false} />
          </Form.Item>

          <Form.Item className="text-right mb-0">
            <Space>
              <Button onClick={onClose}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={saving}>Lưu hồ sơ</Button>
            </Space>
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
}
