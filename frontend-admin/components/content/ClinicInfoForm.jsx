import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, message, Row, Spin } from 'antd';
import axios from 'axios';
import { authConfig, errorText, MEDIA_API } from './contentApi';

const httpsRule = { pattern: /^https:\/\/\S+$/, message: 'Đường dẫn phải bắt đầu bằng https://' };
const hotlineRule = {
  validator: (_, value) => (!value || /^0\d{9,10}$/.test(String(value).replace(/\s/g, ''))
    ? Promise.resolve()
    : Promise.reject(new Error('Số điện thoại bắt đầu bằng 0, gồm 10 hoặc 11 số'))),
};
const SOCIALS = [
  ['zalo_url', 'Zalo', 'Để trống sẽ dùng Zalo theo số hotline'],
  ['facebook_url', 'Facebook', 'https://facebook.com/...'],
  ['instagram_url', 'Instagram', 'https://instagram.com/...'],
  ['tiktok_url', 'TikTok', 'https://tiktok.com/@...'],
  ['youtube_url', 'YouTube', 'https://youtube.com/...'],
];

// Thông tin phòng khám hiện ở chân trang, trang Liên hệ, Giới thiệu, Chính sách của website khách hàng
export default function ClinicInfoForm() {
  const [form] = Form.useForm();
  const [initial, setInitial] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${MEDIA_API}/pages/clinic-info`)
      .then((res) => setInitial(res.data.data || {}))
      .catch((err) => {
        message.error(errorText(err, 'Không tải được thông tin phòng khám'));
        setInitial({});
      });
  }, []);

  const save = async (values) => {
    setSaving(true);
    try {
      const res = await axios.put(`${MEDIA_API}/pages/clinic-info`, values, authConfig());
      form.setFieldsValue(res.data.data);
      message.success('Đã lưu thông tin phòng khám');
    } catch (err) {
      message.error(errorText(err, 'Không lưu được thông tin phòng khám'));
    } finally {
      setSaving(false);
    }
  };

  if (!initial) return <div className="flex justify-center py-12"><Spin /></div>;

  return (
    <Form form={form} layout="vertical" onFinish={save} initialValues={initial} className="max-w-3xl">
      <Alert type="info" showIcon className="mb-4" title="Ô nào để trống, website dùng giá trị mặc định đang có. Khách thấy thông tin mới khi tải lại trang." />
      <Card size="small" title="Liên hệ" className="mb-4">
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="hotline" label="Hotline" rules={[hotlineRule]}>
              <Input placeholder="0869694064" maxLength={14} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label="Địa chỉ phòng khám">
          <Input maxLength={300} placeholder="Số nhà, đường, phường, quận, thành phố" />
        </Form.Item>
        <Form.Item name="map_query" label="Địa điểm trên Google Maps" extra="Để trống sẽ tìm theo địa chỉ ở trên. Điền tên phòng khám nếu bản đồ chỉ sai vị trí.">
          <Input maxLength={300} />
        </Form.Item>
      </Card>

      <Card size="small" title="Giờ làm việc" className="mb-4">
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="working_hours" label="Khám tại phòng khám"><Input maxLength={100} placeholder="08:00 - 17:00 (Hàng ngày)" /></Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="consult_hours" label="Tư vấn chuyên gia online"><Input maxLength={100} placeholder="08:00 - 21:00 (Hàng ngày)" /></Form.Item>
          </Col>
        </Row>
      </Card>

      <Card size="small" title="Mạng xã hội" className="mb-4">
        <Row gutter={12}>
          {SOCIALS.map(([name, label, placeholder]) => (
            <Col xs={24} sm={12} key={name}>
              <Form.Item name={name} label={label} rules={[httpsRule]}><Input maxLength={500} placeholder={placeholder} /></Form.Item>
            </Col>
          ))}
        </Row>
      </Card>

      <Button type="primary" htmlType="submit" loading={saving}>Lưu thông tin</Button>
    </Form>
  );
}
