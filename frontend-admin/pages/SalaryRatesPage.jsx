import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Table, Tag, Button, Modal, Form, InputNumber, DatePicker, Input, Timeline, Result, Alert, Badge, message } from 'antd';
import { EditOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { PAYROLL_API, authConfig, errorText, money, ROLE_LABEL, STAFF_ROLES } from '../components/attendance/attendanceApi';

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');

// Quản lý nhập mức lương / ca cho từng nhân viên (theo thâm niên), chia tab theo vai trò, lưu lịch sử thay đổi
export default function SalaryRatesPage() {
  const [rows, setRows] = useState([]);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('DOCTOR');
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  let role = '';
  try { role = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${PAYROLL_API}/rates`, authConfig());
      setRows(res.data.data || []);
      setLockedUntil(res.data.locked_until);
    } catch (err) {
      message.error(errorText(err, 'Không tải được mức lương'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (MANAGER_ROLES.includes(role)) load(); }, []);

  // Ngày áp dụng sớm nhất được chọn: sau tháng đã khóa bảng lương gần nhất
  const minDate = lockedUntil ? dayjs(`${lockedUntil}-01`).endOf('month').add(1, 'day').startOf('day') : null;

  const openEdit = (emp) => {
    form.resetFields();
    const start = minDate && minDate.isAfter(dayjs()) ? minDate : dayjs().startOf('day');
    form.setFieldsValue({ rate_per_shift: emp.current?.rate_per_shift, effective_from: emp.current ? start : (minDate || dayjs().startOf('month')) });
    setEditing(emp);
  };

  const save = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const res = await axios.post(`${PAYROLL_API}/rates`, {
        employee_id: editing.id, rate_per_shift: values.rate_per_shift, effective_from: values.effective_from.format('YYYY-MM-DD'), note: values.note,
      }, authConfig());
      message.success(res.data.message);
      setEditing(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không lưu được'));
    } finally {
      setSaving(false);
    }
  };

  const byRole = useMemo(() => Object.fromEntries(STAFF_ROLES.map((r) => [r, rows.filter((e) => e.role === r).sort((a, b) => a.name.localeCompare(b.name, 'vi'))])), [rows]);

  if (!MANAGER_ROLES.includes(role)) return <Result status="403" title="Chỉ quản lý được truy cập trang này" />;

  const columns = [
    { title: 'Nhân viên', key: 'name', render: (_, e) => <div><div className="font-medium">{e.name}</div><div className="text-xs text-gray-500">{e.email}{e.status !== 'ACTIVE' && <Tag className="ml-2">Ngừng hoạt động</Tag>}</div></div> },
    {
      title: 'Mức đang áp dụng', key: 'current', width: 200, render: (_, e) => (e.current
        ? <div><div className="font-semibold text-teal-700">{money(e.current.rate_per_shift)} / ca</div><div className="text-xs text-gray-500">từ {fmtDate(e.current.effective_from)}</div></div>
        : <Tag color="red">Chưa có mức lương</Tag>),
    },
    {
      title: 'Thay đổi sắp tới', key: 'upcoming', width: 200, render: (_, e) => (e.upcoming.length
        ? e.upcoming.map((u) => <div key={u.id} className="text-sm"><b>{money(u.rate_per_shift)}</b> <span className="text-gray-500">từ {fmtDate(u.effective_from)}</span></div>)
        : '—'),
    },
    {
      title: '', key: 'actions', width: 210, render: (_, e) => (
        <div className="flex gap-1">
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(e)}>{e.current || e.upcoming.length ? 'Đổi mức' : 'Nhập mức'}</Button>
          <Button size="small" icon={<HistoryOutlined />} disabled={!e.history.length} onClick={() => setHistory(e)}>Lịch sử</Button>
        </div>
      ),
    },
  ];

  const missing = (r) => byRole[r].filter((e) => e.status === 'ACTIVE' && !e.current && !e.upcoming.length).length;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-bold !mb-0">Mức lương ca</h2>
        <p className="text-gray-500 !mb-0">Mỗi nhân viên một mức riêng (theo thâm niên). Mỗi lần đổi được lưu lại, ca trước ngày áp dụng vẫn tính theo mức cũ.</p>
      </div>
      {lockedUntil && <Alert type="info" showIcon message={`Bảng lương đến tháng ${dayjs(`${lockedUntil}-01`).format('MM/YYYY')} đã khóa nên mức mới chỉ áp dụng từ ${fmtDate(minDate)}.`} />}
      <Tabs activeKey={tab} onChange={setTab} items={STAFF_ROLES.map((r) => ({
        key: r,
        label: <Badge count={missing(r)} size="small" offset={[8, -2]} title="Chưa có mức lương"><span>{ROLE_LABEL[r]} ({byRole[r].length})</span></Badge>,
        children: <Table rowKey="id" size="middle" loading={loading} dataSource={byRole[r]} columns={columns} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: `Chưa có ${ROLE_LABEL[r]} nào` }} />,
      }))} />

      <Modal open={!!editing} title={editing ? `Mức lương ca · ${editing.name}` : ''} onCancel={() => setEditing(null)} onOk={save} okText="Lưu" confirmLoading={saving} destroyOnHidden>
        {editing?.current && <p className="text-gray-600">Mức hiện tại: <b>{money(editing.current.rate_per_shift)}</b> / ca (từ {fmtDate(editing.current.effective_from)})</p>}
        <Form form={form} layout="vertical">
          <Form.Item name="rate_per_shift" label="Mức lương / ca (4 giờ)" rules={[{ required: true, message: 'Nhập mức lương' }, { validator: (_, v) => (!v || v % 1000 === 0 ? Promise.resolve() : Promise.reject(new Error('Phải tròn nghìn đồng'))) }]}>
            <InputNumber className="!w-full" min={10000} max={100000000} step={10000} addonAfter="đ"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => Number(String(v).replace(/\./g, ''))} />
          </Form.Item>
          <Form.Item name="effective_from" label="Áp dụng từ ngày" rules={[{ required: true, message: 'Chọn ngày' }]}
            extra="Các ca từ ngày này trở đi tính theo mức mới">
            <DatePicker className="w-full" format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => !!minDate && d.isBefore(minDate, 'day')} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú (lý do thay đổi)">
            <Input maxLength={300} placeholder="VD: Tăng lương theo thâm niên 2 năm" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!history} title={history ? `Lịch sử mức lương · ${history.name}` : ''} onCancel={() => setHistory(null)} footer={null} destroyOnHidden>
        {history && (
          <Timeline className="mt-4" items={history.history.map((h) => ({
            color: h.id === history.current?.id ? 'green' : dayjs(h.effective_from).isAfter(dayjs()) ? 'blue' : 'gray',
            children: (
              <div>
                <div><b>{money(h.rate_per_shift)}</b> / ca · áp dụng từ {fmtDate(h.effective_from)}
                  {h.id === history.current?.id && <Tag color="green" className="ml-2">Đang áp dụng</Tag>}
                  {dayjs(h.effective_from).isAfter(dayjs()) && <Tag color="blue" className="ml-2">Sắp áp dụng</Tag>}
                </div>
                <div className="text-xs text-gray-500">Nhập lúc {dayjs(h.createdAt).format('HH:mm DD/MM/YYYY')}{h.note ? ` · ${h.note}` : ''}</div>
              </div>
            ),
          }))} />
        )}
      </Modal>
    </div>
  );
}
