import React, { useEffect, useState } from 'react';
import { Table, Tag, Segmented, Button, Drawer, Descriptions, Image, Input, Popconfirm, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { ATT_API, authConfig, errorText, fmtTime, fmtDateTime, SHIFT_LABEL, ROLE_LABEL, EXPLANATION_STATUS, REQUEST_KIND } from './attendanceApi';
import { useLiveRefresh } from '../Notifications';

// Quản lý duyệt đơn ra ca: xin về sớm / quên chấm ra ca
// Duyệt: không ảnh hưởng lương (về sớm tính 1 vi phạm thường). Từ chối: 1 vi phạm nghiêm trọng (mất thưởng chuyên cần).
export default function CheckoutRequestTab({ people, onPending }) {
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
      const res = await axios.get(`${ATT_API}/checkout-requests`, { ...authConfig(), params: status ? { status } : {} });
      setRows(res.data.data || []);
      setReasons(res.data.early_reasons || {});
      onPending(res.data.pending || 0);
    } catch (err) {
      message.error(errorText(err, 'Không tải được đơn ra ca'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]);
  useLiveRefresh(['attendance'], load);

  const review = async (decision) => {
    if (decision === 'REJECT' && note.trim().length < 10) return message.error('Từ chối phải ghi rõ lý do (ít nhất 10 ký tự)');
    setBusy(decision);
    try {
      const res = await axios.post(`${ATT_API}/checkout-requests/${detail.id}/review`, { decision, note }, authConfig());
      message.success(res.data.message);
      setDetail(null);
      load();
    } catch (err) {
      message.error(errorText(err, 'Không xử lý được'));
    } finally {
      setBusy('');
    }
  };

  const reasonLabel = (r) => (r.kind === 'FORGOT' ? 'Quên chấm ra ca' : reasons[r.reason_type] || r.reason_type);
  const columns = [
    { title: 'Nhân viên', key: 'emp', render: (_, r) => <div><div className="font-medium">{people[r.employee_id]?.name || 'Không rõ'}</div><div className="text-xs text-gray-500">{ROLE_LABEL[people[r.employee_id]?.role]}</div></div> },
    { title: 'Loại', dataIndex: 'kind', width: 160, render: (k, r) => <div><Tag color={k === 'EARLY_LEAVE' ? 'orange' : 'blue'}>{REQUEST_KIND[k]}</Tag>{r.kind === 'FORGOT' && r.is_early && <Tag color="red">Khai về sớm</Tag>}</div> },
    { title: 'Ca', key: 'shift', width: 200, render: (_, r) => `${SHIFT_LABEL[r.shift_type]} · ${dayjs(r.shift_date).format('DD/MM')}` },
    { title: 'Giờ về', key: 'leave', width: 120, render: (_, r) => <span>{fmtTime(r.record?.check_out_at || r.leave_time)}{r.record?.minutes_early > 0 && <span className="text-orange-500"> (sớm {r.record.minutes_early}')</span>}</span> },
    { title: 'Lý do', key: 'reason', render: (_, r) => reasonLabel(r) },
    { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (v) => <Tag color={EXPLANATION_STATUS[v]?.color}>{EXPLANATION_STATUS[v]?.label}</Tag> },
    { title: '', key: 'open', width: 90, render: (_, r) => <Button size="small" type={r.status === 'PENDING' ? 'primary' : 'default'} onClick={() => { setDetail(r); setNote(''); }}>{r.status === 'PENDING' ? 'Xét duyệt' : 'Xem'}</Button> },
  ];

  // Đơn về sớm chưa quét ra ca => chờ hết khung ra ca mới duyệt được (hệ thống tự ghi giờ về theo đơn)
  const waitingCheckout = detail?.kind === 'EARLY_LEAVE' && !detail.record?.checkout_status;

  return (
    <div className="space-y-3">
      <Segmented value={status} onChange={setStatus} options={[
        { value: 'PENDING', label: 'Chờ duyệt' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' }, { value: '', label: 'Tất cả' },
      ]} />
      <Table rowKey="id" size="middle" loading={loading} dataSource={rows} columns={columns} scroll={{ x: 1000 }} pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: status === 'PENDING' ? 'Không có đơn chờ duyệt' : 'Không có dữ liệu' }} />

      <Drawer open={!!detail} onClose={() => setDetail(null)} size={Math.min(560, window.innerWidth)} title={detail ? REQUEST_KIND[detail.kind] : ''} destroyOnHidden
        footer={detail?.status === 'PENDING' && (
          <div className="space-y-2">
            {waitingCheckout && <div className="text-xs text-orange-600">Nhân viên chưa quét ra ca. Duyệt được sau khi quét ra ca hoặc hết khung ra ca ({fmtTime(dayjs(`${detail.shift_date}T${detail.shift_type === 'MORNING' ? '12:30' : '17:30'}`))}).</div>}
            <Input.TextArea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cho nhân viên (bắt buộc khi từ chối, ít nhất 10 ký tự)" />
            <div className="flex justify-end gap-2">
              <Popconfirm title="Từ chối => tính 1 vi phạm nghiêm trọng (mất thưởng chuyên cần). Tiếp tục?" onConfirm={() => review('REJECT')}>
                <Button danger loading={busy === 'REJECT'} disabled={waitingCheckout}>Từ chối</Button>
              </Popconfirm>
              <Button type="primary" loading={busy === 'APPROVE'} disabled={waitingCheckout} onClick={() => review('APPROVE')}>Duyệt</Button>
            </div>
          </div>
        )}>
        {detail && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered items={[
              { label: 'Nhân viên', children: `${people[detail.employee_id]?.name || 'Không rõ'} (${ROLE_LABEL[people[detail.employee_id]?.role] || ''})` },
              { label: 'Ca', children: `${SHIFT_LABEL[detail.shift_type]} · ${dayjs(detail.shift_date).format('DD/MM/YYYY')}` },
              { label: 'Lý do', children: reasonLabel(detail) },
              { label: detail.kind === 'EARLY_LEAVE' ? 'Giờ dự kiến về' : 'Giờ về đã khai', children: fmtTime(detail.leave_time) },
              { label: 'Giờ quét ra ca', children: detail.record?.check_out_at ? <span>{fmtTime(detail.record.check_out_at)}{detail.record.minutes_early > 0 && <span className="text-orange-500"> (về sớm {detail.record.minutes_early} phút)</span>}</span> : 'Chưa quét' },
              { label: 'Người xác nhận', children: detail.witness_name || '—' },
              { label: 'Gửi lúc', children: fmtDateTime(detail.createdAt) },
              ...(detail.status !== 'PENDING' ? [{ label: 'Kết quả', children: <span><Tag color={EXPLANATION_STATUS[detail.status]?.color}>{EXPLANATION_STATUS[detail.status]?.label}</Tag> {fmtDateTime(detail.reviewed_at)}{detail.review_note && <div className="text-gray-600 mt-1">{detail.review_note}</div>}</span> }] : []),
            ]} />
            {detail.record?.checkout_photo_url && (
              <div><div className="font-semibold mb-1">Ảnh xác nhận ra ca</div><Image src={detail.record.checkout_photo_url} width={120} className="rounded" /></div>
            )}
            <div>
              <div className="font-semibold mb-1">Mô tả</div>
              <div className="whitespace-pre-line bg-gray-50 rounded-lg p-3 text-sm">{detail.description}</div>
            </div>
            {detail.evidence_urls?.length > 0 && (
              <Image.PreviewGroup>
                <div className="flex flex-wrap gap-2">{detail.evidence_urls.map((u) => <Image key={u} src={u} width={96} height={96} className="rounded object-cover" />)}</div>
              </Image.PreviewGroup>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
