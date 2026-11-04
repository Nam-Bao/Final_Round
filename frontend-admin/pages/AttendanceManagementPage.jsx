import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Table, Tag, DatePicker, Segmented, Button, Drawer, Descriptions, Image, Input, Space, Switch, Badge, Result, Select, Popconfirm, message } from 'antd';
import { DownloadOutlined, DesktopOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  ATT_API, authConfig, errorText, shiftStatus, checkoutStatus, fmtTime, fmtDateTime, money, SHIFT_LABEL, ROLE_LABEL, EXPLANATION_STATUS,
} from '../components/attendance/attendanceApi';
import CheckoutRequestTab from '../components/attendance/CheckoutRequestTab';

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const METHOD = { QR: 'Quét QR', EXPLANATION: 'Giải trình', REQUEST: 'Theo đơn', AUTO: 'Hệ thống' };
const DISCIPLINE = { REPRIMAND: 'Đề xuất khiển trách', SALARY_RAISE_DELAY: 'Đề xuất kéo dài nâng lương' };

// Xuất CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt)
const downloadCsv = (filename, header, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
};

// Bảng công trong 1 ngày
function DailyTab({ people }) {
  const [date, setDate] = useState(dayjs());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${ATT_API}/daily`, { ...authConfig(), params: { date: date.format('YYYY-MM-DD') } });
      setRows(res.data.data || []);
    } catch (err) {
      message.error(errorText(err, 'Không tải được bảng công'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [date]);

  const shown = rows.filter((r) => !role || people[r.employee_id]?.role === role);
  // Bộ lọc cột: lấy theo các giá trị đang có trong ngày
  const inLabel = (r) => shiftStatus(r).label;
  const outLabel = (r) => checkoutStatus(r)?.label || 'Chưa vào ca';
  const options = (fn) => [...new Set(shown.map(fn))].sort((a, b) => a.localeCompare(b, 'vi')).map((v) => ({ text: v, value: v }));
  const columns = [
    { title: 'Nhân viên', key: 'emp', render: (_, r) => <div><div className="font-medium">{people[r.employee_id]?.name || 'Không rõ'}</div><div className="text-xs text-gray-500">{ROLE_LABEL[people[r.employee_id]?.role] || people[r.employee_id]?.role}</div></div> },
    {
      title: 'Ca', dataIndex: 'shift_type', width: 180, render: (t) => SHIFT_LABEL[t],
      filters: [...new Set(shown.map((r) => r.shift_type))].map((t) => ({ text: SHIFT_LABEL[t], value: t })),
      onFilter: (value, r) => r.shift_type === value,
    },
    {
      title: 'Vào ca', key: 'in', width: 220, filters: options(inLabel), onFilter: (value, r) => inLabel(r) === value, render: (_, r) => {
        const s = shiftStatus(r);
        return (
          <div className="flex items-center gap-2">
            {r.record?.photo_url && <Image src={r.record.photo_url} width={40} height={40} className="rounded object-cover" />}
            <div><Tag color={s.color}>{s.label}</Tag><div className="text-xs text-gray-500">{fmtTime(r.record?.check_in_at)}{r.record?.minutes_late ? ` · trễ ${r.record.minutes_late}'` : ''}{r.record?.method ? ` · ${METHOD[r.record.method]}` : ''}</div></div>
          </div>
        );
      },
    },
    {
      title: 'Ra ca', key: 'out', width: 220, filters: options(outLabel), onFilter: (value, r) => outLabel(r) === value, render: (_, r) => {
        const s = checkoutStatus(r);
        if (!s) return '—';
        return (
          <div className="flex items-center gap-2">
            {r.record?.checkout_photo_url && <Image src={r.record.checkout_photo_url} width={40} height={40} className="rounded object-cover" />}
            <div><Tag color={s.color}>{s.label}</Tag><div className="text-xs text-gray-500">{fmtTime(r.record?.check_out_at)}{r.record?.minutes_early ? ` · sớm ${r.record.minutes_early}'` : ''}</div></div>
          </div>
        );
      },
    },
    { title: 'Vi phạm', key: 'v', render: (_, r) => (r.violations?.length ? r.violations.map((v) => <div key={v.code} className={`text-xs ${v.severity === 'SERIOUS' ? 'text-red-600' : 'text-orange-500'}`}>• {v.label}</div>) : '—') },
  ];
  const stat = (fn) => rows.filter(fn).length;

  return (
    <div className="space-y-3">
      <Space wrap>
        <DatePicker value={date} onChange={(v) => v && setDate(v)} allowClear={false} format="DD/MM/YYYY" />
        <Select className="w-32" value={role} onChange={setRole} options={[{ value: '', label: 'Mọi vai trò' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))]} />
        <Button icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>
        <span className="text-gray-500 text-sm">
          {rows.length} ca · đúng giờ {stat((r) => r.record?.status === 'ON_TIME')} · trễ {stat((r) => r.record?.minutes_late > 0)} ·
          về sớm {stat((r) => r.record?.checkout_status === 'EARLY')} · vắng {stat((r) => r.record?.status === 'ABSENT')}
        </span>
      </Space>
      <Table key={date.format('YYYY-MM-DD')} rowKey="id" size="middle" loading={loading} dataSource={shown} columns={columns} scroll={{ x: 1100 }} pagination={false} locale={{ emptyText: 'Không có ca làm trong ngày' }} />
    </div>
  );
}

