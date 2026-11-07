import React, { useEffect, useState } from 'react';
import {
  Table, Tag, Button, DatePicker, Alert, Space, Modal, Form, Select, InputNumber, Input, Popconfirm, Result, Descriptions, Drawer, Timeline, Steps, message,
} from 'antd';
import {
  ReloadOutlined, LockOutlined, UnlockOutlined, DownloadOutlined, PlusOutlined, DeleteOutlined, CalculatorOutlined,
  ClockCircleOutlined, AuditOutlined, UserOutlined, DollarOutlined, CheckCircleFilled, RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  PAYROLL_API, authConfig, errorText, money, fmtTime, SHIFT_LABEL, ROLE_LABEL, RECORD_STATUS, CHECKOUT_STATUS,
} from '../components/attendance/attendanceApi';

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const DISCIPLINE_SUGGEST = { REPRIMAND: 'Khiển trách', SALARY_RAISE_DELAY: 'Kéo dài thời hạn nâng lương' };

const downloadCsv = (filename, header, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
};

// Đề xuất kỷ luật theo số vi phạm nghiêm trọng (phương án A): 1 lần mất thưởng, 2 lần khiển trách, từ 3 lần kéo dài nâng lương
const suggestion = (serious) => (serious >= 3 ? 'SALARY_RAISE_DELAY' : serious === 2 ? 'REPRIMAND' : null);

// Nhóm vấn đề chốt công: mỗi nhóm 1 thẻ, bấm để xem danh sách
const PROBLEM_GROUPS = [
  { key: 'MANAGER', title: 'Chờ quản lý duyệt', desc: 'Giải trình / đơn ra ca chưa xét', icon: <AuditOutlined />, tone: 'red', link: '/attendance-management?tab=explanations', linkText: 'Đi tới duyệt' },
  { key: 'EMPLOYEE', title: 'Chờ nhân viên', desc: 'Chưa chấm công / chưa giải trình, còn trong hạn 24h', icon: <UserOutlined />, tone: 'amber' },
  { key: 'RATE', title: 'Chưa có mức lương', desc: 'Nhân viên chưa được nhập mức lương ca', icon: <DollarOutlined />, tone: 'red', link: '/salary-rates', linkText: 'Nhập mức lương' },
  { key: 'UPCOMING', title: 'Ca chưa diễn ra', desc: 'Tháng chưa kết thúc, không cần xử lý', icon: <ClockCircleOutlined />, tone: 'slate' },
];
const TONE = {
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
};

