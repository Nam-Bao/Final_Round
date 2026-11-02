import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Table, Tag, Button, Select, DatePicker, Checkbox, Modal, Input, Radio, message, Space, Typography, Popconfirm, Statistic } from 'antd';
import { PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { CONSULT_FIELD_OPTIONS } from '../components/DoctorProfileModal';

const { Text, Paragraph } = Typography;
const API = 'http://localhost:4000/api';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
const FIELD_LABEL = Object.fromEntries(CONSULT_FIELD_OPTIONS.map((o) => [o.value, o.label]));

const STATUS = {
  CONFIRMED: { color: 'blue', text: 'Đã cọc - sắp diễn ra' },
  COMPLETED: { color: 'green', text: 'Hoàn thành' },
  NO_SHOW: { color: 'orange', text: 'Khách vắng (mất cọc)' },
  EXPERT_ABSENT: { color: 'red', text: 'Chuyên gia vắng (hoàn cọc)' },
  CANCELLED: { color: 'default', text: 'Đã hủy' },
};
const DEPOSIT = {
  FORFEITED: { color: 'orange', text: 'Mất cọc' },
  REFUND_PENDING: { color: 'red', text: 'Chờ hoàn cọc' },
  REFUNDED: { color: 'green', text: 'Đã hoàn cọc' },
};
const SHIFTS = [
  { value: 'MORNING', label: 'Sáng (08-12h)' },
  { value: 'AFTERNOON', label: 'Chiều (13-17h)' },
  { value: 'EVENING', label: 'Tối (18-21h)' },
];

// ===== TAB 1: LỊCH TƯ VẤN =====
function ConsultationList() {
  const [month, setMonth] = useState(dayjs());
  const [status, setStatus] = useState('');
  const [refundOnly, setRefundOnly] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cancelItem, setCancelItem] = useState(null);
  const [cancelForm, setCancelForm] = useState({ initiator: 'CLINIC', reason: '' });
  const [refundItem, setRefundItem] = useState(null);
  const [refundRef, setRefundRef] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = refundOnly ? { refund: 'pending' } : { month: month.format('YYYY-MM'), status: status || undefined };
      const res = await axios.get(`${API}/booking/consultations`, { headers: headers(), params });
      setList(res.data.data || []);
    } catch (err) { message.error(err.response?.data?.message || 'Không tải được lịch tư vấn'); }
    finally { setLoading(false); }
  }, [month, status, refundOnly]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const submitCancel = async () => {
    try {
      const res = await axios.put(`${API}/booking/consultations/${cancelItem.id}/cancel`, cancelForm, { headers: headers() });
      message.success(res.data.message);
      setCancelItem(null);
      fetchList();
    } catch (err) { message.error(err.response?.data?.message || 'Không hủy được'); }
  };

  const submitRefund = async () => {
    try {
      const res = await axios.put(`${API}/booking/consultations/${refundItem.id}/refund`, { refund_ref: refundRef }, { headers: headers() });
      message.success(res.data.message);
      setRefundItem(null);
      fetchList();
    } catch (err) { message.error(err.response?.data?.message || 'Không ghi nhận được'); }
  };

  const columns = [
    { title: 'Thời gian', key: 't', width: 110, render: (_, c) => <><b>{c.appointment_time}</b><br />{dayjs(c.appointment_date).format('DD/MM/YYYY')}</> },
    { title: 'Chuyên gia', key: 'e', width: 170, render: (_, c) => <>{c.expert_name}<br /><Tag>{FIELD_LABEL[c.consult_field]}</Tag></> },
    { title: 'Khách hàng', dataIndex: 'customer_name', width: 150 },
    { title: 'Câu hỏi', dataIndex: 'question', render: (q) => <Paragraph className="mb-0" ellipsis={{ rows: 2, expandable: true, symbol: 'Xem' }}>{q}</Paragraph> },
    {
      title: 'Trạng thái', key: 's', width: 190,
      render: (_, c) => (
        <Space orientation="vertical" size={2}>
          <Tag color={STATUS[c.status]?.color}>{STATUS[c.status]?.text}</Tag>
          {DEPOSIT[c.deposit_outcome] && <Tag color={DEPOSIT[c.deposit_outcome].color}>{DEPOSIT[c.deposit_outcome].text}</Tag>}
          {c.status === 'CANCELLED' && <Text type="secondary" className="text-xs">{c.cancel_initiator === 'CLINIC' ? 'Phòng khám hủy' : 'Khách hủy'}: {c.cancel_reason || '—'}</Text>}
          {c.refund_ref && <Text type="secondary" className="text-xs">GD hoàn: {c.refund_ref}</Text>}
          {c.rating && <Text className="text-xs">⭐ {c.rating}/5</Text>}
        </Space>
      ),
    },
    {
      title: 'Thao tác', key: 'a', width: 130,
      render: (_, c) => (
        <Space orientation="vertical">
          {c.status === 'CONFIRMED' && <Button danger size="small" onClick={() => { setCancelItem(c); setCancelForm({ initiator: 'CLINIC', reason: '' }); }}>Hủy lịch</Button>}
          {c.deposit_outcome === 'REFUND_PENDING' && <Button type="primary" size="small" onClick={() => { setRefundItem(c); setRefundRef(''); }}>Đã hoàn cọc</Button>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space wrap className="mb-4">
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} format="MM/YYYY" allowClear={false} disabled={refundOnly} />
        <Select value={status} onChange={setStatus} style={{ width: 230 }} disabled={refundOnly}
          options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.text }))]} />
        <Checkbox checked={refundOnly} onChange={(e) => setRefundOnly(e.target.checked)}>Chỉ lịch chờ hoàn cọc</Checkbox>
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={list} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} />

      <Modal title="Hủy lịch tư vấn" open={!!cancelItem} onCancel={() => setCancelItem(null)} onOk={submitCancel} okText="Xác nhận hủy" okButtonProps={{ danger: true }} cancelText="Đóng">
        <p className="mb-2">Bên yêu cầu hủy quyết định tiền cọc {money(50000)}:</p>
        <Radio.Group value={cancelForm.initiator} onChange={(e) => setCancelForm({ ...cancelForm, initiator: e.target.value })}>
          <Radio value="CLINIC">Phòng khám / chuyên gia bận → <b>hoàn cọc</b></Radio>
          <Radio value="CUSTOMER">Khách yêu cầu → <b>mất cọc</b></Radio>
        </Radio.Group>
        <Input.TextArea className="mt-3" rows={3} maxLength={500} placeholder="Lý do hủy (ít nhất 10 ký tự)" value={cancelForm.reason} onChange={(e) => setCancelForm({ ...cancelForm, reason: e.target.value })} />
      </Modal>

      <Modal title="Ghi nhận đã hoàn cọc" open={!!refundItem} onCancel={() => setRefundItem(null)} onOk={submitRefund} okText="Xác nhận" cancelText="Đóng">
        <p className="mb-2">Chuyển khoản trả {money(refundItem?.deposit_amount)} cho khách <b>{refundItem?.customer_name}</b>, rồi nhập mã giao dịch ngân hàng:</p>
        <Input maxLength={50} placeholder="VD: FT26110212345" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />
      </Modal>
    </>
  );
}

