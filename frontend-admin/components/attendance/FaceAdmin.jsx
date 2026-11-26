import React, { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Empty, Image, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, TimePicker, Tooltip, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { ATT_API, authConfig, errorText, fmtDateTime } from './attendanceApi';
import { useLiveRefresh } from '../Notifications';
import { API_BASE } from '../../config';

const FACE_API = `${API_BASE}/api/ai/faces`;
// Kết quả so ảnh chấm công với ảnh gốc
export const FACE_STATUS = {
  MATCH: { color: 'green', label: 'Khớp ảnh gốc' },
  REVIEW: { color: 'orange', label: 'Cần xem lại' },
  NO_MATCH: { color: 'red', label: 'Không khớp ảnh gốc' },
  NO_FACE: { color: 'red', label: 'Không thấy rõ mặt' },
  MULTI_FACE: { color: 'red', label: 'Nhiều khuôn mặt' },
  ERROR: { color: 'default', label: 'Chưa so được' },
  NO_REFERENCE: { color: 'default', label: 'Chưa có ảnh gốc' },
};
export const FLAGGED = ['REVIEW', 'NO_MATCH', 'NO_FACE', 'MULTI_FACE', 'ERROR'];

// Nhãn kết quả so khuôn mặt của 1 lượt (vào / ra ca); lượt bị gắn cờ bấm được để quản lý xác nhận
export function FaceBadge({ check, review, onOpen }) {
  if (!check) return null;
  if (review) {
    return <Tooltip title={review.note || ''}><Tag color={review.verdict === 'SAME' ? 'green' : 'red'} className="cursor-pointer" onClick={onOpen}>{review.verdict === 'SAME' ? 'QL xác nhận đúng người' : 'QL xác nhận KHÔNG phải NV'}</Tag></Tooltip>;
  }
  const s = FACE_STATUS[check.status] || FACE_STATUS.ERROR;
  const flagged = FLAGGED.includes(check.status);
  return (
    <Tooltip title={check.distance != null ? `Khoảng cách khuôn mặt ${check.distance} (khớp < ${check.thresholds?.match ?? 0.45})` : ''}>
      <Tag color={s.color} className={flagged ? 'cursor-pointer' : ''} onClick={flagged ? onOpen : undefined}>{s.label}{flagged ? ' · xác nhận' : ''}</Tag>
    </Tooltip>
  );
}

// So ảnh gốc với ảnh chấm công, quản lý xác nhận đúng người / không phải nhân viên này
export function FaceReviewDrawer({ target, onClose, onDone }) {
  const [refs, setRefs] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const r = target?.record;
  const isOut = target?.kind === 'OUT';
  useEffect(() => {
    if (!target) return;
    setRefs(null); setNote('');
    axios.get(`${FACE_API}/${r.employee_id}/reference`, authConfig()).then((res) => setRefs(res.data.data.photos || [])).catch(() => setRefs([]));
  }, [target]);
  if (!target) return null;
  const check = isOut ? r.checkout_face_check : r.face_check;
  const review = isOut ? r.checkout_face_review : r.face_review;
  const submit = async (verdict) => {
    setBusy(verdict);
    try {
      const res = await axios.post(`${ATT_API}/records/${r.id}/face-review`, { kind: target.kind, verdict, note }, authConfig());
      message.success(res.data.message); onDone(); onClose();
    } catch (e) { message.error(errorText(e, 'Không lưu được')); } finally { setBusy(''); }
  };
  const s = FACE_STATUS[check?.status] || FACE_STATUS.ERROR;
  return (
    <Drawer open width={Math.min(760, window.innerWidth - 40)} title={`Xác nhận ảnh ${isOut ? 'ra' : 'vào'} ca · ${target.name}`} onClose={onClose} destroyOnHidden>
      <Space className="mb-3" wrap>
        <Tag color={s.color}>{s.label}</Tag>
        {check?.distance != null && <span className="text-sm text-gray-600">Khoảng cách khuôn mặt <b>{check.distance}</b> (khớp &lt; {check.thresholds?.match ?? 0.45}, cần xem &lt; {check.thresholds?.review ?? 0.6})</span>}
      </Space>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <b className="block mb-2">Ảnh gốc (quản lý đã duyệt)</b>
          {refs === null ? 'Đang tải...' : refs.length ? (
            <Image.PreviewGroup><div className="flex flex-wrap gap-2">{refs.map((u) => <Image key={u} src={u} width={110} height={110} className="rounded object-cover" />)}</div></Image.PreviewGroup>
          ) : <Empty description="Nhân viên chưa có ảnh gốc" />}
          <div className="text-xs text-gray-400 mt-1">Link xem ảnh gốc hết hạn sau 10 phút (ảnh lưu riêng tư).</div>
        </div>
        <div>
          <b className="block mb-2">Ảnh chấm công {fmtDateTime(isOut ? r.check_out_at : r.check_in_at)}</b>
          <Image src={isOut ? r.checkout_photo_url : r.photo_url} width={220} className="rounded" />
        </div>
      </div>
      {review ? (
        <Alert className="mt-4" type={review.verdict === 'SAME' ? 'success' : 'error'} showIcon message={review.verdict === 'SAME' ? 'Đã xác nhận đúng người' : 'Đã xác nhận không phải nhân viên này'} description={`${fmtDateTime(review.at)}${review.note ? ` · ${review.note}` : ''}`} />
      ) : (
        <div className="mt-4 space-y-2">
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ghi chú (bắt buộc khi chọn 'Không phải nhân viên này', ít nhất 10 ký tự)" />
          <Space>
            <Button type="primary" loading={busy === 'SAME'} onClick={() => submit('SAME')}>Đúng người</Button>
            <Popconfirm title={isOut ? 'Ghi không chấm ra ca (vi phạm nghiêm trọng)?' : 'Ghi VẮNG ca này (vi phạm nghiêm trọng)?'} onConfirm={() => submit('NOT_SAME')} okText="Xác nhận" cancelText="Không" disabled={note.trim().length < 10}>
              <Button danger loading={busy === 'NOT_SAME'} disabled={note.trim().length < 10}>Không phải nhân viên này</Button>
            </Popconfirm>
          </Space>
        </div>
      )}
    </Drawer>
  );
}

// Duyệt ảnh gốc khuôn mặt nhân viên
export function FaceEnrollTab({ people }) {
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reject, setReject] = useState(null); // { user_id, note }
  const load = async () => {
    setLoading(true);
    try { setRows((await axios.get(FACE_API, { ...authConfig(), params: { status: all ? 'all' : 'pending' } })).data.data || []); } catch (e) { message.error(errorText(e, 'Không tải được')); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [all]);
  useLiveRefresh(['attendance'], load);
  const review = async (userId, approve, note) => {
    try { const r = await axios.post(`${FACE_API}/${userId}/review`, { approve, note }, authConfig()); message.success(r.data.message); setReject(null); load(); } catch (e) { message.error(errorText(e, 'Không lưu được')); }
  };
  const remove = async (userId) => {
    try { const r = await axios.delete(`${FACE_API}/${userId}`, authConfig()); message.success(r.data.message); load(); } catch (e) { message.error(errorText(e, 'Không xoá được')); }
  };
  const photos = (list) => <Image.PreviewGroup><div className="flex gap-1">{(list || []).map((u) => <Image key={u} src={u} width={64} height={64} className="rounded object-cover" />)}</div></Image.PreviewGroup>;
  return (
    <div className="space-y-3">
      <Space wrap>
        <span><Switch checked={all} onChange={setAll} /> Xem cả nhân viên đã có ảnh gốc</span>
        <span className="text-gray-500 text-sm">Đối chiếu ảnh với người thật / ảnh hồ sơ nhân sự trước khi duyệt. Ảnh lưu riêng tư, link xem hết hạn sau 10 phút.</span>
      </Space>
      <Table rowKey="user_id" size="middle" loading={loading} dataSource={rows} pagination={false} locale={{ emptyText: all ? 'Chưa có nhân viên nào đăng ký' : 'Không có ảnh chờ duyệt' }} columns={[
        { title: 'Nhân viên', render: (_, d) => people[d.user_id]?.name || d.user_id },
        { title: 'Ảnh chờ duyệt', render: (_, d) => (d.pending ? (
          <div>{photos(d.pending.photos)}<div className="text-xs text-gray-500 mt-1">Gửi {fmtDateTime(d.pending.submitted_at)} · 3 ảnh lệch nhau tối đa {d.pending.consistency}{d.pending.similarity_to_active != null ? ` · so với ảnh gốc cũ ${d.pending.similarity_to_active}` : ''}</div></div>
        ) : '—') },
        { title: 'Ảnh gốc đang dùng', render: (_, d) => (d.active ? <div>{photos(d.active.photos)}<div className="text-xs text-gray-500 mt-1">Duyệt {fmtDateTime(d.active.reviewed_at)}</div></div> : <Tag>Chưa có</Tag>) },
        { title: '', width: 230, render: (_, d) => (
          <Space wrap>
            {d.pending && <Button type="primary" size="small" onClick={() => review(d.user_id, true)}>Duyệt</Button>}
            {d.pending && <Button size="small" onClick={() => setReject({ user_id: d.user_id, note: '' })}>Yêu cầu chụp lại</Button>}
            <Popconfirm title="Xoá toàn bộ dữ liệu khuôn mặt của nhân viên này?" onConfirm={() => remove(d.user_id)} okText="Xoá" cancelText="Không"><Button size="small" danger type="link">Xoá dữ liệu</Button></Popconfirm>
          </Space>
        ) },
      ]} />
      <Modal open={!!reject} title="Yêu cầu chụp lại ảnh gốc" okText="Gửi yêu cầu" cancelText="Đóng" onCancel={() => setReject(null)} onOk={() => review(reject.user_id, false, reject.note)} okButtonProps={{ disabled: (reject?.note || '').trim().length < 5 }}>
        <Input.TextArea rows={3} value={reject?.note} onChange={(e) => setReject((r) => ({ ...r, note: e.target.value }))} placeholder="Lý do (VD: ảnh tối, đeo khẩu trang, không phải nhân viên...)" />
      </Modal>
    </div>
  );
}

// Điều chỉnh giờ ca theo ngày (sự kiện, tăng ca, demo)
export function ShiftHoursTab() {
  const [data, setData] = useState({ data: [], defaults: {}, rules: {} });
  const [form, setForm] = useState({ date: dayjs(), shift_type: 'AFTERNOON', start: null, end: null, reason: '' });
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${ATT_API}/shift-hours`, authConfig()).then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  useLiveRefresh(['attendance'], load);
  const save = async (confirm = false) => {
    setBusy(true);
    try {
      const r = await axios.put(`${ATT_API}/shift-hours`, {
        date: form.date.format('YYYY-MM-DD'), shift_type: form.shift_type, start: form.start?.format('HH:mm'), end: form.end?.format('HH:mm'), reason: form.reason, confirm,
      }, authConfig());
      message.success(r.data.message); load();
    } catch (e) {
      if (e.response?.data?.code === 'HAS_RECORDS') Modal.confirm({ title: 'Ca này đã có người chấm công', content: e.response.data.message, okText: 'Vẫn điều chỉnh', cancelText: 'Không', onOk: () => save(true) });
      else message.error(errorText(e, 'Không lưu được'));
    } finally { setBusy(false); }
  };
  const remove = async (id) => { try { const r = await axios.delete(`${ATT_API}/shift-hours/${id}`, authConfig()); message.success(r.data.message); load(); } catch (e) { message.error(errorText(e, 'Không xoá được')); } };
  const d = data.defaults || {};
  const rl = data.rules || {};
  // Báo rõ vì sao chưa lưu được thay vì chỉ khoá nút
  const minMinutes = rl.min_minutes || 15;
  const length = form.start && form.end ? form.end.startOf('minute').diff(form.start.startOf('minute'), 'minute') : null;
  const formIssue = !form.start || !form.end ? 'Chọn giờ vào ca và giờ kết thúc.'
    : length < minMinutes ? `Ca phải dài ít nhất ${minMinutes} phút (đang chọn ${length} phút).`
      : length > 600 ? 'Ca dài tối đa 10 giờ.'
        : form.reason.trim().length < 5 ? 'Ghi lý do điều chỉnh, ít nhất 5 ký tự (VD: "demo báo cáo").' : null;
  return (
    <div className="space-y-4">
      <Alert type="info" showIcon message="Đổi giờ 1 ca của 1 ngày (sự kiện, tăng ca, chạy thử / demo)"
        description={<span>Giờ mặc định: Ca sáng {d.MORNING?.start} - {d.MORNING?.end}, Ca chiều {d.AFTERNOON?.start} - {d.AFTERNOON?.end}. Máy chấm công mở QR vào ca trước {rl.open_before} phút, đóng sau giờ vào ca {rl.close_after} phút; QR ra ca mở {rl.checkout_window} phút sau giờ kết thúc (đổi trong .env của service-booking). Nhân viên vẫn cần có ca làm ngày đó trong lịch.</span>} />
      <Space wrap align="start">
        <DatePicker value={form.date} onChange={(v) => v && setForm((f) => ({ ...f, date: v }))} allowClear={false} format="DD/MM/YYYY" disabledDate={(x) => x.isBefore(dayjs(), 'day')} />
        <Select className="w-32" value={form.shift_type} onChange={(v) => setForm((f) => ({ ...f, shift_type: v }))} options={[{ value: 'MORNING', label: 'Ca sáng' }, { value: 'AFTERNOON', label: 'Ca chiều' }]} />
        <TimePicker format="HH:mm" needConfirm={false} placeholder="Giờ vào ca" value={form.start} onChange={(v) => setForm((f) => ({ ...f, start: v }))} />
        <TimePicker format="HH:mm" needConfirm={false} placeholder="Giờ kết thúc" value={form.end} onChange={(v) => setForm((f) => ({ ...f, end: v }))} />
        <Input className="w-72" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Lý do (VD: demo báo cáo, sự kiện)" maxLength={300} />
        <Button type="primary" loading={busy} disabled={!!formIssue} onClick={() => save(false)}>Lưu giờ ca</Button>
      </Space>
      {formIssue && <div className="text-sm text-amber-600 -mt-2">{formIssue}</div>}
      <Table rowKey="id" size="middle" dataSource={data.data} pagination={false} locale={{ emptyText: 'Chưa điều chỉnh ngày nào' }} columns={[
        { title: 'Ngày', dataIndex: 'date', render: (v) => dayjs(v).format('DD/MM/YYYY') },
        { title: 'Ca', dataIndex: 'shift_type', render: (v) => (v === 'MORNING' ? 'Ca sáng' : 'Ca chiều') },
        { title: 'Giờ mới', render: (_, r) => `${r.start_time.slice(0, 5)} - ${r.end_time.slice(0, 5)}` },
        { title: 'Lý do', dataIndex: 'reason' },
        { title: '', width: 150, render: (_, r) => <Popconfirm title="Trả ca về giờ mặc định?" onConfirm={() => remove(r.id)} okText="Đồng ý" cancelText="Không"><Button size="small" danger type="link">Về giờ mặc định</Button></Popconfirm> },
      ]} />
    </div>
  );
}
