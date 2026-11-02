import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Switch, DatePicker, Row, Col, Popconfirm, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { MediaField } from './ArticleFields';
import { MEDIA_API, authConfig, errorText, validateForm } from './contentApi';
import { scheduleStatus, periodText, toPeriod, fromPeriod } from './scheduleStatus';

// Banner trình chiếu đầu trang chủ của khách. Không có banner nào đang hiển thị => trang chủ dùng phần giới thiệu mặc định.
export default function BannerManager() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${MEDIA_API}/pages/banners/admin`, authConfig());
      setBanners(res.data.data || []);
    } catch (err) {
      message.error(errorText(err, 'Không tải được banner'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const open = (banner) => {
    form.resetFields();
    setEditing(banner || {});
    form.setFieldsValue(banner
      ? { ...banner, period: toPeriod(banner) }
      : { is_active: true, show_text: true, sort_order: banners.length });
  };

  const save = async () => {
    const validated = await validateForm(form);
    if (!validated) return;
    const { period, ...values } = validated;
    setSaving(true);
    try {
      const payload = { ...values, ...fromPeriod(period) };
      const res = editing.id
        ? await axios.put(`${MEDIA_API}/pages/banners/${editing.id}`, payload, authConfig())
        : await axios.post(`${MEDIA_API}/pages/banners`, payload, authConfig());
      message.success(res.data.message);
      setEditing(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không lưu được banner'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (banner, is_active) => {
    try {
      await axios.put(`${MEDIA_API}/pages/banners/${banner.id}`, { is_active }, authConfig());
      load();
    } catch (err) {
      message.error(errorText(err, 'Không cập nhật được'));
    }
  };

  const remove = async (banner) => {
    try {
      await axios.delete(`${MEDIA_API}/pages/banners/${banner.id}`, authConfig());
      message.success('Đã xóa banner');
      load();
    } catch (err) {
      message.error(errorText(err, 'Không xóa được'));
    }
  };

  const columns = [
    { title: 'Thứ tự', dataIndex: 'sort_order', width: 70, align: 'center' },
    { title: 'Ảnh', dataIndex: 'image_url', width: 150, render: (v) => <img src={v} alt="" className="w-36 h-16 object-cover rounded" /> },
    { title: 'Nội dung', key: 'title', render: (_, b) => <div><div className="font-medium">{b.title}</div><div className="text-xs text-gray-500 line-clamp-2">{b.subtitle}</div></div> },
    { title: 'Nút', key: 'link', width: 170, render: (_, b) => b.link_url ? <div className="text-xs"><Tag color="cyan">{b.button_text || 'Xem ngay'}</Tag><div className="text-gray-500 truncate max-w-[160px]" title={b.link_url}>{b.link_url}</div></div> : <span className="text-xs text-gray-400">Không có nút{b.button_text ? ' (thiếu liên kết)' : ''}</span> },
    { title: 'Thời gian', key: 'period', width: 200, render: (_, b) => <span className="text-xs">{periodText(b)}</span> },
    { title: 'Trạng thái', key: 'status', width: 150, render: (_, b) => { const s = scheduleStatus(b); return <Space><Switch size="small" checked={b.is_active} onChange={(v) => toggle(b, v)} /><Tag color={s.color}>{s.label}</Tag></Space>; } },
    {
      title: '', key: 'actions', width: 90, render: (_, b) => (
        <Space size={0}>
          <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined />} onClick={() => open(b)} /></Tooltip>
          <Popconfirm title="Xóa banner này?" onConfirm={() => remove(b)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-gray-500 text-sm">Banner trình chiếu ở đầu trang chủ, xếp theo thứ tự tăng dần. Không có banner đang hiển thị thì trang chủ dùng phần giới thiệu mặc định.</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Thêm banner</Button>
      </div>
      <Table rowKey="id" size="middle" loading={loading} dataSource={banners} columns={columns} scroll={{ x: 1000 }} pagination={false} />

      <Modal title={editing?.id ? 'Sửa banner' : 'Thêm banner'} open={!!editing} onCancel={() => setEditing(null)} onOk={save}
        okText="Lưu" confirmLoading={saving} width={720} destroyOnHidden centered>
        <Form form={form} layout="vertical" scrollToFirstError className="[&_.ant-form-item]:mb-3">
          <Form.Item name="image_url" label="Ảnh banner (máy tính)" rules={[{ required: true, message: 'Vui lòng tải ảnh banner' }]} extra="Khung ngang 8:3, khuyến nghị 1600×600px (hoặc 2400×900px), tối đa 5MB">
            <MediaField kind="image" />
          </Form.Item>
          <Form.Item name="mobile_image_url" label="Ảnh cho điện thoại (không bắt buộc)" extra="Khung dọc 4:5, khuyến nghị 1080×1350px; để trống sẽ cắt giữa ảnh máy tính">
            <MediaField kind="image" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={18}><Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }, { max: 150 }]}><Input maxLength={150} /></Form.Item></Col>
            <Col xs={24} md={6}>
              <Form.Item name="show_text" label="Hiện chữ trên ảnh" valuePropName="checked" tooltip="Hiện tiêu đề và mô tả lên ảnh. Tắt nếu ảnh đã thiết kế sẵn chữ (tiêu đề vẫn dùng làm mô tả ảnh). Nút vẫn hiện nếu có liên kết.">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="subtitle" label="Mô tả ngắn"><Input.TextArea rows={2} maxLength={300} showCount /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="link_url" label="Liên kết khi bấm" dependencies={['button_text']}
                extra='Trang trong web: "/shops", "/booking"; hoặc https://... Để trống = banner không có nút.'
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, v) => (!v && getFieldValue('button_text') ? Promise.reject(new Error('Nhập liên kết để nút hiển thị')) : Promise.resolve()),
                  }),
                  { pattern: /^(\/\S*|https:\/\/\S+)$/, message: 'Bắt đầu bằng "/" (trang trong web) hoặc https://' },
                ]}>
                <Input placeholder="/promotions" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}><Form.Item name="button_text" label="Chữ trên nút" extra="Để trống sẽ dùng chữ Xem ngay"><Input maxLength={40} placeholder="Xem ngay" allowClear /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={14}>
              <Form.Item name="period" label="Thời gian hiển thị" extra="Để trống = hiện ngay, không hết hạn">
                <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" allowEmpty={[true, true]} className="w-full" placeholder={['Bắt đầu', 'Kết thúc']} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}><Form.Item name="sort_order" label="Thứ tự"><InputNumber min={0} max={999} className="w-full" /></Form.Item></Col>
            <Col xs={12} md={5}><Form.Item name="is_active" label="Bật" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
