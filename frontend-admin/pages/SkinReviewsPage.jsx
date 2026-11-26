import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Drawer, Input, Modal, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd';
import { EditOutlined, ExpandOutlined, HistoryOutlined, SwapOutlined, ClockCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import SkinScanReview, { ReviewModal } from '../components/SkinScanReview';
import { useLiveRefresh } from '../components/Notifications';
import { API_BASE } from '../config';

const { Title, Text } = Typography;
const API = `${API_BASE}/api/ai`;
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const SEV_COLOR = { 'Nhẹ': 'green', 'Trung bình': 'orange', 'Nặng': 'red', 'Không thấy mụn viêm': 'cyan' };
const me = () => { try { return JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch { return {}; } };

// Trang "Xác nhận soi da": lượt soi được giao khi bác sĩ hoàn tất khám mà chưa xác nhận (hạn 48 giờ) + lượt đã xác nhận để sửa.
// Bác sĩ thấy việc của mình; quản lý thấy tất cả, giao lại cho bác sĩ khác, xem dữ liệu huấn luyện.
export default function SkinReviewsPage() {
  const user = me();
  const isManager = ['GEN_MANAGER', 'ADMIN'].includes(user.role);
  const [status, setStatus] = useState('pending');
  const [dateField, setDateField] = useState('scan');
  const [range, setRange] = useState(null);
  const [q, setQ] = useState('');
  const [doctorId, setDoctorId] = useState(null);
  const [source, setSource] = useState(null); // web | clinic
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], total: 0, counts: {}, class_options: [], severities: [] });
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [stats, setStats] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);
  const [reassign, setReassign] = useState(null); // { row, doctor_id }

  const load = async () => {
    setLoading(true);
    try {
      const params = { status, date_field: dateField, q: q || undefined, doctor_id: doctorId || undefined, source: source || undefined, page, page_size: 15 };
      if (range?.[0]) params.from = range[0].format('YYYY-MM-DD');
      if (range?.[1]) params.to = range[1].format('YYYY-MM-DD');
      const res = await axios.get(`${API}/reviews`, { headers: headers(), params });
      setData(res.data);
    } catch (e) { message.error(e.response?.data?.message || 'Không tải được danh sách'); } finally { setLoading(false); }
    if (isManager) axios.get(`${API}/training/stats`, { headers: headers() }).then((r) => setStats(r.data.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [status, dateField, range, q, doctorId, source, page]);
  useEffect(() => {
    axios.get(`${API_BASE}/api/identity/users/doctors`, { headers: headers() })
      .then((r) => setDoctors((r.data.data || r.data || []).map((d) => ({ value: d.id, label: d.Profile?.full_name || d.full_name || d.email }))))
      .catch(() => setDoctors([]));
  }, []);
  useLiveRefresh(['skin-reviews'], load);
  const nameOf = useMemo(() => Object.fromEntries(doctors.map((d) => [d.value, d.label])), [doctors]);
  const view = (s) => (s.review?.status === 'CONFIRMED' && s.corrected ? s.corrected : s.ai);
  const canEdit = (s) => s.review?.status !== 'CONFIRMED' || isManager || s.review.reviewed_by === user.id;

  const saveReassign = async () => {
    try {
      const res = await axios.put(`${API}/analyses/${reassign.row.id}/assign-to`, { doctor_id: reassign.doctor_id }, { headers: headers() });
      message.success(res.data.message); setReassign(null); load();
    } catch (e) { message.error(e.response?.data?.message || 'Không giao lại được'); }
  };

  const columns = [
    { title: 'Khách', render: (_, s) => (
      <div>
        <div className="font-medium">{s.subject?.name || <Text type="secondary">(chưa có tên)</Text>}</div>
        <div className="text-xs text-gray-500">{[s.subject?.relationship, s.subject?.phone].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { title: 'Ảnh', width: 86, render: (_, s) => (
      <div className="relative w-16">
        <img src={s.image_url} alt="" className="w-16 h-16 object-cover rounded" />
        {s.images?.length > 1 && <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[10px] px-1 rounded">{s.images.length} ảnh</span>}
      </div>
    ) },
    { title: 'Ngày soi', render: (_, s) => <span>{dayjs(s.created_at).format('DD/MM/YYYY HH:mm')}<br /><Tag color={s.source === 'clinic' ? 'purple' : 'default'}>{s.source === 'clinic' ? 'Tại phòng khám' : 'Khách tự soi (web)'}</Tag></span> },
    { title: 'Ngày khám', render: (_, s) => (s.assignment?.assigned_at ? dayjs(s.assignment.assigned_at).format('DD/MM/YYYY HH:mm') : <Text type="secondary">Xác nhận khi khám</Text>) },
    { title: 'Mức độ AI → bác sĩ', render: (_, s) => (
      <span>
        <Tag color={SEV_COLOR[s.ai?.severity]}>{s.ai?.severity || '—'}</Tag>
        {s.review?.status === 'CONFIRMED' && <>→ <Tag color={SEV_COLOR[view(s)?.severity]}>{view(s)?.severity}</Tag></>}
      </span>
    ) },
    { title: 'Bác sĩ', render: (_, s) => (
      <div className="text-xs">
        {s.assignment?.doctor_id && <div>Phụ trách: {nameOf[s.assignment.doctor_id] || '—'}</div>}
        {s.review?.reviewed_by && <div className="text-gray-500">Xác nhận: {nameOf[s.review.reviewed_by] || '—'}</div>}
      </div>
    ) },
    { title: 'Trạng thái', render: (_, s) => (s.review?.status === 'SUPERSEDED' ? <Tag>Đã đánh giá bằng ảnh tại phòng khám</Tag> : s.review?.status === 'CONFIRMED' ? (
      <Space size={4} wrap>
        <Tag color="green">Đã xác nhận {dayjs(s.review.reviewed_at).format('DD/MM HH:mm')}</Tag>
        {s.edits > 0 && <Tooltip title="Số lần sửa sau khi đã xác nhận"><Tag>sửa {s.edits} lần</Tag></Tooltip>}
        {isManager && s.review.low_effort && <Tooltip title="Dưới 15 giây, tất cả 'Đúng' - không dùng làm dữ liệu huấn luyện"><Tag color="orange">xác nhận nhanh</Tag></Tooltip>}
        {isManager && s.training?.status && <Tooltip title={s.training.reason || ''}><Tag color={{ QUEUED: 'blue', EXPORTED: 'geekblue', REMOVED: 'default' }[s.training.status] || 'default'}>{{ QUEUED: 'đủ nhãn, chờ xuất', EXPORTED: 'đã xuất dữ liệu', REMOVED: 'khách rút đồng ý', NOT_ELIGIBLE: 'không dùng huấn luyện' }[s.training.status]}</Tag></Tooltip>}
      </Space>
    ) : (
      <Tag color={s.overdue ? 'red' : 'orange'} icon={<ClockCircleOutlined />}>
        {s.overdue ? 'Quá hạn' : 'Chờ xác nhận'}{s.assignment?.due_at ? ` · hạn ${dayjs(s.assignment.due_at).format('DD/MM HH:mm')}` : ''}
      </Tag>
    )) },
    { title: '', width: 230, render: (_, s) => (
      <Space size={4} wrap>
        {user.role === 'DOCTOR' || isManager ? (
          <Tooltip title={canEdit(s) ? '' : 'Chỉ bác sĩ đã xác nhận hoặc quản lý được sửa'}>
            <Button size="small" type={s.review?.status === 'CONFIRMED' ? 'default' : 'primary'} disabled={!canEdit(s)}
              icon={s.review?.status === 'CONFIRMED' ? <EditOutlined /> : <ExpandOutlined />} onClick={() => setReviewing(s)}>
              {s.review?.status === 'CONFIRMED' ? 'Sửa' : 'Xác nhận'}
            </Button>
          </Tooltip>
        ) : null}
        <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOf(s)}>Lịch sử</Button>
        {isManager && s.review?.status !== 'CONFIRMED' && <Button size="small" icon={<SwapOutlined />} onClick={() => setReassign({ row: s, doctor_id: s.assignment?.doctor_id })}>Giao lại</Button>}
      </Space>
    ) },
  ];

  const c = data.counts || {};
  return (
    <div className="space-y-4">
      <div>
        <Title level={3} className="!mb-1">Xác nhận soi da AI</Title>
        <Text type="secondary">
          Lượt soi khách tự chụp trên web (giao cho bác sĩ khi hoàn tất khám mà chưa xác nhận) và lượt soi ảnh CSKH chụp tại phòng khám (giao ngay khi quét); hạn xác nhận 48 giờ. Khách xem kết quả bác sĩ hiệu chỉnh và được nhắc khi bác sĩ xác nhận.
        </Text>
      </div>

      {isManager && stats && (
        <Card size="small" title="Dữ liệu cải thiện AI (khách đồng ý dùng ảnh)">
          <div className="flex flex-wrap gap-8">
            <Statistic title="Đủ nhãn, chờ xuất" value={stats.queued} />
            <Statistic title="Đã xuất bộ dữ liệu" value={stats.exported} />
            <Tooltip title={Object.entries(stats.reasons || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Không có'}>
              <div><Statistic title="Không dùng được (di chuột xem lý do)" value={stats.not_eligible} /></div>
            </Tooltip>
            <Statistic title="Khách rút lại đồng ý" value={stats.removed} />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Xuất bộ dữ liệu COCO (ảnh đã bỏ thông tin định danh): chạy <code>node scripts/export_training.js</code> trong service-ai-analysis. Chỉ lượt soi khoanh đủ các nốt mới dùng được; lượt chỉ nhập "số bỏ sót" bị loại vì thiếu vị trí nốt.
          </div>
        </Card>
      )}

      <Card size="small">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Segmented value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: 'pending', label: `Chưa xác nhận (${c.pending ?? 0})` },
              { value: 'overdue', label: <span className={c.overdue ? 'text-red-600' : ''}>Quá hạn ({c.overdue ?? 0})</span> },
              { value: 'confirmed', label: `Đã xác nhận (${c.confirmed ?? 0})` },
              ...(isManager ? [{ value: 'low_effort', label: 'Xác nhận nhanh' }] : []),
              { value: 'all', label: 'Tất cả' },
            ]} />
          <Select value={dateField} onChange={(v) => { setDateField(v); setPage(1); }} style={{ width: 130 }} options={[{ value: 'scan', label: 'Theo ngày soi' }, { value: 'exam', label: 'Theo ngày khám' }]} />
          <DatePicker.RangePicker format="DD/MM/YYYY" value={range} onChange={(v) => { setRange(v); setPage(1); }} placeholder={['Từ ngày', 'Đến ngày']} />
          <Select allowClear placeholder="Nguồn ảnh" style={{ width: 170 }} value={source} onChange={(v) => { setSource(v); setPage(1); }} options={[{ value: 'clinic', label: 'Tại phòng khám' }, { value: 'web', label: 'Khách tự soi (web)' }]} />
          <Input.Search allowClear placeholder="Tên khách / số điện thoại" style={{ width: 240 }} onSearch={(v) => { setQ(v.trim()); setPage(1); }} />
          {isManager && <Select allowClear placeholder="Bác sĩ" style={{ width: 200 }} value={doctorId} onChange={(v) => { setDoctorId(v); setPage(1); }} options={doctors} showSearch optionFilterProp="label" />}
        </div>
        {status === 'overdue' && c.overdue > 0 && <Alert className="mb-3" type="error" showIcon message="Các lượt soi đã quá hạn xác nhận: khách đang xem kết quả AI chưa được bác sĩ kiểm tra." />}
        <Table rowKey="id" size="middle" loading={loading} dataSource={data.data} columns={columns} scroll={{ x: 1100 }}
          pagination={{ current: page, pageSize: data.page_size || 15, total: data.total, onChange: setPage, showTotal: (t) => `${t} lượt soi` }} />
      </Card>

      {reviewing && (
        <ReviewModal scan={reviewing} classes={data.class_options || []} severities={data.severities || []} appointmentId={reviewing.assignment?.appointment_id}
          onClose={() => setReviewing(null)} onSaved={load} />
      )}
      <Drawer open={!!historyOf} width={Math.min(1100, window.innerWidth - 40)} onClose={() => { setHistoryOf(null); load(); }} destroyOnHidden
        title={`Lịch sử soi da · ${historyOf?.subject?.name || ''}`}>
        {historyOf && <SkinScanReview patientProfileId={historyOf.patient_profile_id} appointmentId={historyOf.assignment?.appointment_id} />}
      </Drawer>
      <Modal open={!!reassign} title="Giao lại lượt soi cho bác sĩ khác" okText="Giao lại" cancelText="Đóng" onCancel={() => setReassign(null)} onOk={saveReassign} okButtonProps={{ disabled: !reassign?.doctor_id }}>
        <p className="text-sm text-gray-600 mb-2">Hạn xác nhận được tính lại 48 giờ kể từ lúc giao.</p>
        <Select className="w-full" showSearch optionFilterProp="label" value={reassign?.doctor_id} onChange={(v) => setReassign((r) => ({ ...r, doctor_id: v }))} options={doctors} placeholder="Chọn bác sĩ" />
      </Modal>
    </div>
  );
}