// ===== TAB 2: CA TƯ VẤN =====
function ShiftManager({ experts }) {
  const [expertId, setExpertId] = useState();
  const [dates, setDates] = useState([]);
  const [types, setTypes] = useState(['MORNING']);
  const [shifts, setShifts] = useState([]);
  const [saving, setSaving] = useState(false);

  const activeExperts = experts.filter((e) => e.status === 'ACTIVE' && e.consult_field);

  const fetchShifts = useCallback(async () => {
    if (!expertId) return setShifts([]);
    const res = await axios.get(`${API}/booking/consultations/shifts`, { headers: headers(), params: { expert_id: expertId, from: dayjs().format('YYYY-MM-DD'), to: dayjs().add(60, 'day').format('YYYY-MM-DD') } });
    setShifts(res.data.data || []);
  }, [expertId]);

  useEffect(() => { fetchShifts().catch(() => setShifts([])); }, [fetchShifts]);

  const createShifts = async () => {
    setSaving(true);
    try {
      const res = await axios.post(`${API}/booking/consultations/shifts`, {
        expert_id: expertId, dates: dates.map((d) => d.format('YYYY-MM-DD')), shift_types: types,
      }, { headers: headers() });
      message.success(res.data.message);
      setDates([]);
      fetchShifts();
    } catch (err) { message.error(err.response?.data?.message || 'Không mở được ca'); }
    finally { setSaving(false); }
  };

  const removeShift = async (id) => {
    try {
      await axios.delete(`${API}/booking/consultations/shifts/${id}`, { headers: headers() });
      message.success('Đã đóng ca');
      fetchShifts();
    } catch (err) { message.error(err.response?.data?.message || 'Không đóng được ca'); }
  };

  return (
    <div className="space-y-4">
      <Text type="secondary">Mở ca theo lịch rảnh chuyên gia báo. Mỗi ca chia thành các khung 1 tiếng để khách đặt; ca đã có khách đặt thì không đóng được.</Text>
      <Space wrap align="start">
        <Select placeholder="Chọn chuyên gia" style={{ width: 280 }} value={expertId} onChange={setExpertId}
          options={activeExperts.map((e) => ({ value: e.id, label: `${e.full_name} — ${FIELD_LABEL[e.consult_field]}` }))}
          notFoundContent="Chưa có chuyên gia (tạo tài khoản vai trò Chuyên gia và nhập Hồ sơ chuyên môn)" />
        <DatePicker multiple value={dates} onChange={(v) => setDates(v || [])} placeholder="Chọn các ngày" format="DD/MM"
          disabledDate={(d) => d.isBefore(dayjs(), 'day')} maxTagCount="responsive" style={{ minWidth: 240 }} />
        <Checkbox.Group options={SHIFTS} value={types} onChange={setTypes} />
        <Button type="primary" icon={<PlusOutlined />} loading={saving} disabled={!expertId || !dates.length || !types.length} onClick={createShifts}>Mở ca</Button>
      </Space>
      <Table
        rowKey="id"
        dataSource={shifts}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: expertId ? 'Chưa mở ca nào trong 60 ngày tới' : 'Chọn chuyên gia để xem ca' }}
        columns={[
          { title: 'Ngày', dataIndex: 'date', render: (d) => dayjs(d).format('dddd, DD/MM/YYYY') },
          { title: 'Ca', dataIndex: 'shift_type', render: (s) => SHIFTS.find((x) => x.value === s)?.label },
          {
            title: '', key: 'a', width: 120,
            render: (_, s) => (
              <Popconfirm title="Đóng ca này?" onConfirm={() => removeShift(s.id)} okText="Đóng ca" cancelText="Không">
                <Button danger size="small" icon={<DeleteOutlined />}>Đóng ca</Button>
              </Popconfirm>
            ),
          },
        ]}
      />
    </div>
  );
}