export default function PayrollPage() {
  const [month, setMonth] = useState(dayjs()); // mặc định tháng hiện tại
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState(null);
  const [adjFor, setAdjFor] = useState(null);
  const [disciplineFor, setDisciplineFor] = useState(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [paidOpen, setPaidOpen] = useState(false);
  const [paidRef, setPaidRef] = useState('');
  const [openGroup, setOpenGroup] = useState(null);
  const navigate = useNavigate();
  const [adjForm] = Form.useForm();
  const [discForm] = Form.useForm();
  const adjType = Form.useWatch('type', adjForm);
  const discAction = Form.useWatch('action', discForm);
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(PAYROLL_API, { ...authConfig(), params: { month: month.format('YYYY-MM') } });
      setState(res.data);
    } catch (err) {
      message.error(errorText(err, 'Không tải được bảng lương'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (MANAGER_ROLES.includes(role)) { setOpenGroup(null); load(); } }, [month]);

  const act = async (key, request) => {
    setBusy(key);
    try {
      const res = await request();
      message.success(res.data.message);
      await load();
      return true;
    } catch (err) {
      message.error(errorText(err, 'Không thực hiện được'));
      if (err.response?.data?.problems) load();
      return false;
    } finally {
      setBusy('');
    }
  };

  if (!MANAGER_ROLES.includes(role)) return <Result status="403" title="Chỉ quản lý được truy cập trang này" />;

  const payroll = state?.data;
  // Vấn đề chưa phân loại (service cũ) => xếp vào nhóm chờ nhân viên để luôn hiện trên thẻ
  const problems = (state?.problems || []).map((p) => ({ ...p, category: p.category || (p.type === 'NO_RATE' ? 'RATE' : 'EMPLOYEE') }));
  const locked = payroll?.status === 'LOCKED';
  const isPreview = !payroll; // chưa tạo bảng lương => bảng tạm tính
  const items = payroll?.items || state?.preview || [];
  const grouped = Object.fromEntries(PROBLEM_GROUPS.map((g) => [g.key, problems.filter((p) => p.category === g.key)]));
  const blocking = problems.filter((p) => p.category !== 'UPCOMING');
  const systemProblem = problems.find((p) => p.category === 'SYSTEM');
  const step = payroll?.paid_at ? 3 : locked ? 2 : payroll ? 1 : 0;
  const adjustments = payroll?.adjustments || [];
  const cats = state?.categories || { PLUS: {}, MINUS: {} };
  const actions = state?.discipline_actions || {};
  const discipline = state?.discipline || [];
  const m = month.format('MM-YYYY');
  const total = items.reduce((s, i) => s + Number(i.total), 0);

  const generate = () => act('generate', () => axios.post(`${PAYROLL_API}/generate`, { month: month.format('YYYY-MM') }, authConfig()));

  const saveAdjustment = async () => {
    let v;
    try { v = await adjForm.validateFields(); } catch { return; }
    const ok = await act('adj', () => axios.post(`${PAYROLL_API}/${payroll.id}/adjustments`, { ...v, employee_id: adjFor.employee_id }, authConfig()));
    if (ok) setAdjFor(null);
  };
  const saveDiscipline = async () => {
    let v;
    try { v = await discForm.validateFields(); } catch { return; }
    const ok = await act('disc', () => axios.post(`${PAYROLL_API}/discipline`, {
      ...v, employee_id: disciplineFor.employee_id, month: month.format('YYYY-MM'), decided_at: v.decided_at.format('YYYY-MM-DD'),
    }, authConfig()));
    if (ok) setDisciplineFor(null);
  };

  const exportSummary = () => downloadCsv(`bang-luong-${m}.csv`,
    ['Nhân viên', 'Vai trò', 'Ca có công', 'Ca được xếp', 'Ca vắng', 'Lương ca', 'Vi phạm thường', 'Vi phạm nghiêm trọng', 'Thưởng chuyên cần', 'Khoản cộng', 'Khoản trừ', 'Tổng nhận'],
    items.map((i) => [i.employee_name, ROLE_LABEL[i.role], i.worked_shifts, i.scheduled_shifts, i.absent_shifts, i.shift_pay, i.normal_violations, i.serious_violations, i.attendance_bonus, i.adjustments_plus, i.adjustments_minus, i.total]));
  const exportDetail = () => downloadCsv(`chi-tiet-luong-${m}.csv`,
    ['Nhân viên', 'Vai trò', 'Ngày', 'Ca', 'Mức lương ca', 'Được trả', 'Vào ca', 'Giờ vào', 'Ra ca', 'Giờ ra', 'Vi phạm'],
    items.flatMap((i) => i.details.map((d) => [i.employee_name, ROLE_LABEL[i.role], dayjs(d.date).format('DD/MM/YYYY'), SHIFT_LABEL[d.shift_type], d.rate, d.paid,
      RECORD_STATUS[d.status]?.label || '', fmtTime(d.check_in_at), CHECKOUT_STATUS[d.checkout_status]?.label || '', fmtTime(d.check_out_at),
      d.violations.map((x) => `${x.severity === 'SERIOUS' ? '[Nghiêm trọng] ' : ''}${x.label}`).join('; ')])));

  const columns = [
    { title: 'Nhân viên', key: 'emp', fixed: 'left', render: (_, i) => <div><div className="font-medium">{i.employee_name}</div><div className="text-xs text-gray-500">{ROLE_LABEL[i.role]}</div></div> },
    { title: 'Ca có công', key: 'shifts', align: 'center', render: (_, i) => <span><b>{i.worked_shifts}</b>/{i.scheduled_shifts}{i.absent_shifts > 0 && <div className="text-xs text-red-600">vắng {i.absent_shifts}</div>}</span> },
    { title: 'Lương ca', dataIndex: 'shift_pay', align: 'right', render: money },
    {
      title: 'Vi phạm', key: 'vio', align: 'center', render: (_, i) => {
        const s = suggestion(i.serious_violations);
        const done = discipline.some((d) => d.employee_id === i.employee_id);
        return (
          <div>
            <span className="text-orange-500">{i.normal_violations}</span> / <span className="text-red-600 font-semibold">{i.serious_violations}</span>
            {s && <div><Tag color={done ? 'default' : 'red'} className={`!mr-0 ${isPreview ? '' : 'cursor-pointer'}`} onClick={() => { if (isPreview) return; discForm.resetFields(); discForm.setFieldsValue({ action: s, decided_at: dayjs() }); setDisciplineFor(i); }}>{done ? 'Đã ghi kỷ luật' : `Đề xuất: ${DISCIPLINE_SUGGEST[s]}`}</Tag></div>}
          </div>
        );
      },
    },
    { title: 'Chuyên cần', dataIndex: 'attendance_bonus', align: 'right', render: (v) => (Number(v) ? <span className="text-teal-600">{money(v)}</span> : '0đ') },
    { title: 'Khoản cộng', dataIndex: 'adjustments_plus', align: 'right', render: (v) => (Number(v) ? <span className="text-green-600">+{money(v)}</span> : '—') },
    { title: 'Khoản trừ', dataIndex: 'adjustments_minus', align: 'right', render: (v) => (Number(v) ? <span className="text-red-600">−{money(v)}</span> : '—') },
    { title: 'Tổng nhận', dataIndex: 'total', align: 'right', render: (v) => <b className="text-slate-800">{money(v)}</b> },
    {
      title: '', key: 'act', width: 150, render: (_, i) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => setDetail(i)}>Chi tiết</Button>
          {payroll && !locked && <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => { adjForm.resetFields(); adjForm.setFieldsValue({ type: 'PLUS', category: 'BONUS' }); setAdjFor(i); }}>Khoản khác</Button>}
        </Space>
      ),
    },
  ];

  const detailAdjustments = detail ? adjustments.filter((a) => a.employee_id === detail.employee_id) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold !mb-0">Bảng lương tháng {month.format('MM/YYYY')}</h2>
          <p className="text-gray-500 text-sm !mb-0">Σ lương ca có đi làm + thưởng chuyên cần + khoản cộng − khoản trừ (làm tròn 1.000đ)</p>
        </div>
        <Space>
          <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} format="MM/YYYY" />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
        </Space>
      </div>

      {/* Quy trình 3 bước */}
      <div className="bg-white border rounded-xl px-5 py-4">
        <Steps size="small" current={step} status={step === 0 && blocking.length ? 'error' : undefined} items={[
          { title: 'Chốt công', description: step > 0 ? 'Đã chốt' : blocking.length ? `${blocking.length} việc cần xử lý` : grouped.UPCOMING.length ? 'Chờ hết tháng' : 'Sẵn sàng' },
          { title: 'Bảng lương nháp', description: payroll ? 'Nhập khoản khác' : 'Chưa tạo' },
          { title: 'Duyệt & khóa', description: locked ? `Đã khóa ${dayjs(payroll.locked_at).format('DD/MM')}` : 'Nhân viên xem phiếu lương' },
          { title: 'Chi trả', description: payroll?.paid_at ? `Đã trả ${dayjs(payroll.paid_at).format('DD/MM')}` : 'Chuyển lương cho nhân viên' },
        ]} />
      </div>

      {/* Bước 1: chốt công */}
      {!locked && (
        systemProblem ? <Alert type="warning" showIcon message={systemProblem.reason} /> : problems.length ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {PROBLEM_GROUPS.map((g) => {
                const list = grouped[g.key];
                const count = list.length;
                const active = openGroup === g.key;
                return (
                  <button key={g.key} type="button" disabled={!count} onClick={() => setOpenGroup(active ? null : g.key)}
                    className={`text-left border rounded-xl p-4 transition ${count ? TONE[g.tone] : 'border-gray-100 bg-white text-gray-400'} ${active ? 'ring-2 ring-offset-1 ring-teal-400' : ''} ${count ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{count ? g.icon : <CheckCircleFilled className="text-green-500" />}</span>
                      <span className="text-2xl font-bold">{count}</span>
                    </div>
                    <div className="font-semibold mt-1">{g.title}</div>
                    <div className="text-xs opacity-80">{count ? g.desc : 'Không có'}</div>
                  </button>
                );
              })}
            </div>
            {openGroup && grouped[openGroup].length > 0 && (() => {
              const g = PROBLEM_GROUPS.find((x) => x.key === openGroup);
              return (
                <div className="bg-white border rounded-xl">
                  <div className="flex items-center justify-between px-4 py-2 border-b">
                    <span className="font-semibold">{g.title} ({grouped[openGroup].length})</span>
                    {g.link && <Button type="link" size="small" onClick={() => navigate(g.link)}>{g.linkText} <RightOutlined /></Button>}
                  </div>
                  <Table rowKey={(r, idx) => `${r.employee_id}-${r.date}-${r.shift_type}-${idx}`} size="small" pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }}
                    dataSource={grouped[openGroup]} columns={[
                      { title: 'Nhân viên', dataIndex: 'employee_name', render: (v) => <b>{v}</b> },
                      ...(openGroup === 'RATE' ? [] : [
                        { title: 'Ngày', dataIndex: 'date', width: 90, render: (d) => dayjs(d).format('DD/MM') },
                        { title: 'Ca', dataIndex: 'shift_type', width: 90, render: (t) => SHIFT_LABEL[t]?.split(' (')[0] },
                      ]),
                      { title: 'Nội dung', dataIndex: 'reason' },
                      ...(openGroup === 'EMPLOYEE' ? [{ title: 'Hạn', dataIndex: 'deadline', width: 130, render: (d) => (d ? dayjs(d).format('HH:mm DD/MM') : '—') }] : []),
                    ]} />
                </div>
              );
            })()}
            {!blocking.length && grouped.UPCOMING.length > 0 && (
              <p className="text-sm text-gray-500 !mb-0">Chỉ còn ca chưa diễn ra. Hết tháng và các ca đã chốt thì tạo được bảng lương chính thức.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-green-200 bg-green-50 rounded-xl px-4 py-3">
            <span className="text-green-800"><CheckCircleFilled className="text-green-500 mr-2" />Đã chốt công: không còn ca chờ xử lý, mọi nhân viên đã có mức lương.</span>
            <Button type="primary" icon={<CalculatorOutlined />} loading={busy === 'generate'} onClick={generate}>{payroll ? 'Tạo lại bảng lương nháp' : 'Tạo bảng lương nháp'}</Button>
          </div>
        )
      )}

      {/* Bảng lương: chính thức (nháp / đã khóa) hoặc tạm tính */}
      {items.length > 0 && (
        <div className="bg-white border rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold text-slate-800">
                {isPreview ? 'Bảng lương tạm tính' : 'Bảng lương'}{' '}
                <Tag color={locked ? 'green' : isPreview ? 'default' : 'gold'}>{locked ? 'Đã khóa' : isPreview ? 'Chưa chốt' : 'Bản nháp'}</Tag>
              </span>
              <span className="text-sm text-gray-500">{items.length} nhân viên · tổng <b className="text-slate-800">{money(total)}</b></span>
            </div>
            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={exportSummary}>Xuất bảng lương</Button>
              <Button icon={<DownloadOutlined />} onClick={exportDetail}>Chi tiết từng ca</Button>
              {payroll?.paid_at && <Tag color="green">Đã chi trả: {payroll.paid_ref}</Tag>}
              {locked && !payroll.paid_at && <Button type="primary" icon={<DollarOutlined />} onClick={() => { setPaidRef(''); setPaidOpen(true); }}>Đã chi trả lương</Button>}
              {payroll && (locked ? (
                !payroll.paid_at && <Button icon={<UnlockOutlined />} onClick={() => { setUnlockReason(''); setUnlockOpen(true); }}>Mở khóa</Button>
              ) : (
                <Popconfirm title="Duyệt và khóa bảng lương?" description="Sau khi khóa không sửa được bảng lương và chấm công của tháng này; nhân viên sẽ xem được phiếu lương."
                  onConfirm={() => act('lock', () => axios.post(`${PAYROLL_API}/${payroll.id}/lock`, {}, authConfig()))}>
                  <Button type="primary" icon={<LockOutlined />} loading={busy === 'lock'}>Duyệt & khóa</Button>
                </Popconfirm>
              ))}
            </Space>
          </div>
          {isPreview && <div className="px-4 py-2 text-xs text-gray-500 bg-slate-50 border-b">Số liệu tạm tính theo chấm công hiện tại, chưa gồm khoản khác. Thưởng chuyên cần và lương có thể thay đổi tới khi chốt công.</div>}
          {payroll && !locked && <div className="px-4 py-2 text-xs text-gray-500 bg-amber-50 border-b">Bản nháp: bấm "Khoản khác" để nhập thưởng, phụ cấp, tạm ứng, bồi thường rồi Duyệt & khóa. Tạo lại bảng lương vẫn giữ khoản khác.</div>}
          <Table rowKey="employee_id" size="middle" loading={loading} dataSource={items} columns={columns} scroll={{ x: 1150 }} pagination={false} />
        </div>
      )}
      {!items.length && !loading && !systemProblem && <p className="text-gray-500">Tháng này chưa có ca làm nào từ ngày bắt đầu chấm công.</p>}
      {state?.start_date && <p className="text-xs text-gray-400 !mb-0">Chỉ tính các ca từ ngày bắt đầu chấm công {dayjs(state.start_date).format('DD/MM/YYYY')}.</p>}
      {payroll?.history?.length > 0 && (
        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer">Lịch sử bảng lương ({payroll.history.length})</summary>
          <Timeline className="mt-3" items={[...payroll.history].reverse().map((h) => ({
            color: h.action === 'LOCK' ? 'green' : h.action === 'UNLOCK' ? 'red' : 'blue',
            children: <span>{{ GENERATE: 'Tạo bảng lương', REGENERATE: 'Tạo lại', LOCK: 'Duyệt & khóa', UNLOCK: 'Mở khóa', PAID: 'Chi trả lương' }[h.action]} · {dayjs(h.at).format('HH:mm DD/MM/YYYY')}{h.reason ? ` · Lý do: ${h.reason}` : ''}</span>,
          }))} />
        </details>
      )}

      {/* Chi tiết 1 nhân viên */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} size={Math.min(720, window.innerWidth)} title={detail ? `${detail.employee_name} · tháng ${month.format('MM/YYYY')}` : ''} destroyOnHidden>
        {detail && (
          <div className="space-y-4">
            <Descriptions column={2} size="small" bordered items={[
              { label: 'Lương ca', children: money(detail.shift_pay) },
              { label: 'Thưởng chuyên cần', children: money(detail.attendance_bonus) },
              { label: 'Khoản cộng', children: money(detail.adjustments_plus) },
              { label: 'Khoản trừ', children: money(detail.adjustments_minus) },
              { label: 'Vi phạm thường / nghiêm trọng', children: `${detail.normal_violations} / ${detail.serious_violations}` },
              { label: 'Tổng nhận', children: <b>{money(detail.total)}</b> },
            ]} />
            {detailAdjustments.length > 0 && (
              <div>
                <div className="font-semibold mb-1">Khoản khác</div>
                {detailAdjustments.map((a) => (
                  <div key={a.id} className="flex justify-between items-center border-b py-1.5 text-sm">
                    <span><Tag color={a.type === 'PLUS' ? 'green' : 'red'}>{cats[a.type]?.[a.category]}</Tag>{a.reason}</span>
                    <span className="flex items-center gap-2">
                      <b className={a.type === 'PLUS' ? 'text-green-600' : 'text-red-600'}>{a.type === 'PLUS' ? '+' : '−'}{money(a.amount)}</b>
                      {!locked && (
                        <Popconfirm title="Xóa khoản này?" onConfirm={() => act('del', () => axios.delete(`${PAYROLL_API}/${payroll.id}/adjustments/${a.id}`, authConfig())).then(() => setDetail(null))}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Table rowKey="shift_id" size="small" pagination={false} dataSource={detail.details} scroll={{ x: 640 }} columns={[
              { title: 'Ngày', dataIndex: 'date', width: 70, render: (d) => dayjs(d).format('DD/MM') },
              { title: 'Ca', dataIndex: 'shift_type', width: 70, render: (t) => SHIFT_LABEL[t]?.split(' (')[0].replace('Ca ', '') },
              { title: 'Vào / ra', key: 'io', width: 110, render: (_, d) => `${fmtTime(d.check_in_at)} – ${fmtTime(d.check_out_at)}` },
              { title: 'Mức / được trả', key: 'pay', width: 150, render: (_, d) => <span>{money(d.rate)}{!d.worked && <span className="text-red-600"> → 0đ</span>}</span> },
              { title: 'Vi phạm', key: 'v', render: (_, d) => (d.violations.length ? d.violations.map((v) => <div key={v.code} className={`text-xs ${v.severity === 'SERIOUS' ? 'text-red-600' : 'text-orange-500'}`}>• {v.label}</div>) : '—') },
            ]} />
          </div>
        )}
      </Drawer>

      {/* Khoản khác */}
      <Modal open={!!adjFor} title={adjFor ? `Khoản khác · ${adjFor.employee_name}` : ''} onCancel={() => setAdjFor(null)} onOk={saveAdjustment} okText="Thêm" confirmLoading={busy === 'adj'} destroyOnHidden>
        <Form form={adjForm} layout="vertical">
          <Form.Item name="type" label="Loại">
            <Select onChange={(t) => adjForm.setFieldValue('category', t === 'PLUS' ? 'BONUS' : 'ADVANCE')}
              options={[{ value: 'PLUS', label: 'Khoản cộng' }, { value: 'MINUS', label: 'Khoản trừ' }]} />
          </Form.Item>
          <Form.Item name="category" label="Nội dung" rules={[{ required: true }]}>
            <Select options={Object.entries(cats[adjType || 'PLUS'] || {}).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
            <InputNumber className="!w-full" min={1000} max={1000000000} step={10000} addonAfter="đ"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number(String(v).replace(/\./g, ''))} />
          </Form.Item>
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Bắt buộc ghi lý do' }, { min: 5, message: 'Ít nhất 5 ký tự' }]}>
            <Input.TextArea rows={2} maxLength={500} placeholder="VD: Tạm ứng ngày 15/11" />
          </Form.Item>
          {adjType === 'MINUS' && <Alert type="warning" showIcon message="Khoản trừ chỉ dùng cho tạm ứng và bồi thường thiệt hại. Pháp luật cấm phạt tiền, cắt lương thay cho kỷ luật." />}
        </Form>
      </Modal>

      {/* Kỷ luật */}
      <Modal open={!!disciplineFor} title={disciplineFor ? `Ghi nhận kỷ luật · ${disciplineFor.employee_name}` : ''} onCancel={() => setDisciplineFor(null)} onOk={saveDiscipline} okText="Lưu quyết định" confirmLoading={busy === 'disc'} destroyOnHidden>
        {disciplineFor && (
          <div className="space-y-3">
            <Alert type="info" showIcon message={`${disciplineFor.serious_violations} vi phạm nghiêm trọng trong tháng ${month.format('MM/YYYY')}`}
              description={disciplineFor.details.flatMap((d) => d.violations.filter((v) => v.severity === 'SERIOUS').map((v) => `${dayjs(d.date).format('DD/MM')}: ${v.label}`)).join(' · ')} />
            {discipline.filter((d) => d.employee_id === disciplineFor.employee_id).map((d) => (
              <div key={d.id} className="text-sm bg-gray-50 rounded p-2">Đã ghi: <b>{actions[d.action]}</b> ngày {dayjs(d.decided_at).format('DD/MM/YYYY')} · {d.reason}</div>
            ))}
            <Form form={discForm} layout="vertical">
              <Form.Item name="action" label="Hình thức" rules={[{ required: true }]}>
                <Select options={Object.entries(actions).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
              {discAction === 'SALARY_RAISE_DELAY' && (
                <Form.Item name="delay_months" label="Kéo dài thời hạn nâng lương (tháng)" rules={[{ required: true, message: 'Nhập số tháng' }]}>
                  <InputNumber min={1} max={6} className="!w-full" />
                </Form.Item>
              )}
              <Form.Item name="decided_at" label="Ngày quyết định" rules={[{ required: true }]}>
                <DatePicker className="w-full" format="DD/MM/YYYY" allowClear={false} />
              </Form.Item>
              <Form.Item name="reason" label="Lý do / căn cứ" rules={[{ required: true, message: 'Nhập lý do' }, { min: 10, message: 'Ít nhất 10 ký tự' }]}>
                <Input.TextArea rows={3} maxLength={2000} placeholder="VD: Tự ý bỏ về sớm 2 lần trong tháng 11 (ngày 05/11 và 12/11)" />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      <Modal open={paidOpen} title="Ghi nhận đã chi trả lương" onCancel={() => setPaidOpen(false)} okText="Xác nhận"
        onOk={async () => { if (await act('paid', () => axios.post(`${PAYROLL_API}/${payroll.id}/paid`, { paid_ref: paidRef }, authConfig()))) setPaidOpen(false); }}>
        <p className="mb-2">Chuyển lương cho nhân viên rồi nhập mã lệnh chuyển. Sau bước này không mở khóa bảng lương được nữa.</p>
        <Input maxLength={50} placeholder="Mã lệnh chuyển lương" value={paidRef} onChange={(e) => setPaidRef(e.target.value)} />
      </Modal>
      <Modal open={unlockOpen} title="Mở khóa bảng lương" onCancel={() => setUnlockOpen(false)} okText="Mở khóa" okButtonProps={{ danger: true }} confirmLoading={busy === 'unlock'}
        onOk={async () => { if (await act('unlock', () => axios.post(`${PAYROLL_API}/${payroll.id}/unlock`, { reason: unlockReason }, authConfig()))) setUnlockOpen(false); }}>
        <p className="text-gray-600">Mở khóa sẽ cho sửa lại bảng lương; nhân viên tạm không xem được phiếu lương tháng này. Lý do được lưu vào lịch sử.</p>
        <Input.TextArea rows={3} maxLength={500} value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="Lý do mở khóa (ít nhất 10 ký tự)" />
      </Modal>
    </div>
  );
}
