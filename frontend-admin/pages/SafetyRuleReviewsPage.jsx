import React, { useEffect, useState } from 'react';
import { Badge, Button, Empty, Input, List, Radio, Tabs, Tag, message } from 'antd';
import { PlusOutlined, EditOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { RULE_API, authHeaders, SEVERITY_COLOR, STATUS_COLOR, CHANGE_COLOR, VERDICT_COLOR, currentUser, useRuleMeta, RuleDetail, RuleTester, RuleFormModal, ReviseModal } from '../components/SafetyRuleParts';
import { useLiveRefresh, useTasks } from '../components/Notifications';

// BÁC SĨ: xem xét quy tắc quản lý gửi, đề xuất quy tắc mới / đề xuất sửa, ngưng quy tắc đang áp dụng cho quản lý chung.
export default function SafetyRuleReviewsPage() {
  const me = currentUser();
  const { tasks } = useTasks();
  const [meta] = useRuleMeta();
  const [tab, setTab] = useState('PENDING');
  const [items, setItems] = useState([]); // [{ rule, review? }]
  const [selected, setSelected] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [revise, setRevise] = useState(null);

  const load = async () => {
    try {
      if (tab === 'PENDING' || tab === 'DONE') setItems((await axios.get(`${RULE_API}/reviews/mine?status=${tab}`, authHeaders())).data.data);
      else if (tab === 'MINE') setItems((await axios.get(`${RULE_API}/proposals/mine`, authHeaders())).data.data.map((rule) => ({ rule })));
      else setItems((await axios.get(`${RULE_API}?status=ACTIVE`, authHeaders())).data.data.map((rule) => ({ rule })));
    } catch (error) { message.error(error.response?.data?.message || 'Không tải được danh sách'); }
  };
  const open = async (ruleId) => {
    try { setSelected((await axios.get(`${RULE_API}/${ruleId}`, authHeaders())).data.data); setVerdict(null); setComment(''); } catch (error) { message.error(error.response?.data?.message || 'Không tải được quy tắc'); }
  };
  useEffect(() => { load(); setSelected(null); }, [tab]);
  useLiveRefresh(['safety-rules'], () => { load(); if (selected) open(selected.id); });

  const send = async () => {
    setSending(true);
    try {
      const res = await axios.post(`${RULE_API}/${selected.id}/review`, { verdict, comment }, authHeaders());
      message.success(res.data.message);
      setSelected(null); load();
    } catch (error) { message.error(error.response?.data?.message || 'Không gửi được ý kiến'); } finally { setSending(false); }
  };
  const propose = async () => {
    try { const res = await axios.post(`${RULE_API}/${selected.id}/propose`, {}, authHeaders()); message.success(res.data.message); open(selected.id); load(); } catch (error) { message.error(error.response?.data?.message || 'Không gửi được'); }
  };

  const myPending = selected?.status === 'IN_REVIEW' && selected.reviews.some((v) => v.reviewer_id === me.id && !v.replaced && v.verdict === 'PENDING');
  const myDraft = selected && selected.created_by === me.id && selected.origin === 'DOCTOR' && ['DRAFT', 'CHANGES_REQUESTED'].includes(selected.status);
  const countOf = (key) => tasks.filter((t) => t.key === key).reduce((s, t) => s + t.count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold m-0">Quy tắc an toàn</h2>
          <div className="text-sm text-gray-500 mb-3">Xem xét quy tắc quản lý gửi, đề xuất quy tắc mới hoặc đề xuất sửa / ngưng quy tắc đang áp dụng. Quản lý chung là người duyệt.</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>Đề xuất quy tắc mới</Button>
      </div>
      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'PENDING', label: <span>Cần xem xét <Badge count={countOf('rule-reviews')} size="small" /></span> },
        { key: 'DONE', label: 'Đã trả lời' },
        { key: 'MINE', label: <span>Đề xuất của tôi <Badge count={countOf('rule-proposal-changes')} size="small" /></span> },
        { key: 'ACTIVE', label: 'Quy tắc đang áp dụng' },
      ]} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          {items.length === 0 ? <Empty description={{ PENDING: 'Không có quy tắc nào chờ bạn xem xét', DONE: 'Chưa trả lời quy tắc nào', MINE: 'Bạn chưa có đề xuất nào', ACTIVE: 'Chưa có quy tắc' }[tab]} /> : (
            <List size="small" bordered dataSource={items} className="max-h-[70vh] overflow-y-auto" renderItem={({ rule, review }) => (
              <List.Item onClick={() => open(rule.id)} className={`cursor-pointer ${selected?.id === rule.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="w-full">
                  <div className="flex justify-between gap-2"><b className="text-sm">{rule.condition} · {rule.target?.label}</b><Tag color={SEVERITY_COLOR[rule.severity]}>{rule.severity_label}</Tag></div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rule.change_type !== 'NEW' && <Tag color={CHANGE_COLOR[rule.change_type]}>{rule.change_label}</Tag>}
                    {tab === 'MINE' && <Tag color={STATUS_COLOR[rule.status]}>{rule.status_label}</Tag>}
                    {review && review.verdict !== 'PENDING' && <Tag color={VERDICT_COLOR[review.verdict]}>Bạn: {meta?.verdicts?.[review.verdict]}</Tag>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tab === 'MINE' || tab === 'ACTIVE' ? `Cập nhật ${dayjs(rule.updatedAt).format('DD/MM/YYYY HH:mm')}` : `Gửi bởi ${rule.created_by_name} · vòng ${review?.round} · ${dayjs(rule.submitted_at || rule.updatedAt).format('DD/MM/YYYY HH:mm')}`}
                  </div>
                </div>
              </List.Item>
            )} />
          )}
        </div>
        <div className="lg:col-span-3">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {selected.status === 'ACTIVE' && !selected.open_revision && <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => setRevise('EDIT')}>Đề xuất sửa</Button>
                  <Button size="small" danger icon={<StopOutlined />} onClick={() => setRevise('DEACTIVATE')}>Đề xuất ngưng</Button>
                </>}
                {myDraft && selected.change_type !== 'DEACTIVATE' && <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(selected); setFormOpen(true); }}>Sửa đề xuất</Button>}
                {myDraft && <Button size="small" type="primary" icon={<SendOutlined />} onClick={propose}>Gửi quản lý</Button>}
              </div>
              <RuleDetail rule={selected} />
              <RuleTester meta={meta} rule={selected} />
              {myPending && (
                <div className="p-3 rounded border border-blue-200 bg-blue-50">
                  <b className="block mb-2">Ý kiến của bạn</b>
                  <Radio.Group className="mb-2" value={verdict} onChange={(e) => setVerdict(e.target.value)} optionType="button" buttonStyle="solid"
                    options={[{ value: 'AGREE', label: 'Đồng ý' }, { value: 'CHANGES', label: 'Cần sửa' }, { value: 'DISAGREE', label: 'Không đồng ý' }]} />
                  <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000}
                    placeholder={verdict && verdict !== 'AGREE' ? 'Bắt buộc: lý do / nội dung cần sửa (mức độ, từ khóa, nguồn...)' : 'Nhận xét (không bắt buộc khi đồng ý)'} />
                  <Button className="mt-2" type="primary" loading={sending} disabled={!verdict} onClick={send}>Gửi ý kiến</Button>
                </div>
              )}
            </div>
          ) : <Empty description="Chọn một quy tắc để xem" />}
        </div>
      </div>

      <RuleFormModal open={formOpen} meta={meta} rule={editing} mode="DOCTOR" onClose={() => setFormOpen(false)}
        onSaved={() => { setTab('MINE'); load(); if (editing) open(editing.id); }} />
      <ReviseModal rule={revise ? selected : null} type={revise} onClose={() => setRevise(null)}
        onCreated={(row) => { setTab('MINE'); setTimeout(() => open(row.id), 300); }} />
    </div>
  );
}
