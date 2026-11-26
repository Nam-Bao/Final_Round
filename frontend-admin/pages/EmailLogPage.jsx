// Lịch sử email gửi khách (quản lý / admin): lọc theo trạng thái, loại email, tìm email / tiêu đề; gửi lại email lỗi
import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Select, Input, Button, Space, Alert, Tooltip, message, Typography } from 'antd';
import { MailOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

const API = `${API_BASE}/api/identity/emails`;
const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const STATUS = {
  SENT: { color: 'green', label: 'Đã gửi' }, FAILED: { color: 'red', label: 'Lỗi' },
  SKIPPED: { color: 'default', label: 'Không gửi' }, QUEUED: { color: 'processing', label: 'Đang gửi' },
};
export const TEMPLATE_LABEL = {
  OTP_RESET: 'Mã đặt lại mật khẩu', PASSWORD_CHANGED: 'Đã đổi mật khẩu',
  APPOINTMENT_BOOKED: 'Xác nhận lịch khám', APPOINTMENT_RESCHEDULED: 'Đã đổi lịch khám', DEPOSIT_REFUNDED: 'Đã hoàn cọc', POINTS_CREDITED: 'Cộng Điểm GlowSkin',
  CONSULT_BOOKED: 'Xác nhận lịch tư vấn', CONSULT_RESULT: 'Có kết quả tư vấn', CONSULT_EXPERT_ABSENT: 'Chuyên gia vắng',
  ORDER_PLACED: 'Đặt hàng thành công', ORDER_SHIPPING: 'Đơn đang giao', ORDER_CANCELLED: 'Đơn bị hủy', ORDER_REFUNDED: 'Đã hoàn tiền đơn', RETURN_UPDATE: 'Hoàn / trả hàng',
  REMIND_APPOINTMENT: 'Nhắc lịch khám', REMIND_CONSULT: 'Nhắc lịch tư vấn', REMIND_FOLLOW_UP: 'Nhắc tái khám', REMIND_PACKAGE: 'Nhắc gói liệu trình',
  SKIN_REVIEWED: 'Bác sĩ xác nhận soi da',
};

export default function EmailLogPage() {
  const [filter, setFilter] = useState({ status: undefined, template: undefined, q: '', page: 1 });
  const [data, setData] = useState({ data: [], total: 0, counts: {} });
  const [loading, setLoading] = useState(false);

  const load = async (f = filter) => {
    setLoading(true);
    try {
      const res = await axios.get(API, { ...auth(), params: { status: f.status, template: f.template, q: f.q || undefined, page: f.page } });
      setData(res.data);
    } catch (e) { message.error(e.response?.data?.message || 'Không tải được lịch sử email'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter.status, filter.template, filter.page]);

  const resend = async (row) => {
    try {
      const res = await axios.post(`${API}/${row.id}/resend`, {}, auth());
      message[res.data.status === 'SENT' ? 'success' : 'warning'](res.data.message);
      load();
    } catch (e) { message.error(e.response?.data?.message || 'Không gửi lại được'); }
  };

  const c = data.counts || {};
  return (
    <Card title={<span><MailOutlined /> Lịch sử email gửi khách</span>} extra={<Button icon={<ReloadOutlined />} onClick={() => load()}>Tải lại</Button>}>
      <Alert type="info" showIcon className="mb-4" title={`Đã gửi ${c.SENT || 0} · Lỗi ${c.FAILED || 0} · Không gửi ${c.SKIPPED || 0}`}
        description="Email lỗi được tự gửi lại tối đa 3 lần (mỗi 10 phút). &quot;Không gửi&quot;: khách tạo tại quầy chưa có email thật, khách tắt email nhắc lịch, hoặc tài khoản bị khóa. Email chỉ có link về website, không chứa kết quả khám." />
      <Space wrap className="mb-3">
        <Select allowClear placeholder="Trạng thái" className="w-36" value={filter.status} onChange={(v) => setFilter((f) => ({ ...f, status: v, page: 1 }))}
          options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Loại email" className="w-56" value={filter.template} onChange={(v) => setFilter((f) => ({ ...f, template: v, page: 1 }))}
          options={Object.entries(TEMPLATE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Input.Search allowClear placeholder="Tìm email người nhận / tiêu đề" className="w-72" value={filter.q}
          onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} onSearch={() => { setFilter((f) => ({ ...f, page: 1 })); load({ ...filter, page: 1 }); }} />
      </Space>
      <Table rowKey="id" size="middle" loading={loading} dataSource={data.data}
        pagination={{ current: data.page || 1, pageSize: 20, total: data.total, showSizeChanger: false, onChange: (page) => setFilter((f) => ({ ...f, page })) }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
          { title: 'Loại', dataIndex: 'template', width: 190, render: (v) => TEMPLATE_LABEL[v] || v },
          { title: 'Người nhận', key: 'to', render: (_, r) => <div><div className="font-medium">{r.recipient_name || '—'}</div><Typography.Text type="secondary" className="text-xs">{r.to_email || '—'}</Typography.Text></div> },
          { title: 'Tiêu đề', dataIndex: 'subject', render: (v) => v || '—' },
          { title: 'Trạng thái', key: 'status', width: 170, render: (_, r) => (
            <div>
              <Tag color={STATUS[r.status]?.color}>{STATUS[r.status]?.label || r.status}</Tag>
              {r.status === 'SENT' && r.sent_at && <div className="text-xs text-gray-500">{dayjs(r.sent_at).format('HH:mm DD/MM')}</div>}
              {r.skip_reason && <div className="text-xs text-gray-500">{r.skip_reason}</div>}
              {r.status === 'FAILED' && <Tooltip title={r.last_error}><div className="text-xs text-red-500 truncate max-w-[160px]">{r.last_error}</div></Tooltip>}
            </div>
          ) },
          { title: '', key: 'act', width: 110, render: (_, r) => r.can_resend && <Button size="small" icon={<SendOutlined />} onClick={() => resend(r)}>Gửi lại</Button> },
        ]} />
    </Card>
  );
}
