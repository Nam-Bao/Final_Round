// Báo cáo Điểm GlowSkin (quản lý / admin): điểm phát ra, đã dùng, hết hạn trong kỳ; điểm đang lưu hành (khoản phòng khám nợ khách);
// đơn mỹ phẩm khách trả bằng điểm; sổ điểm chi tiết. Xuất Excel (CSV).
import React, { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Table, Tag, Tabs, Button, Space, Statistic, Row, Col, Alert, message } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE } from '../config';

const API = `${API_BASE}/api`;
const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const num = (n) => Number(n || 0).toLocaleString('vi-VN');
const vnd = (n) => `${num(n)} ₫`;
const CHANNEL = { ONLINE: 'Khách đặt online', STAFF_DELIVERY: 'NVBH đặt hộ (giao hàng)', COUNTER: 'Bán tại quầy' };
const ORDER_STATUS = { PAID: 'Chờ duyệt', CONFIRMED: 'Đã duyệt', PROCESSING: 'Đang đóng gói', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy' };

const downloadCsv = (filename, header, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
};

export default function PointsReportPage() {
  const [range, setRange] = useState([dayjs().subtract(29, 'day'), dayjs()]);
  const [report, setReport] = useState(null);
  const [orders, setOrders] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const params = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') };
    try {
      const [r1, r2, r3] = await Promise.all([
        axios.get(`${API}/booking/points/report`, { ...auth(), params }),
        axios.get(`${API}/commerce/reports/points-orders`, { ...auth(), params }).catch(() => ({ data: { data: [] } })),
        axios.get(`${API}/identity/users/customers`, auth()).catch(() => ({ data: { data: [] } })),
      ]);
      setReport(r1.data.data);
      setOrders(r2.data.data || []);
      setNames(Object.fromEntries((r3.data.data || []).map((c) => [c.id, c.Profile?.full_name || c.email])));
    } catch (e) { message.error(e.response?.data?.message || 'Không tải được báo cáo điểm'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [range]);

  const t = report?.totals || {};
  const name = (id) => names[id] || `Khách #${String(id).slice(0, 6).toUpperCase()}`;
  const tag = `${range[0].format('DDMMYYYY')}-${range[1].format('DDMMYYYY')}`;
  const issuedTypes = useMemo(() => (report?.by_type || []).filter((x) => x.points > 0), [report]);
  const usedTypes = useMemo(() => (report?.by_type || []).filter((x) => x.points < 0), [report]);

  const typeColumns = [
    { title: 'Loại', dataIndex: 'label' },
    { title: 'Số lần', dataIndex: 'count', align: 'right' },
    { title: 'Điểm', dataIndex: 'points', align: 'right', render: (v) => <b className={v > 0 ? 'text-green-600' : 'text-red-600'}>{v > 0 ? '+' : ''}{num(v)}</b> },
    { title: 'Quy ra tiền', dataIndex: 'value_vnd', align: 'right', render: vnd },
  ];

  return (
    <Card title="Báo cáo Điểm GlowSkin" extra={
      <Space wrap>
        <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v)} allowClear={false} format="DD/MM/YYYY" />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Tải lại</Button>
      </Space>
    }>
      <Alert type="info" showIcon className="mb-4"
        title={`1 điểm = ${num(report?.value_vnd || 100)}đ · mỗi lần cộng điểm có hạn ${report?.expire_months || 12} tháng`}
        description="Điểm đang lưu hành là khoản phòng khám đang nợ khách (khách dùng để trả cọc, phí tư vấn, mua mỹ phẩm). Điểm không đổi ra tiền mặt; điểm quá hạn được trừ tự động mỗi đêm." />
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Điểm phát ra trong kỳ" value={num(t.issued)} suffix="điểm" valueStyle={{ color: '#16a34a' }} /><div className="text-xs text-gray-500">{vnd(t.issued_vnd)}</div></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Điểm đã dùng trong kỳ" value={num(t.spent)} suffix="điểm" valueStyle={{ color: '#2563eb' }} /><div className="text-xs text-gray-500">{vnd(t.spent_vnd)}</div></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Điểm hết hạn trong kỳ" value={num(t.expired)} suffix="điểm" valueStyle={{ color: '#9ca3af' }} /><div className="text-xs text-gray-500">{vnd(t.expired_vnd)}</div></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Đang lưu hành (hiện tại)" value={num(t.outstanding)} suffix="điểm" valueStyle={{ color: '#d97706' }} /><div className="text-xs text-gray-500">Phòng khám nợ khách {vnd(t.outstanding_vnd)}</div></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Khách đang có điểm" value={num(t.holders)} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="Sắp hết hạn (30 ngày)" value={num(t.expiring_30d_estimate)} suffix="điểm" /><div className="text-xs text-gray-500">Ước tính, chưa trừ phần đã dùng</div></Card></Col>
      </Row>

      <Tabs items={[
        { key: 'types', label: 'Theo loại', children: (
          <Row gutter={16}>
            <Col xs={24} lg={12}><h4 className="font-semibold mb-2">Điểm phát ra</h4><Table size="small" rowKey="type" pagination={false} loading={loading} dataSource={issuedTypes} columns={typeColumns} locale={{ emptyText: 'Không có' }} /></Col>
            <Col xs={24} lg={12}><h4 className="font-semibold mb-2">Điểm đã dùng / hết hạn</h4><Table size="small" rowKey="type" pagination={false} loading={loading} dataSource={usedTypes} columns={typeColumns} locale={{ emptyText: 'Không có' }} /></Col>
          </Row>
        ) },
        { key: 'orders', label: `Đơn mỹ phẩm trả bằng điểm (${orders.length})`, children: (
          <>
            <Button className="mb-3" icon={<DownloadOutlined />} disabled={!orders.length} onClick={() => downloadCsv(`don-tra-bang-diem-${tag}.csv`,
              ['Ngày', 'Mã đơn', 'Khách', 'Người nhận', 'Kênh', 'Sản phẩm', 'Điểm', 'Tiền hàng (giá niêm yết)', 'Phí ship', 'Trạng thái'],
              orders.map((o) => [dayjs(o.created_at).format('DD/MM/YYYY HH:mm'), o.id.slice(0, 8).toUpperCase(), name(o.customer_id), o.recipient_name, CHANNEL[o.channel], o.items.map((i) => `${i.name} x${i.quantity}`).join('; '), o.points_used, o.goods_vnd, o.shipping_fee, ORDER_STATUS[o.status] || o.status]))}>Xuất Excel</Button>
            <Table size="small" rowKey="id" loading={loading} dataSource={orders} pagination={{ pageSize: 20 }} columns={[
              { title: 'Ngày', dataIndex: 'created_at', width: 130, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
              { title: 'Khách', key: 'c', render: (_, o) => <div><div className="font-medium">{name(o.customer_id)}</div><div className="text-xs text-gray-500">#{o.id.slice(0, 8).toUpperCase()} · {CHANNEL[o.channel]}</div></div> },
              { title: 'Sản phẩm', key: 'i', render: (_, o) => o.items.map((i) => <div key={i.name} className="text-sm">{i.name} × {i.quantity}</div>) },
              { title: 'Điểm', dataIndex: 'points_used', align: 'right', render: (v) => <b>{num(v)}</b> },
              { title: 'Quy ra tiền', key: 'v', align: 'right', render: (_, o) => vnd(o.goods_vnd + o.shipping_fee) },
              { title: 'Trạng thái', key: 's', render: (_, o) => <Tag color={o.status === 'CANCELLED' ? 'red' : o.status === 'COMPLETED' ? 'green' : 'blue'}>{ORDER_STATUS[o.status] || o.status}{o.refund_status === 'POINTS' ? ' · đã hoàn điểm' : ''}</Tag> },
            ]} />
          </>
        ) },
        { key: 'ledger', label: `Sổ điểm chi tiết (${report?.rows?.length || 0})`, children: (
          <>
            <Button className="mb-3" icon={<DownloadOutlined />} disabled={!report?.rows?.length} onClick={() => downloadCsv(`so-diem-${tag}.csv`,
              ['Thời gian', 'Khách', 'Loại', 'Điểm', 'Ghi chú'],
              report.rows.map((r) => [dayjs(r.created_at).format('DD/MM/YYYY HH:mm'), name(r.customer_id), r.type_label, r.delta, r.note || '']))}>Xuất Excel</Button>
            <Table size="small" rowKey="id" loading={loading} dataSource={report?.rows || []} pagination={{ pageSize: 20 }} columns={[
              { title: 'Thời gian', dataIndex: 'created_at', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
              { title: 'Khách', dataIndex: 'customer_id', render: name },
              { title: 'Loại', dataIndex: 'type_label' },
              { title: 'Điểm', dataIndex: 'delta', align: 'right', render: (v) => <b className={v > 0 ? 'text-green-600' : 'text-red-600'}>{v > 0 ? '+' : ''}{num(v)}</b> },
              { title: 'Ghi chú', dataIndex: 'note', render: (v) => <span className="text-xs text-gray-600">{v}</span> },
            ]} />
          </>
        ) },
      ]} />
    </Card>
  );
}