// ===== TAB 3: THỐNG KÊ THÙ LAO =====
function PayoutStats({ experts }) {
  const [month, setMonth] = useState(dayjs().subtract(dayjs().date() < 5 ? 1 : 0, 'month'));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/booking/consultations/stats`, { headers: headers(), params: { month: month.format('YYYY-MM') } })
      .then((res) => setRows(res.data.data?.experts || []))
      .catch((err) => message.error(err.response?.data?.message || 'Không tải được thống kê'))
      .finally(() => setLoading(false));
  }, [month]);

  // Thù lao lấy theo mức hiện tại trong hồ sơ chuyên gia
  const data = useMemo(() => rows.map((r) => {
    const fee = experts.find((e) => e.id === r.expert_id)?.session_fee ?? 0;
    return { ...r, fee, payout: r.completed * fee };
  }), [rows, experts]);
  const totalPayout = data.reduce((s, r) => s + r.payout, 0);
  const totalCompleted = data.reduce((s, r) => s + r.completed, 0);
  const totalDeposits = data.reduce((s, r) => s + r.deposits_kept, 0);

  // Xuất CSV (mở bằng Excel, có BOM để hiển thị đúng tiếng Việt)
  const exportCsv = () => {
    const head = ['Chuyên gia', 'Lĩnh vực', 'Ca hoàn thành', 'Khách vắng', 'Chuyên gia vắng', 'Đã hủy', 'Điểm TB', 'Thù lao/ca', 'Thù lao tháng'];
    const lines = data.map((r) => [r.expert_name, FIELD_LABEL[r.consult_field], r.completed, r.no_show, r.expert_absent, r.cancelled, r.avg_rating ?? '', r.fee, r.payout]);
    lines.push(['TỔNG', '', totalCompleted, '', '', '', '', '', totalPayout]);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `thu-lao-chuyen-gia-${month.format('YYYY-MM')}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Space wrap>
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} format="MM/YYYY" allowClear={false} />
        <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data.length}>Xuất Excel (CSV)</Button>
      </Space>
      <Space size="large" wrap>
        <Statistic title="Ca hoàn thành" value={totalCompleted} />
        <Statistic title="Tổng thù lao phải trả" value={money(totalPayout)} valueStyle={{ color: '#dc2626' }} />
        <Statistic title="Tiền cọc phòng khám đã thu" value={money(totalDeposits)} valueStyle={{ color: '#16a34a' }} />
      </Space>
      <Text type="secondary" className="block">Chỉ ca có cả chuyên gia và khách vào phòng (hệ thống ghi giờ vào phòng) mới được tính thù lao.</Text>
      <Table
        rowKey="expert_id"
        loading={loading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Chuyên gia', dataIndex: 'expert_name' },
          { title: 'Lĩnh vực', dataIndex: 'consult_field', render: (f) => FIELD_LABEL[f] },
          { title: 'Hoàn thành', dataIndex: 'completed', align: 'center' },
          { title: 'Khách vắng', dataIndex: 'no_show', align: 'center' },
          { title: 'CG vắng', dataIndex: 'expert_absent', align: 'center', render: (v) => (v ? <Text type="danger">{v}</Text> : v) },
          { title: 'Đã hủy', dataIndex: 'cancelled', align: 'center' },
          { title: 'Điểm TB', dataIndex: 'avg_rating', align: 'center', render: (v, r) => (v ? `${v}/5 (${r.rating_count})` : '—') },
          { title: 'Thù lao/ca', dataIndex: 'fee', align: 'right', render: money },
          { title: 'Thù lao tháng', dataIndex: 'payout', align: 'right', render: (v) => <b>{money(v)}</b> },
        ]}
      />
    </div>
  );
}

// Quản lý tư vấn chuyên gia: lịch tư vấn (CSKH / Quản lý / Admin); mở ca + thống kê thù lao (Quản lý / Admin)
export default function ConsultationManagementPage() {
  const role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role;
  const isManager = ['ADMIN', 'GEN_MANAGER'].includes(role);
  const [experts, setExperts] = useState([]);

  useEffect(() => {
    if (!isManager) return;
    axios.get(`${API}/identity/users/experts`, { headers: headers() })
      .then((res) => setExperts(res.data.data || []))
      .catch(() => message.error('Không tải được danh sách chuyên gia'));
  }, [isManager]);

  return (
    <Card title="Tư vấn chuyên gia (thỉnh giảng)">
      <Tabs
        items={[
          { key: 'list', label: 'Lịch tư vấn', children: <ConsultationList /> },
          ...(isManager ? [
            { key: 'shifts', label: 'Ca tư vấn', children: <ShiftManager experts={experts} /> },
            { key: 'stats', label: 'Thống kê thù lao', children: <PayoutStats experts={experts} /> },
          ] : []),
        ]}
      />
    </Card>
  );
}
