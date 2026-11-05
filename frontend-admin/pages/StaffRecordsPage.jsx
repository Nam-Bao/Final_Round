import React, { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Button, Avatar, Tabs, Input, Space, Modal, Select, Popconfirm, Result, Tooltip, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import StaffRecordModal from '../components/hr/StaffRecordModal';
import { HR_API, ROLE_INFO, CONTRACT_TYPES, EMPLOYMENT_TYPES, EMPLOYMENT_STATUS } from '../components/hr/staffFields';

const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const fmt = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');
const nameOf = (s) => s.full_name || s.email;

// Hồ sơ nhân sự của phòng khám: mỗi tài khoản nhân viên có 1 hồ sơ, chia tab theo vai trò
export default function StaffRecordsPage() {
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(null);
  let myRole = '';
  try { myRole = JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { /* phiên lỗi */ }

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(HR_API, authConfig());
      setRows(res.data.data || []);
      setRoles(res.data.roles || []);
    } catch (err) {
      message.error(err.response?.data?.message || 'Không tải được hồ sơ nhân sự');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (MANAGER_ROLES.includes(myRole)) load(); }, []);

  const shown = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((s) => (tab === 'ALL' || s.role === tab)
      && (!q || `${s.full_name || ''} ${s.email} ${s.record?.employee_code || ''} ${s.phone || ''}`.toLowerCase().includes(q)));
  }, [rows, tab, keyword]);

  if (!MANAGER_ROLES.includes(myRole)) return <Result status="403" title="Chỉ quản lý được truy cập trang này" />;

  const withoutRecord = rows.filter((s) => !s.record);
  const alertCount = rows.filter((s) => s.alerts.length).length;

  const remove = async (s) => {
    try {
      const res = await axios.delete(`${HR_API}/${s.user_id}`, authConfig());
      message.success(res.data.message);
      load();
    } catch (err) {
      message.error(err.response?.data?.message || 'Không xóa được hồ sơ');
    }
  };

  const columns = [
    {
      title: 'Nhân viên', key: 'name', render: (_, s) => (
        <div className="flex items-center gap-3 min-w-[230px]">
          <Avatar size={42} src={s.avatar || undefined} icon={!s.avatar && <UserOutlined />} className="bg-blue-500 shrink-0" />
          <div>
            <div className="font-medium">{[s.title, nameOf(s)].filter(Boolean).join(' ')}</div>
            <div className="text-xs text-gray-500">{s.record?.employee_code ? `${s.record.employee_code} · ` : ''}{s.email}</div>
          </div>
        </div>
      ),
    },
    ...(tab === 'ALL' ? [{ title: 'Vai trò', dataIndex: 'role', width: 150, render: (r) => <Tag color={ROLE_INFO[r]?.color}>{ROLE_INFO[r]?.label || r}</Tag> }] : []),
    { title: 'Chức danh', key: 'position', render: (_, s) => <div><div>{s.record?.position || '—'}</div>{s.specialty && <div className="text-xs text-gray-500">{s.specialty}</div>}</div> },
    { title: 'Hình thức', key: 'type', width: 140, render: (_, s) => EMPLOYMENT_TYPES[s.record?.employment_type] || '—' },
    {
      title: 'Hợp đồng', key: 'contract', width: 190, render: (_, s) => (s.record ? (
        <div>
          <div>{CONTRACT_TYPES[s.record.contract_type]}</div>
          <div className="text-xs text-gray-500">{s.record.contract_end ? `đến ${fmt(s.record.contract_end)}` : `từ ${fmt(s.record.start_date)}`}</div>
        </div>
      ) : '—'),
    },
    {
      title: 'Trạng thái', key: 'status', width: 170, render: (_, s) => (
        <Space size={[0, 4]} wrap>
          {s.record
            ? <Tag color={EMPLOYMENT_STATUS[s.record.employment_status]?.color}>{EMPLOYMENT_STATUS[s.record.employment_status]?.label}</Tag>
            : <Tag color="orange">Chưa có hồ sơ</Tag>}
          {s.account_status !== 'ACTIVE' && <Tag>Tài khoản khóa</Tag>}
          {s.alerts.length > 0 && (
            <Tooltip title={s.alerts.map((a) => `${a.label} ${a.expired ? 'đã hết hạn' : 'sắp hết hạn'} ${fmt(a.date)}`).join(' · ')}>
              <Tag color={s.alerts.some((a) => a.expired) ? 'red' : 'gold'} icon={<WarningOutlined />}>Hết hạn</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '', key: 'actions', width: 130, render: (_, s) => (s.record ? (
        <Space size={0}>
          <Tooltip title="Xem / sửa"><Button type="text" icon={<EditOutlined />} onClick={() => setEditing(s)} /></Tooltip>
          <Popconfirm title={`Xóa hồ sơ ${s.record.employee_code}?`} description="Tài khoản đăng nhập, chấm công, lương vẫn giữ nguyên. Tạo lại có thể khôi phục dữ liệu cũ." onConfirm={() => remove(s)} okText="Xóa" okButtonProps={{ danger: true }}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => setEditing(s)}>Tạo hồ sơ</Button>),
    },
  ];

  const count = (r) => rows.filter((s) => s.role === r).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-xl font-bold !mb-0">Hồ sơ nhân sự</h2>
          <p className="text-gray-500 text-sm !mb-0">
            {rows.length} nhân sự{withoutRecord.length > 0 && <> · <span className="text-orange-600">{withoutRecord.length} chưa có hồ sơ</span></>}
            {alertCount > 0 && <> · <span className="text-red-600">{alertCount} hợp đồng / chứng chỉ cần gia hạn</span></>}
          </p>
        </div>
        <Space wrap>
          <Input.Search allowClear placeholder="Tìm tên, mã, email, SĐT" className="!w-64" onChange={(e) => setKeyword(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setPicked(null); setPicking(true); }}>Thêm hồ sơ</Button>
        </Space>
      </div>

      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'ALL', label: `Tất cả (${rows.length})` },
        ...roles.map((r) => ({ key: r, label: `${ROLE_INFO[r]?.label || r} (${count(r)})` })),
      ]} />
      <Table rowKey="user_id" size="middle" loading={loading} dataSource={shown} columns={columns} scroll={{ x: 1000 }}
        pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} locale={{ emptyText: 'Không có nhân sự' }} />

      {/* Chọn tài khoản để liên kết hồ sơ mới */}
      <Modal open={picking} title="Thêm hồ sơ nhân sự" okText="Tiếp tục" okButtonProps={{ disabled: !picked }} onCancel={() => setPicking(false)}
        onOk={() => { setEditing(withoutRecord.find((s) => s.user_id === picked)); setPicking(false); }}>
        <p className="text-gray-600">Mỗi hồ sơ liên kết với 1 tài khoản nhân viên. Chọn tài khoản chưa có hồ sơ:</p>
        <Select className="w-full" showSearch optionFilterProp="label" placeholder="Chọn tài khoản" value={picked} onChange={setPicked}
          options={withoutRecord.map((s) => ({ value: s.user_id, label: `${nameOf(s)} · ${ROLE_INFO[s.role]?.label} · ${s.email}` }))}
          notFoundContent="Mọi tài khoản đều đã có hồ sơ" />
        <p className="text-xs text-gray-500 mt-2">Chưa có tài khoản? Admin tạo tại trang Quản lý người dùng trước.</p>
      </Modal>

      {editing && <StaffRecordModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
