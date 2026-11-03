import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Switch, DatePicker, Select, Row, Col, Popconfirm, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import { MediaField } from './ArticleFields';
import { MEDIA_API, authConfig, errorText, validateForm } from './contentApi';
import { scheduleStatus, periodText, toPeriod, fromPeriod } from './scheduleStatus';

const FREQUENCY = {
  SESSION: 'Mỗi lần vào web',
  DAILY: 'Mỗi ngày 1 lần',
  ONCE: 'Chỉ 1 lần duy nhất',
};
const PAGE_OPTIONS = [
  { value: '/', label: 'Trang chủ (/)' },
  { value: '/shops', label: 'Cửa hàng (/shops)' },
  { value: '/booking', label: 'Đặt lịch khám (/booking)' },
  { value: '/services', label: 'Dịch vụ (/services)' },
  { value: '/news', label: 'Tin tức (/news)' },
  { value: '/promotions', label: 'Khuyến mãi (/promotions)' },
];

// Xem trước popup giống giao diện khách
function PopupPreview({ popup }) {
  if (!popup.title && !popup.image_url) return <div className="text-gray-400 text-sm text-center py-10">Nhập tiêu đề hoặc tải ảnh để xem trước</div>;
  const hasText = popup.title || popup.content;
  // Giống popup trên máy tính của khách: khung vuông, ảnh phủ kín, chữ ở phần dưới trên nền trắng mờ
  return (
    <div className="bg-black/40 rounded-xl p-5 flex justify-center">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-[320px] aspect-square shadow-xl relative">
        <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow z-10"><CloseOutlined className="text-xs" /></span>
        {popup.image_url && <img src={popup.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {(hasText || !popup.image_url) && (
          <div className={`text-center space-y-1.5 px-5 ${popup.image_url
            ? 'absolute inset-x-0 bottom-0 pb-4 pt-10 bg-gradient-to-t from-white via-white/95 to-white/0'
            : 'h-full flex flex-col justify-center'}`}>
            {popup.title && <div className="font-bold text-base text-slate-800">{popup.title}</div>}
            {popup.content && <div className="text-xs text-gray-600 whitespace-pre-line line-clamp-3">{popup.content}</div>}
            {popup.link_url && <div className="bg-teal-600 text-white rounded-full py-1.5 text-xs font-semibold max-w-[200px] mx-auto">{popup.button_text || 'Xem ngay'}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// Xem trước theo giá trị đang nhập (đặt bên trong <Form> để theo dõi đúng form đang mở)
function LivePreview() {
  const form = Form.useFormInstance();
  const values = Form.useWatch([], form) || {};
  return <PopupPreview popup={values} />;
}

// Popup quảng cáo trên website khách: chọn trang hiển thị, tần suất, thời gian chạy
export default function PopupManager() {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${MEDIA_API}/pages/popups/admin`, authConfig());
      setPopups(res.data.data || []);
    } catch (err) {
      message.error(errorText(err, 'Không tải được popup'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const open = (popup) => {
    form.resetFields();
    setEditing(popup || {});
    form.setFieldsValue(popup
      ? { ...popup, period: toPeriod(popup) }
      : { is_active: true, frequency: 'DAILY', delay_seconds: 3, priority: 0, pages: ['/'], button_text: 'Xem ngay' });
  };

  const save = async () => {
    const validated = await validateForm(form);
    if (!validated) return;
    const { period, ...values } = validated;
    setSaving(true);
    try {
      const payload = { ...values, pages: values.pages || [], ...fromPeriod(period) };
      const res = editing.id
        ? await axios.put(`${MEDIA_API}/pages/popups/${editing.id}`, payload, authConfig())
        : await axios.post(`${MEDIA_API}/pages/popups`, payload, authConfig());
      message.success(res.data.message);
      setEditing(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không lưu được popup'));
    } finally {
      setSaving(false);
    }
  };

  const update = async (popup, data) => {
    try {
      await axios.put(`${MEDIA_API}/pages/popups/${popup.id}`, data, authConfig());
      load();
    } catch (err) {
      message.error(errorText(err, 'Không cập nhật được'));
    }
  };

  const remove = async (popup) => {
    try {
      await axios.delete(`${MEDIA_API}/pages/popups/${popup.id}`, authConfig());
      message.success('Đã xóa popup');
      load();
    } catch (err) {
      message.error(errorText(err, 'Không xóa được'));
    }
  };

  const columns = [
    {
      title: 'Popup', key: 'name', render: (_, p) => (
        <div className="flex gap-3 items-center min-w-[220px]">
          {p.image_url ? <img src={p.image_url} alt="" className="w-14 h-14 object-cover rounded" /> : <div className="w-14 h-14 rounded bg-gray-100" />}
          <div><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500 line-clamp-1">{p.title}</div></div>
        </div>
      ),
    },
    { title: 'Trang hiển thị', dataIndex: 'pages', width: 180, render: (pages) => pages?.length ? pages.map((p) => <Tag key={p}>{p}</Tag>) : <Tag color="blue">Mọi trang</Tag> },
    { title: 'Tần suất', dataIndex: 'frequency', width: 140, render: (v) => FREQUENCY[v] || v },
    { title: 'Ưu tiên', dataIndex: 'priority', width: 80, align: 'center' },
    { title: 'Thời gian', key: 'period', width: 200, render: (_, p) => <span className="text-xs">{periodText(p)}</span> },
    { title: 'Trạng thái', key: 'status', width: 150, render: (_, p) => { const s = scheduleStatus(p); return <Space><Switch size="small" checked={p.is_active} onChange={(v) => update(p, { is_active: v })} /><Tag color={s.color}>{s.label}</Tag></Space>; } },
    {
      title: '', key: 'actions', width: 90, render: (_, p) => (
        <Space size={0}>
          <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined />} onClick={() => open(p)} /></Tooltip>
          <Popconfirm title="Xóa popup này?" onConfirm={() => remove(p)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-gray-500 text-sm">Mỗi trang chỉ hiện 1 popup: popup có độ ưu tiên cao nhất đang chạy. Khách đóng popup sẽ không thấy lại theo tần suất đã chọn.</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Thêm popup</Button>
      </div>
      <Table rowKey="id" size="middle" loading={loading} dataSource={popups} columns={columns} scroll={{ x: 1000 }} pagination={false} />

      <Modal title={editing?.id ? 'Sửa popup' : 'Thêm popup'} open={!!editing} onCancel={() => setEditing(null)} onOk={save}
        okText="Lưu" confirmLoading={saving} width={940} destroyOnHidden centered styles={{ body: { maxHeight: '78vh', overflowY: 'auto', paddingRight: 8 } }}>
        <Form form={form} layout="vertical" scrollToFirstError className="[&_.ant-form-item]:mb-3">
        <Row gutter={20}>
          <Col xs={24} md={14}>
              <Form.Item name="name" label="Tên quản lý (khách không thấy)" rules={[{ required: true, message: 'Nhập tên popup' }, { max: 100 }]}>
                <Input maxLength={100} placeholder="Popup sale 11.11" />
              </Form.Item>
              <Form.Item name="image_url" label="Ảnh popup" extra="Ảnh vuông 1:1, khuyến nghị 1080×1080px. Có tiêu đề thì nên chừa khoảng trống ở 1/3 phía dưới ảnh cho chữ"><MediaField kind="image" /></Form.Item>
              <Form.Item name="title" label="Tiêu đề"><Input maxLength={150} /></Form.Item>
              <Form.Item name="content" label="Nội dung"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
              <Row gutter={12}>
                <Col span={14}><Form.Item name="link_url" label="Liên kết khi bấm nút"><Input placeholder="/promotions hoặc https://..." /></Form.Item></Col>
                <Col span={10}><Form.Item name="button_text" label="Chữ trên nút"><Input maxLength={40} /></Form.Item></Col>
              </Row>
              <Form.Item name="pages" label="Hiện ở trang" extra="Để trống = mọi trang. Có thể nhập đường dẫn khác rồi nhấn Enter">
                <Select mode="tags" options={PAGE_OPTIONS} placeholder="Mọi trang" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={10}><Form.Item name="frequency" label="Tần suất"><Select options={Object.entries(FREQUENCY).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
                <Col span={7}><Form.Item name="delay_seconds" label="Hiện sau (giây)"><InputNumber min={0} max={60} className="w-full" /></Form.Item></Col>
                <Col span={7}><Form.Item name="priority" label="Ưu tiên" tooltip="Số lớn hơn được ưu tiên khi nhiều popup cùng chạy"><InputNumber min={0} max={100} className="w-full" /></Form.Item></Col>
              </Row>
              <Row gutter={12}>
                <Col span={18}>
                  <Form.Item name="period" label="Thời gian chạy" extra="Để trống = chạy ngay, không hết hạn">
                    <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" allowEmpty={[true, true]} className="w-full" placeholder={['Bắt đầu', 'Kết thúc']} />
                  </Form.Item>
                </Col>
                <Col span={6}><Form.Item name="is_active" label="Bật" valuePropName="checked"><Switch /></Form.Item></Col>
              </Row>
          </Col>
          <Col xs={24} md={10}>
            <div className="sticky top-0">
              <div className="text-sm font-medium mb-2">Xem trước</div>
              <LivePreview />
            </div>
          </Col>
        </Row>
        </Form>
      </Modal>
    </div>
  );
}