// Duyệt giải trình
function ExplanationTab({ people, onPending }) {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${ATT_API}/explanations`, { ...authConfig(), params: status ? { status } : {} });
      setRows(res.data.data || []);
      setReasons(res.data.reasons || {});
      onPending(res.data.pending || 0);
    } catch (err) {
      message.error(errorText(err, 'Không tải được giải trình'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);

  const review = async (decision) => {
    if (decision !== 'APPROVE' && note.trim().length < 10) return message.error('Từ chối / xác định vắng phải ghi rõ lý do (ít nhất 10 ký tự)');
    setBusy(decision);
    try {
      const res = await axios.post(`${ATT_API}/explanations/${detail.id}/review`, { decision, note }, authConfig());
      message.success(res.data.message);
      setDetail(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không xử lý được'));
    } finally {
      setBusy('');
    }
  };

  const columns = [
    { title: 'Nhân viên', key: 'emp', render: (_, r) => <div><div className="font-medium">{people[r.employee_id]?.name || 'Không rõ'}</div><div className="text-xs text-gray-500">{ROLE_LABEL[people[r.employee_id]?.role]}</div></div> },
    { title: 'Ca', key: 'shift', width: 220, render: (_, r) => `${SHIFT_LABEL[r.shift_type]} · ${dayjs(r.shift_date).format('DD/MM')}` },
    { title: 'Lý do', dataIndex: 'reason_type', render: (v) => reasons[v]?.label || v },
    { title: 'Có mặt lúc', dataIndex: 'arrival_time', width: 100, render: fmtTime },
    { title: 'Gửi lúc', dataIndex: 'createdAt', width: 140, render: fmtDateTime },
    { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (v) => <Tag color={EXPLANATION_STATUS[v]?.color}>{EXPLANATION_STATUS[v]?.label}</Tag> },
    { title: '', key: 'open', width: 90, render: (_, r) => <Button size="small" type={r.status === 'PENDING' ? 'primary' : 'default'} onClick={() => { setDetail(r); setNote(''); }}>{r.status === 'PENDING' ? 'Xét duyệt' : 'Xem'}</Button> },
  ];

  const late = detail ? Math.max(0, dayjs(detail.arrival_time).diff(dayjs(`${detail.shift_date}T${{ MORNING: '08:00', AFTERNOON: '13:00', EVENING: '18:00' }[detail.shift_type]}`), 'minute')) : 0;

  return (
    <div className="space-y-3">
      <Segmented value={status} onChange={setStatus} options={[
        { value: 'PENDING', label: 'Chờ duyệt' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' }, { value: '', label: 'Tất cả' },
      ]} />
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 950 }} pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: status === 'PENDING' ? 'Không có giải trình chờ duyệt' : 'Không có dữ liệu' }} />

      <Drawer open={!!detail} onClose={() => setDetail(null)} size={Math.min(560, window.innerWidth)} title="Chi tiết giải trình" destroyOnHidden
        footer={detail?.status === 'PENDING' && (
          <div className="space-y-2">
            <Input.TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cho nhân viên (bắt buộc khi từ chối, ít nhất 10 ký tự)" />
            <div className="flex justify-end gap-2">
              <Popconfirm title="Xác định nhân viên KHÔNG có mặt => tính vắng (không lương ca). Tiếp tục?" onConfirm={() => review('ABSENT')}>
                <Button danger type="text" loading={busy === 'ABSENT'}>Xác định vắng</Button>
              </Popconfirm>
              <Popconfirm title="Từ chối => vẫn tính lương ca, ghi 1 vi phạm nghiêm trọng (mất thưởng chuyên cần). Tiếp tục?" onConfirm={() => review('REJECT')}>
                <Button danger loading={busy === 'REJECT'}>Từ chối</Button>
              </Popconfirm>
              <Button type="primary" loading={busy === 'APPROVE'} onClick={() => review('APPROVE')}>Duyệt</Button>
            </div>
          </div>
        )}>
        {detail && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered items={[
              { label: 'Nhân viên', children: `${people[detail.employee_id]?.name || 'Không rõ'} (${ROLE_LABEL[people[detail.employee_id]?.role] || ''})` },
              { label: 'Ca', children: `${SHIFT_LABEL[detail.shift_type]} · ${dayjs(detail.shift_date).format('DD/MM/YYYY')}` },
              { label: 'Lý do', children: reasons[detail.reason_type]?.label || detail.reason_type },
              { label: 'Có mặt thực tế', children: <span>{fmtTime(detail.arrival_time)} <span className="text-orange-500">(trễ {late} phút)</span></span> },
              { label: 'Người xác nhận', children: detail.witness_name || '—' },
              { label: 'Gửi lúc', children: fmtDateTime(detail.createdAt) },
              { label: 'Cam kết', children: detail.committed ? 'Đã cam kết đúng sự thật' : 'Không' },
              ...(detail.status !== 'PENDING' ? [{ label: 'Kết quả', children: <span><Tag color={EXPLANATION_STATUS[detail.status]?.color}>{EXPLANATION_STATUS[detail.status]?.label}</Tag> {fmtDateTime(detail.reviewed_at)}{detail.review_note && <div className="text-gray-600 mt-1">{detail.review_note}</div>}</span> }] : []),
            ]} />
            <div>
              <div className="font-semibold mb-1">Mô tả</div>
              <div className="whitespace-pre-line bg-gray-50 rounded-lg p-3 text-sm">{detail.description}</div>
            </div>
            {detail.evidence_urls?.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Ảnh minh chứng</div>
                <Image.PreviewGroup>
                  <div className="flex flex-wrap gap-2">{detail.evidence_urls.map((u) => <Image key={u} src={u} width={96} height={96} className="rounded object-cover" />)}</div>
                </Image.PreviewGroup>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// Báo cáo tháng để tính lương
function ReportTab({ people }) {
  const [month, setMonth] = useState(dayjs());
  const [data, setData] = useState({ summary: [], shifts: [] });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${ATT_API}/report`, { ...authConfig(), params: { month: month.format('YYYY-MM') } });
      setData(res.data.data);
    } catch (err) {
      message.error(errorText(err, 'Không tải được báo cáo'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [month]);

  const name = (id) => people[id]?.name || id;
  const roleOf = (id) => ROLE_LABEL[people[id]?.role] || people[id]?.role || '';
  const summary = [...data.summary].sort((a, b) => name(a.employee_id).localeCompare(name(b.employee_id), 'vi'));
  const m = month.format('MM-YYYY');

  const exportSummary = () => downloadCsv(`tong-hop-cong-${m}.csv`,
    ['Nhân viên', 'Vai trò', 'Ca được xếp', 'Ca có công', 'Vắng', 'Phút trễ', 'Phút về sớm', 'Vi phạm thường', 'Vi phạm nghiêm trọng', 'Thưởng chuyên cần (tạm tính)', 'Ca chưa chốt'],
    summary.map((r) => [name(r.employee_id), roleOf(r.employee_id), r.scheduled, r.worked, r.absent, r.late_minutes, r.early_minutes, r.normal_violations, r.serious_violations, r.bonus, r.unsettled]));
  const exportDetail = () => downloadCsv(`chi-tiet-cong-${m}.csv`,
    ['Ngày', 'Nhân viên', 'Vai trò', 'Ca', 'Vào ca', 'Giờ vào', 'Phút trễ', 'Ra ca', 'Giờ ra', 'Phút về sớm', 'Vi phạm', 'Ghi chú'],
    [...data.shifts].sort((a, b) => a.date.localeCompare(b.date) || name(a.employee_id).localeCompare(name(b.employee_id), 'vi'))
      .map((s) => [dayjs(s.date).format('DD/MM/YYYY'), name(s.employee_id), roleOf(s.employee_id), SHIFT_LABEL[s.shift_type], shiftStatus(s).label,
        fmtTime(s.record?.check_in_at), s.record?.minutes_late || 0, checkoutStatus(s)?.label || '', fmtTime(s.record?.check_out_at), s.record?.minutes_early || 0,
        (s.violations || []).map((v) => `${v.severity === 'SERIOUS' ? '[Nghiêm trọng] ' : ''}${v.label}`).join('; '), s.record?.note || '']));

  const columns = [
    { title: 'Nhân viên', key: 'emp', fixed: 'left', render: (_, r) => <div><div className="font-medium">{name(r.employee_id)}</div><div className="text-xs text-gray-500">{roleOf(r.employee_id)}</div></div> },
    { title: 'Ca có công', key: 'worked', align: 'center', render: (_, r) => <span><b>{r.worked}</b> / {r.scheduled}</span> },
    { title: 'Vắng', dataIndex: 'absent', align: 'center', render: (v) => (v ? <span className="text-red-600 font-semibold">{v}</span> : 0) },
    { title: 'Phút trễ / về sớm', key: 'min', align: 'center', render: (_, r) => `${r.late_minutes} / ${r.early_minutes}` },
    { title: 'Vi phạm thường', dataIndex: 'normal_violations', align: 'center', render: (v) => (v ? <span className="text-orange-500">{v}</span> : 0) },
    { title: 'Vi phạm nghiêm trọng', dataIndex: 'serious_violations', align: 'center', render: (v, r) => (v ? <div><span className="text-red-600 font-semibold">{v}</span>{r.suggested_discipline && <div className="text-xs text-red-500">{DISCIPLINE[r.suggested_discipline]}</div>}</div> : 0) },
    { title: 'Thưởng chuyên cần', dataIndex: 'bonus', align: 'right', render: (v) => (v ? <span className="text-teal-600">{money(v)}</span> : '0đ') },
    { title: 'Chưa chốt', dataIndex: 'unsettled', align: 'center', render: (v) => (v ? <Tag color="gold">{v} ca</Tag> : '—') },
  ];

  return (
    <div className="space-y-3">
      <Space wrap>
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} format="MM/YYYY" />
        <Button icon={<DownloadOutlined />} onClick={exportSummary} disabled={!summary.length}>Xuất tổng hợp (Excel)</Button>
        <Button icon={<DownloadOutlined />} onClick={exportDetail} disabled={!data.shifts.length}>Xuất chi tiết từng ca</Button>
      </Space>
      <p className="text-xs text-gray-500">Thưởng chuyên cần là tạm tính: có thưởng khi tổng vi phạm không quá 3 lần và không có vi phạm nghiêm trọng. "Chưa chốt" = ca chưa tới / đang chờ giải trình hoặc chờ duyệt; bảng lương chỉ tạo được khi không còn ca chưa chốt.</p>
      <Table rowKey="employee_id" size="middle" loading={loading} dataSource={summary} columns={columns} scroll={{ x: 900 }} pagination={false} />
    </div>
  );
}

