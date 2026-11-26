// Kiểm kho mỹ phẩm hàng tuần. NVBH đếm từng lô mà KHÔNG thấy số trên hệ thống (kiểm kho "mù"),
// ghi hàng lỗi + ảnh, khai thêm hàng ngoài danh sách. Lệch dù 1 sản phẩm => quản lý đếm lại và chốt số.
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Input, InputNumber, Select, DatePicker, Checkbox, Alert, Image, message } from 'antd';
import { PlusOutlined, CheckSquareOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLiveRefresh } from '../Notifications';
import { API, auth, errMsg, role, isManagerRole, COUNT_STATUS, CONDITIONS, CONDITION_OPTIONS } from './common';
import { PhotoInput } from './ReceiveTab';

export default function StockCountTab() {
  const manager = isManagerRole(role());
  const [rows, setRows] = useState([]);
  const [tpl, setTpl] = useState(null);
  const [form, setForm] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    axios.get(`${API}/purchasing/stock-counts`, auth()).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được phiếu kiểm kho'));
    axios.get(`${API}/purchasing/stock-counts/template`, auth()).then((r) => setTpl(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useLiveRefresh(['stock-counts'], load);

  const start = () => setForm({
    note: '', extras: [],
    lines: tpl.data.map((l) => ({ ...l, counted_qty: null, defect_qty: 0, condition: 'OK', images: [], note: '' })),
  });
  const upd = (lotId, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.lot_id === lotId ? { ...l, ...patch } : l)) }));
  const updExtra = (k, patch) => setForm((f) => ({ ...f, extras: f.extras.map((x, i) => (i === k ? { ...x, ...patch } : x)) }));
  const submit = async () => {
    const missing = form.lines.filter((l) => l.counted_qty === null || l.counted_qty === undefined);
    if (missing.length) { message.warning(`Còn ${missing.length} lô chưa nhập số đếm`); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API}/purchasing/stock-counts`, {
        note: form.note,
        lines: form.lines.map((l) => ({ lot_id: l.lot_id, counted_qty: l.counted_qty, defect_qty: l.defect_qty, condition: l.condition, images: l.images, note: l.note })),
        extras: form.extras.map((x) => ({ ...x, manufacture_date: x.manufacture_date?.format('YYYY-MM-DD') || null, expiry_date: x.expiry_date?.format('YYYY-MM-DD') || null })),
      }, auth());
      (r.data.data.status === 'MATCHED' ? message.success : message.warning)(r.data.message, 6);
      setForm(null); load();
    } catch (e) { message.error(errMsg(e, 'Không gửi được phiếu kiểm kho')); } finally { setBusy(false); }
  };

  const needs = (l) => l.extra || l.counted_qty !== l.system_qty || l.defect_qty > 0;
  const openReview = (r) => setReview({ r, checked: false, note: '', finals: Object.fromEntries(r.lines.map((l, i) => [i, needs(l) ? null : l.system_qty])) });
  const submitReview = async () => {
    setBusy(true);
    try {
      const r = await axios.put(`${API}/purchasing/stock-counts/${review.r.id}/review`, {
        checked: review.checked, note: review.note, finals: Object.entries(review.finals).filter(([, v]) => v !== null && v !== undefined).map(([index, final_qty]) => ({ index: Number(index), final_qty })),
      }, auth());
      message.success(r.data.message); setReview(null); load();
    } catch (e) { message.error(errMsg(e, 'Không chốt được phiếu')); } finally { setBusy(false); }
  };

  return (
    <>
      <Alert className="mb-3" type={tpl?.this_week ? 'success' : 'warning'} showIcon
        message={tpl?.this_week ? `Tuần ${tpl.week} đã kiểm kho (${tpl.this_week.code}, ${COUNT_STATUS[tpl.this_week.status]?.label.toLowerCase()})` : `Tuần ${tpl?.week || ''} chưa kiểm kho mỹ phẩm`}
        description="Đếm thực tế từng lô (số lô, HSD in trên bao bì); không có số trên hệ thống để đối chiếu. Hàng lỗi ghi số lượng + ảnh. Gặp hàng không có trong danh sách thì thêm ở mục Hàng ngoài danh sách. Lệch dù 1 sản phẩm, quản lý sẽ đếm lại." />
      <div className="flex justify-end mb-3"><Button type="primary" icon={<CheckSquareOutlined />} disabled={!tpl} onClick={start}>Bắt đầu kiểm kho</Button></div>
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (r) => (
            <Table rowKey={(l, i) => `${l.lot_id || 'x'}-${i}`} size="small" pagination={false} dataSource={r.lines}
              columns={[
                { title: 'Sản phẩm', dataIndex: 'name', render: (v, l) => <div>{v}{l.extra && <Tag color="purple" className="ml-1">ngoài danh sách</Tag>}{l.on_hold && <Tag className="ml-1">hết hạn, chờ hủy</Tag>}</div> },
                { title: 'Lô / HSD', render: (_, l) => `${l.lot_no} • ${dayjs(l.expiry_date).format('DD/MM/YYYY')}` },
                ...(manager ? [{ title: 'Hệ thống', dataIndex: 'system_qty', width: 90 }] : []),
                { title: 'Đếm', dataIndex: 'counted_qty', width: 70 },
                { title: 'Lỗi', width: 140, render: (_, l) => (l.defect_qty ? `${l.defect_qty} (${CONDITIONS[l.condition]})` : '-') },
                ...(manager ? [{ title: 'Chốt', dataIndex: 'final_qty', width: 70, render: (v) => v ?? '-' }] : []),
                { title: 'Ghi chú / ảnh', render: (_, l) => <div>{l.note}{l.images?.length > 0 && <Image.PreviewGroup>{l.images.map((u) => <Image key={u} src={u} width={40} height={40} className="object-cover ml-1 rounded" />)}</Image.PreviewGroup>}</div> },
              ]} />
          ),
        }}
        columns={[
          { title: 'Phiếu', dataIndex: 'code', width: 150, render: (v, r) => <div><b>{v}</b><div className="text-xs text-gray-500">Tuần {r.week} • {dayjs(r.createdAt).format('HH:mm DD/MM')}</div></div> },
          { title: 'Người đếm', dataIndex: 'counted_by_name', width: 160 },
          { title: 'Số dòng', render: (_, r) => <span>{r.lines.length} lô{r.diff_count ? <span className="text-red-600"> • {r.diff_count} dòng lệch / lỗi</span> : ''}</span> },
          { title: 'Trạng thái', width: 200, render: (_, r) => <div><Tag color={COUNT_STATUS[r.status]?.color}>{COUNT_STATUS[r.status]?.label}</Tag>{r.review_note && <div className="text-xs text-gray-500">{r.reviewed_by_name}: {r.review_note}</div>}</div> },
          ...(manager ? [{ title: '', width: 110, render: (_, r) => r.status === 'PENDING_REVIEW' && <Button size="small" type="primary" onClick={() => openReview(r)}>Đếm lại & chốt</Button> }] : []),
        ]} />

      <Modal open={!!form} title={`Kiểm kho tuần ${tpl?.week}`} onCancel={() => setForm(null)} onOk={submit} confirmLoading={busy} cancelText="Đóng" okText="Gửi phiếu kiểm kho" width={1000} destroyOnHidden>
        <Table rowKey="lot_id" size="small" pagination={false} dataSource={form?.lines || []} scroll={{ y: 420 }}
          columns={[
            { title: 'Sản phẩm', dataIndex: 'name', render: (v, l) => <div>{v}{l.on_hold && <Tag className="ml-1">hết hạn, để riêng</Tag>}</div> },
            { title: 'Lô / HSD', width: 160, render: (_, l) => <div>{l.lot_no}<div className="text-xs text-gray-500">HSD {dayjs(l.expiry_date).format('DD/MM/YYYY')}</div></div> },
            { title: 'Số đếm', width: 100, render: (_, l) => <InputNumber size="small" min={0} precision={0} value={l.counted_qty} status={l.counted_qty == null ? 'warning' : ''} onChange={(v) => upd(l.lot_id, { counted_qty: v })} /> },
            { title: 'Tình trạng', width: 170, render: (_, l) => <Select size="small" className="w-full" value={l.condition} options={CONDITION_OPTIONS} onChange={(v) => upd(l.lot_id, { condition: v, defect_qty: v === 'OK' ? 0 : Math.max(l.defect_qty, 1) })} /> },
            { title: 'Số lỗi', width: 80, render: (_, l) => <InputNumber size="small" min={0} precision={0} value={l.defect_qty} disabled={l.condition === 'OK'} onChange={(v) => upd(l.lot_id, { defect_qty: v ?? 0 })} /> },
            { title: 'Ảnh / ghi chú', width: 230, render: (_, l) => <div className="flex flex-col gap-1">{l.condition !== 'OK' && <PhotoInput value={l.images} onChange={(v) => upd(l.lot_id, { images: v })} max={3} />}<Input size="small" maxLength={300} value={l.note} onChange={(e) => upd(l.lot_id, { note: e.target.value })} /></div> },
          ]} />
        <div className="mt-3 font-medium">Hàng ngoài danh sách (lô không có trên hệ thống)</div>
        {(form?.extras || []).map((x, k) => (
          <div key={k} className="flex flex-wrap gap-2 mt-2">
            <Select showSearch optionFilterProp="label" className="!w-64" placeholder="Sản phẩm" value={x.product_id} options={(tpl?.products || []).map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => updExtra(k, { product_id: v })} />
            <Input className="!w-32" placeholder="Số lô" value={x.lot_no} onChange={(e) => updExtra(k, { lot_no: e.target.value })} />
            <DatePicker className="!w-36" placeholder="NSX" format="DD/MM/YYYY" value={x.manufacture_date} onChange={(v) => updExtra(k, { manufacture_date: v })} />
            <DatePicker className="!w-36" placeholder="HSD" format="DD/MM/YYYY" value={x.expiry_date} onChange={(v) => updExtra(k, { expiry_date: v })} />
            <InputNumber className="!w-24" min={1} precision={0} placeholder="Số đếm" value={x.counted_qty} onChange={(v) => updExtra(k, { counted_qty: v })} />
            <Button danger size="small" onClick={() => setForm((f) => ({ ...f, extras: f.extras.filter((_, i) => i !== k) }))}>Xóa</Button>
          </div>
        ))}
        <Button size="small" type="dashed" className="mt-2" icon={<PlusOutlined />} onClick={() => setForm((f) => ({ ...f, extras: [...f.extras, { product_id: null, lot_no: '', manufacture_date: null, expiry_date: null, counted_qty: null }] }))}>Thêm hàng ngoài danh sách</Button>
        <Input.TextArea className="mt-3" rows={2} maxLength={1000} placeholder="Ghi chú chung (không bắt buộc)" value={form?.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
      </Modal>

      <Modal open={!!review} title={`Đếm lại và chốt phiếu ${review?.r.code}`} onCancel={() => setReview(null)} onOk={submitReview} confirmLoading={busy} cancelText="Đóng" okText="Chốt phiếu" width={900} destroyOnHidden>
        <Alert className="mb-3" type="warning" showIcon message="Đếm lại thực tế các dòng lệch / lỗi, nhập số còn bán được (hàng lỗi bị loại không tính). Hệ thống điều chỉnh lô theo chênh lệch so với số hệ thống lúc đếm (đã tính hàng bán ra trong lúc chờ)." />
        <Table rowKey={(l, i) => i} size="small" pagination={false} dataSource={(review?.r.lines || []).map((l, i) => ({ ...l, idx: i })).filter(needs)}
          columns={[
            { title: 'Sản phẩm', dataIndex: 'name', render: (v, l) => <div>{v}{l.extra && <Tag color="purple" className="ml-1">ngoài danh sách</Tag>}<div className="text-xs text-gray-500">Lô {l.lot_no} • HSD {dayjs(l.expiry_date).format('DD/MM/YYYY')}</div></div> },
            { title: 'Hệ thống', dataIndex: 'system_qty', width: 80 },
            { title: 'NVBH đếm', dataIndex: 'counted_qty', width: 90 },
            { title: 'Lỗi', width: 140, render: (_, l) => (l.defect_qty ? `${l.defect_qty} (${CONDITIONS[l.condition]})` : '-') },
            { title: 'Số chốt', width: 110, render: (_, l) => <InputNumber size="small" min={0} precision={0} value={review.finals[l.idx]} onChange={(v) => setReview((x) => ({ ...x, finals: { ...x.finals, [l.idx]: v } }))} /> },
          ]} />
        <Input.TextArea className="mt-3" rows={2} maxLength={1000} placeholder="Kết quả đếm lại / nguyên nhân chênh lệch (bắt buộc)" value={review?.note} onChange={(e) => setReview((x) => ({ ...x, note: e.target.value }))} />
        <Checkbox className="mt-2" checked={review?.checked} onChange={(e) => setReview((x) => ({ ...x, checked: e.target.checked }))}>Tôi đã đếm lại thực tế các dòng chênh lệch</Checkbox>
      </Modal>
    </>
  );
}
