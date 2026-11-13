import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, Input, Modal, Select, Table, Tabs, Tag, message } from 'antd';
import { PlusOutlined, SendOutlined, CheckOutlined, CloseOutlined, EditOutlined, SwapOutlined, RollbackOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { RULE_API, authHeaders, SEVERITY_COLOR, STATUS_COLOR, CHANGE_COLOR, useRuleMeta, RuleFormModal, RuleDetail, RuleTester, ReviseModal } from '../components/SafetyRuleParts';
import { useLiveRefresh } from '../components/Notifications';

// Mỗi tab gồm các trạng thái
const TABS = [
  { key: 'WAITING', label: 'Chờ quản lý xử lý', statuses: ['REVIEWED', 'PROPOSED'], color: 'purple' },
  { key: 'IN_REVIEW', label: 'Chờ bác sĩ xem xét', statuses: ['IN_REVIEW'] },
  { key: 'DRAFT', label: 'Nháp', statuses: ['DRAFT'] },
  { key: 'CHANGES_REQUESTED', label: 'Đã trả bác sĩ sửa', statuses: ['CHANGES_REQUESTED'] },
  { key: 'ACTIVE', label: 'Đang áp dụng', statuses: ['ACTIVE'] },
  { key: 'HISTORY', label: 'Lịch sử', statuses: ['REJECTED', 'SUPERSEDED', 'INACTIVE', 'APPLIED'] },
];

// QUẢN LÝ CHUNG: quy tắc chống chỉ định.
// Quy tắc mình soạn: bắt buộc gửi bác sĩ xem xét rồi mới duyệt. Đề xuất của bác sĩ: duyệt / yêu cầu sửa / từ chối / gửi thêm bác sĩ.
export default function SafetyRulesPage() {
  const [meta, reloadMeta] = useRuleMeta();
  const [tab, setTab] = useState('WAITING');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewerIds, setReviewerIds] = useState([]);
  const [replace, setReplace] = useState(null);
  const [decision, setDecision] = useState(null); // { type: 'approve'|'reject'|'request-changes', note }
  const [revise, setRevise] = useState(null); // 'EDIT' | 'DEACTIVATE'
  const [busy, setBusy] = useState(false);

  const statusesOf = (key) => TABS.find((t) => t.key === key).statuses;
  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${RULE_API}?status=${statusesOf(tab).join(',')}`, authHeaders());
      setRows(res.data.data); setCounts(res.data.counts || {});
    } catch (error) { message.error(error.response?.data?.message || 'Không tải được quy tắc'); } finally { setLoading(false); }
  };
  const openDetail = async (id) => {
    try { setDetail((await axios.get(`${RULE_API}/${id}`, authHeaders())).data.data); } catch (error) { message.error(error.response?.data?.message || 'Không tải được quy tắc'); }
  };
  useEffect(() => { load(); }, [tab]);
  useLiveRefresh(['safety-rules'], () => { load(); if (detail) openDetail(detail.id); });

  const act = async (fn, done) => {
    setBusy(true);
    try { const res = await fn(); message.success(res.data.message); done?.(); load(); reloadMeta(); if (detail) openDetail(detail.id); } catch (error) { message.error(error.response?.data?.message || 'Thao tác không thành công'); } finally { setBusy(false); }
  };
  const tabCount = (t) => t.statuses.reduce((s, st) => s + (counts[st] || 0), 0);

  const columns = [
    { title: 'Loại', render: (_, r) => <Tag color={CHANGE_COLOR[r.change_type]}>{r.change_label}</Tag>, width: 150 },
    { title: 'Khi khách', dataIndex: 'condition', width: 180 },
    { title: 'Đối tượng', render: (_, r) => <span>{r.target?.label}{r.target?.status === 'DRAFT' && <Tag color="purple" className="ml-1">mới</Tag>}</span>, width: 170 },
    { title: 'Mức độ', render: (_, r) => <Tag color={SEVERITY_COLOR[r.severity]}>{r.severity_label}</Tag>, width: 120 },
    { title: 'Lời nhắc', dataIndex: 'message', ellipsis: true },
    { title: 'Trạng thái', render: (_, r) => <Tag color={STATUS_COLOR[r.status]}>{r.status_label}</Tag>, width: 170 },
    { title: 'Người soạn', dataIndex: 'created_by_name', width: 190, ellipsis: true },
    { title: 'Cập nhật', render: (_, r) => dayjs(r.updatedAt).format('DD/MM HH:mm'), width: 95 },
  ];

  const d = detail;
  const fromDoctor = d?.origin === 'DOCTOR';
  const current = d?.reviews?.filter((v) => !v.replaced) || [];
  const reviewedOk = d?.status === 'REVIEWED' && current.length > 0 && current.every((v) => v.verdict === 'AGREE');
  const canApprove = (fromDoctor && d?.status === 'PROPOSED') || reviewedOk;
  const canEdit = d && !fromDoctor && ['DRAFT', 'IN_REVIEW', 'REVIEWED'].includes(d.status) && d.change_type !== 'DEACTIVATE';
  const canReject = d && ['DRAFT', 'IN_REVIEW', 'REVIEWED', 'PROPOSED', 'CHANGES_REQUESTED'].includes(d.status) && !(fromDoctor && d.status === 'DRAFT');
  const hint = !d ? null
    : d.status === 'DRAFT' && !fromDoctor ? 'Quy tắc quản lý soạn phải được bác sĩ xem xét: chọn ít nhất 1 bác sĩ để gửi.'
    : d.status === 'PROPOSED' ? 'Đề xuất của bác sĩ: duyệt, yêu cầu bác sĩ sửa, từ chối, hoặc gửi thêm bác sĩ khác xem xét trước khi quyết định.'
    : d.status === 'REVIEWED' && !reviewedOk ? `Có bác sĩ chọn Cần sửa / Không đồng ý: ${fromDoctor ? 'yêu cầu bác sĩ đề xuất sửa' : 'sửa rồi gửi lại'}, hoặc từ chối.`
    : d.status === 'CHANGES_REQUESTED' ? 'Đã trả về bác sĩ, chờ bác sĩ sửa và gửi lại.' : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-xl font-bold m-0">Quy tắc an toàn (chống chỉ định)</h2>
          <div className="text-sm text-gray-500">Quy tắc quản lý soạn phải được bác sĩ xem xét trước khi duyệt. Duyệt xong áp dụng ngay cho kê đơn, thu tiền và bán tại quầy.</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>Soạn quy tắc</Button>
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={TABS.map((t) => ({ key: t.key, label: <span>{t.label} <Badge count={tabCount(t)} showZero={false} size="small" color={t.color || '#bbb'} /></span> }))} />
      <Table rowKey="id" size="small" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 1100 }}
        onRow={(r) => ({ onClick: () => openDetail(r.id), className: 'cursor-pointer' })} pagination={{ pageSize: 20 }} />

      <Drawer open={!!d} onClose={() => setDetail(null)} size={680} title="Chi tiết quy tắc" destroyOnHidden
        extra={d && (
          <div className="flex flex-wrap gap-2 justify-end">
            {d.status === 'ACTIVE' && !d.open_revision && <>
              <Button size="small" icon={<EditOutlined />} onClick={() => setRevise('EDIT')}>Sửa</Button>
              <Button size="small" danger icon={<StopOutlined />} onClick={() => setRevise('DEACTIVATE')}>Ngưng áp dụng</Button>
            </>}
            {d.status === 'ACTIVE' && d.open_revision && <Button size="small" onClick={() => openDetail(d.open_revision.id)}>Xem {d.open_revision.change_type === 'DEACTIVATE' ? 'đề xuất ngưng' : 'bản sửa'} đang xử lý</Button>}
            {canEdit && <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(d); setFormOpen(true); }}>Sửa</Button>}
            {((d.status === 'DRAFT' && !fromDoctor) || (d.status === 'PROPOSED' && fromDoctor)) && (
              <Button size="small" type={fromDoctor ? 'default' : 'primary'} icon={<SendOutlined />} onClick={() => { setReviewerIds([]); setSubmitOpen(true); }}>
                {fromDoctor ? 'Gửi thêm bác sĩ xem xét' : 'Gửi bác sĩ xem xét'}
              </Button>
            )}
            {fromDoctor && ['PROPOSED', 'REVIEWED'].includes(d.status) && <Button size="small" icon={<RollbackOutlined />} onClick={() => setDecision({ type: 'request-changes', note: '' })}>Yêu cầu bác sĩ sửa</Button>}
            {['PROPOSED', 'REVIEWED'].includes(d.status) && <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!canApprove} onClick={() => setDecision({ type: 'approve', note: '' })}>Duyệt</Button>}
            {canReject && <Button size="small" danger icon={<CloseOutlined />} onClick={() => setDecision({ type: 'reject', note: '' })}>Từ chối</Button>}
          </div>
        )}>
        {d && (
          <>
            {hint && <div className="mb-3 p-2 rounded bg-blue-50 border border-blue-200 text-sm">{hint}</div>}
            {d.status === 'IN_REVIEW' && current.some((v) => v.verdict === 'PENDING') && (
              <div className="mb-3 text-sm">Bác sĩ chậm trả lời?{' '}
                <Button size="small" type="link" icon={<SwapOutlined />} onClick={() => setReplace({ replace_id: undefined, reviewer_id: undefined })}>Đổi bác sĩ xem xét</Button>
              </div>
            )}
            {d.replaces && <div className="mb-2 text-sm"><Button size="small" type="link" className="!p-0" onClick={() => openDetail(d.replaces.id)}>Mở bản đang áp dụng (phiên bản {d.replaces.version || 1})</Button></div>}
            <RuleDetail rule={d} />
            <div className="mt-4"><RuleTester meta={meta} rule={d} /></div>
          </>
        )}
      </Drawer>

      <RuleFormModal open={formOpen} meta={meta} rule={editing} onClose={() => setFormOpen(false)} onSaved={() => { load(); reloadMeta(); if (editing) openDetail(editing.id); }} />
      <ReviseModal rule={revise ? d : null} type={revise} onClose={() => setRevise(null)}
        onCreated={(row) => { setTab('DRAFT'); openDetail(row.id); if (revise === 'EDIT') { setEditing(null); } }} />

      <Modal title={fromDoctor ? 'Gửi thêm bác sĩ xem xét' : 'Gửi bác sĩ xem xét'} open={submitOpen} onCancel={() => setSubmitOpen(false)} okText="Gửi" confirmLoading={busy}
        onOk={() => act(() => axios.post(`${RULE_API}/${d.id}/submit`, { reviewer_ids: reviewerIds }, authHeaders()), () => setSubmitOpen(false))}>
        <div className="text-sm text-gray-600 mb-2">Bác sĩ được chọn nhận thông báo ngay. Duyệt được khi mọi bác sĩ đã trả lời, có ít nhất 1 Đồng ý và không ai chọn Cần sửa / Không đồng ý.</div>
        <Select mode="multiple" className="w-full" value={reviewerIds} onChange={setReviewerIds} optionFilterProp="label" placeholder="Chọn bác sĩ"
          options={(meta?.doctors || []).filter((doc) => doc.id !== d?.created_by).map((doc) => ({ value: doc.id, label: doc.name }))} />
      </Modal>

      <Modal title="Đổi bác sĩ xem xét" open={!!replace} onCancel={() => setReplace(null)} okText="Đổi" confirmLoading={busy}
        onOk={() => act(() => axios.post(`${RULE_API}/${d.id}/reviewers`, replace, authHeaders()), () => setReplace(null))}>
        <Select className="w-full mb-2" placeholder="Bác sĩ chưa trả lời" value={replace?.replace_id} onChange={(v) => setReplace((r) => ({ ...r, replace_id: v }))}
          options={current.filter((v) => v.verdict === 'PENDING').map((v) => ({ value: v.reviewer_id, label: v.reviewer_name }))} />
        <Select className="w-full" placeholder="Bác sĩ thay thế" value={replace?.reviewer_id} onChange={(v) => setReplace((r) => ({ ...r, reviewer_id: v }))} optionFilterProp="label"
          options={(meta?.doctors || []).filter((doc) => doc.id !== d?.created_by && !current.some((v) => v.reviewer_id === doc.id)).map((doc) => ({ value: doc.id, label: doc.name }))} />
      </Modal>

      <Modal open={!!decision} onCancel={() => setDecision(null)} confirmLoading={busy}
        title={{ approve: 'Duyệt', reject: 'Từ chối', 'request-changes': 'Yêu cầu bác sĩ sửa đề xuất' }[decision?.type]}
        okText={{ approve: d?.change_type === 'DEACTIVATE' ? 'Duyệt ngưng áp dụng' : 'Duyệt và áp dụng', reject: 'Từ chối', 'request-changes': 'Trả về bác sĩ' }[decision?.type]}
        okButtonProps={{ danger: decision?.type === 'reject' }}
        onOk={() => act(() => axios.post(`${RULE_API}/${d.id}/${decision.type}`, { note: decision.note }, authHeaders()), () => setDecision(null))}>
        {decision?.type === 'approve' && (
          <div className="text-sm mb-2">{d?.change_type === 'DEACTIVATE'
            ? 'Quy tắc gốc sẽ ngưng áp dụng ngay.'
            : d?.change_type === 'EDIT' ? `Phiên bản ${d.version} thay cho bản đang áp dụng, có hiệu lực ngay.` : 'Quy tắc áp dụng ngay cho màn kê đơn của bác sĩ, thu tiền của CSKH và bán tại quầy của NVBH.'}</div>
        )}
        <Input.TextArea rows={3} value={decision?.note} onChange={(e) => setDecision((x) => ({ ...x, note: e.target.value }))} maxLength={1000}
          placeholder={decision?.type === 'approve' ? 'Ghi chú (không bắt buộc)' : decision?.type === 'reject' ? 'Lý do từ chối (ít nhất 10 ký tự)' : 'Nội dung bác sĩ cần sửa (ít nhất 10 ký tự)'} />
      </Modal>
    </div>
  );
}