// Máy chấm công
function KioskTab() {
  const [rows, setRows] = useState([]);
  const load = () => axios.get(`${ATT_API}/kiosks`, authConfig()).then((res) => setRows(res.data.data || [])).catch((err) => message.error(errorText(err, 'Không tải được')));
  useEffect(() => { load(); }, []);
  const toggle = async (k, is_active) => {
    try {
      const res = await axios.put(`${ATT_API}/kiosks/${k.id}`, { is_active }, authConfig());
      message.success(res.data.message);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không cập nhật được'));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <span className="text-gray-500 text-sm">Mở trang máy chấm công trên tablet / màn hình đặt tại quầy (đang đăng nhập tài khoản quản lý) để kích hoạt thiết bị đó.</span>
        <Button type="primary" icon={<DesktopOutlined />} href="/kiosk" target="_blank">Mở trang máy chấm công</Button>
      </div>
      <Table rowKey="id" size="middle" dataSource={rows} pagination={false} columns={[
        { title: 'Tên máy', dataIndex: 'name' },
        { title: 'Kích hoạt lúc', dataIndex: 'createdAt', render: fmtDateTime },
        { title: 'Hoạt động gần nhất', dataIndex: 'last_seen_at', render: fmtDateTime },
        { title: 'Đang dùng', key: 'active', render: (_, k) => <Switch checked={k.is_active} onChange={(v) => toggle(k, v)} /> },
      ]} />
    </div>
  );
}

export default function AttendanceManagementPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'daily';
  const [people, setPeople] = useState({});
  const [pending, setPending] = useState(0);
  const [pendingCheckout, setPendingCheckout] = useState(0);
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  useEffect(() => {
    if (!MANAGER_ROLES.includes(role)) return;
    axios.get('http://localhost:4000/api/identity/users/employees', authConfig())
      .then((res) => setPeople(Object.fromEntries((res.data.data || []).map((u) => [u.id, { name: u.Profile?.full_name || u.email, role: u.role }]))))
      .catch(() => {});
    axios.get(`${ATT_API}/explanations`, { ...authConfig(), params: { status: 'PENDING' } }).then((res) => setPending(res.data.pending || 0)).catch(() => {});
    axios.get(`${ATT_API}/checkout-requests`, { ...authConfig(), params: { status: 'PENDING' } }).then((res) => setPendingCheckout(res.data.pending || 0)).catch(() => {});
  }, [role]);

  const items = useMemo(() => [
    { key: 'daily', label: 'Bảng công theo ngày', children: <DailyTab people={people} /> },
    { key: 'explanations', label: <Badge count={pending} size="small" offset={[10, -2]}><span>Giải trình vào ca</span></Badge>, children: <ExplanationTab people={people} onPending={setPending} /> },
    { key: 'checkout', label: <Badge count={pendingCheckout} size="small" offset={[10, -2]}><span>Đơn ra ca</span></Badge>, children: <CheckoutRequestTab people={people} onPending={setPendingCheckout} /> },
    { key: 'report', label: 'Báo cáo tháng', children: <ReportTab people={people} /> },
    { key: 'kiosks', label: 'Máy chấm công', children: <KioskTab /> },
  ], [people, pending, pendingCheckout]);

  if (!MANAGER_ROLES.includes(role)) return <Result status="403" title="Chỉ quản lý được truy cập trang này" />;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Chấm công nhân viên</h2>
      <p className="text-gray-500 mb-4">Kết quả chấm công theo ca của bác sĩ, CSKH, NVBH, KTV.</p>
      <Tabs activeKey={tab} onChange={(key) => setParams({ tab: key })} destroyOnHidden items={items} />
    </div>
  );
}
