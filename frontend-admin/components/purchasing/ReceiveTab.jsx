// NVBH nhận hàng theo đơn đặt hàng: kiểm từng dòng (số lượng, số lô, NSX, HSD, tình trạng, nhãn, số công bố, ảnh)
// => Biên bản nhận hàng. Khớp: nhập kho ngay; lệch / lỗi: dòng đó chờ quản lý kiểm tra thực tế.
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Input, InputNumber, Select, DatePicker, Checkbox, Upload, Alert, Space, Card, message } from 'antd';
import { InboxOutlined, CameraOutlined, FilePdfOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLiveRefresh } from '../Notifications';
import { API, auth, errMsg, PO_STATUS, CONDITION_OPTIONS, uploadImage } from './common';
import { openPoPdf } from './OrdersTab';

const MIN_SHELF_MONTHS = 6;

// Ô tải ảnh (lưu URL Cloudinary)
export function PhotoInput({ value = [], onChange, max = 6 }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {value.map((u) => (
        <div key={u} className="relative">
          <img src={u} alt="" className="w-12 h-12 object-cover rounded border" />
          <button type="button" className="absolute -top-1 -right-1 bg-white rounded-full text-xs px-1 border" onClick={() => onChange(value.filter((x) => x !== u))}>×</button>
        </div>
      ))}
      {value.length < max && (
        <Upload accept="image/*" showUploadList={false} beforeUpload={async (file) => {
          setLoading(true);
          try { onChange([...value, await uploadImage(file)]); } catch { message.error('Không tải được ảnh'); } finally { setLoading(false); }
          return false;
        }}>
          <Button size="small" icon={<CameraOutlined />} loading={loading}>Ảnh</Button>
        </Upload>
      )}
    </div>
  );
}

// Các vấn đề sẽ báo quản lý (tính giống server để NVBH thấy trước khi gửi)
const issuesOf = (l) => {
  const out = [];
  if (l.counted_qty < l.expected) out.push(`Thiếu ${l.expected - l.counted_qty}`);
  if (l.counted_qty > l.expected) out.push(`Thừa ${l.counted_qty - l.expected}`);
  if (l.delivered_qty != null && l.delivered_qty !== l.counted_qty) out.push('Khác phiếu giao');
  if (l.defect_qty > 0) out.push(`${l.defect_qty} lỗi`);
  if (l.counted_qty > 0 && !l.label_ok) out.push('Nhãn');
  if (l.counted_qty > 0 && l.type === 'PRODUCT' && !l.registration_ok) out.push('Số công bố');
  if (l.counted_qty > 0 && l.expiry_date && l.expiry_date.isBefore(dayjs().add(MIN_SHELF_MONTHS, 'month'))) out.push(`HSD < ${MIN_SHELF_MONTHS} tháng`);
  return out;
};

export default function ReceiveTab() {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/purchasing/orders`, { ...auth(), params: { status: 'SENT,PARTIAL' } }).then((r) => setOrders((r.data.data || []).filter((o) => ['SENT', 'PARTIAL'].includes(o.status)))).catch(() => message.error('Không tải được đơn chờ nhận'));
  useEffect(() => { load(); }, []);
  useLiveRefresh(['purchase-orders', 'goods-receipts'], load);

  const open = (po) => setForm({
    po, note: '', delivery_images: [],
    lines: po.items.filter((i) => i.remaining > 0).map((i) => ({
      product_id: i.product_id, name: i.name, type: i.type, unit: i.unit, registration_no: i.registration_no, expected: i.remaining,
      delivered_qty: i.remaining, counted_qty: i.remaining, defect_qty: 0, condition: 'OK', lot_no: '', manufacture_date: null, expiry_date: null,
      label_ok: true, registration_ok: true, images: [], note: '',
    })),
  });
  const upd = (id, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.product_id === id ? { ...l, ...patch } : l)) }));

  const submit = async () => {
    setBusy(true);
    try {
      const r = await axios.post(`${API}/purchasing/orders/${form.po.id}/receipts`, {
        note: form.note, delivery_images: form.delivery_images,
        lines: form.lines.map((l) => ({ ...l, manufacture_date: l.manufacture_date?.format('YYYY-MM-DD') || null, expiry_date: l.expiry_date?.format('YYYY-MM-DD') || null })),
      }, auth());
      (r.data.data.status === 'MATCHED' ? message.success : message.warning)(r.data.message, 6);
      setForm(null); load();
    } catch (e) { message.error(errMsg(e, 'Không lập được biên bản')); } finally { setBusy(false); }
  };
  const issueCount = (form?.lines || []).filter((l) => issuesOf(l).length).length;

  return (
    <>
      <Alert className="mb-3" type="info" showIcon message="Khi hàng về: đếm từng sản phẩm, ghi số lô, ngày sản xuất, hạn sử dụng in trên bao bì, kiểm tình trạng và nhãn. Dòng khớp được nhập kho ngay; dòng lệch hoặc lỗi để riêng, quản lý sẽ kiểm tra thực tế." />
      <Table rowKey="id" dataSource={orders} size="middle" pagination={false} locale={{ emptyText: 'Không có đơn đặt hàng nào đang chờ hàng về' }}
        columns={[
          { title: 'Đơn', dataIndex: 'code', width: 150, render: (v, r) => <div><b>{v}</b><div className="text-xs text-gray-500">{r.supplier?.name}</div></div> },
          { title: 'Còn chờ nhận', render: (_, r) => r.items.filter((i) => i.remaining > 0).map((i) => <div key={i.product_id}>{i.name}: <b>{i.remaining}</b> {i.unit}</div>) },
          { title: 'Trạng thái', width: 200, render: (_, r) => <div><Tag color={PO_STATUS[r.status]?.color}>{PO_STATUS[r.status]?.label}</Tag>{r.has_pending_review && <div className="text-xs text-red-600 mt-1">Biên bản trước đang chờ quản lý</div>}{r.expected_date && <div className="text-xs text-gray-500">Dự kiến {dayjs(r.expected_date).format('DD/MM/YYYY')}</div>}</div> },
          {
            title: '', width: 190, render: (_, r) => (
              <Space>
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => openPoPdf(r)}>Đơn</Button>
                <Button size="small" type="primary" icon={<InboxOutlined />} disabled={r.has_pending_review} onClick={() => open(r)}>Nhận hàng</Button>
              </Space>
            ),
          },
        ]} />

      <Modal open={!!form} title={`Nhận hàng đơn ${form?.po.code} - ${form?.po.supplier?.name || ''}`} onCancel={() => setForm(null)} onOk={submit} confirmLoading={busy}
        cancelText="Đóng" okText={issueCount ? `Gửi biên bản (${issueCount} dòng cần quản lý kiểm tra)` : 'Gửi biên bản và nhập kho'} width={1000} destroyOnHidden>
        {(form?.lines || []).map((l) => {
          const issues = issuesOf(l);
          return (
            <Card key={l.product_id} size="small" className="!mb-3" title={<span>{l.name} <span className="text-gray-500 font-normal">• chờ nhận {l.expected} {l.unit}</span></span>}
              extra={issues.length ? issues.map((x) => <Tag key={x} color="red">{x}</Tag>) : <Tag color="green">Khớp</Tag>}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <label>Số trên phiếu giao<InputNumber className="!w-full" min={0} precision={0} value={l.delivered_qty} onChange={(v) => upd(l.product_id, { delivered_qty: v })} /></label>
                <label>Số đếm thực tế<InputNumber className="!w-full" min={0} precision={0} value={l.counted_qty} onChange={(v) => upd(l.product_id, { counted_qty: v ?? 0 })} /></label>
                <label>Tình trạng<Select className="w-full" value={l.condition} options={CONDITION_OPTIONS} onChange={(v) => upd(l.product_id, { condition: v, defect_qty: v === 'OK' ? 0 : Math.max(l.defect_qty, 1) })} /></label>
                <label>Số bị lỗi<InputNumber className="!w-full" min={0} max={l.counted_qty} precision={0} value={l.defect_qty} disabled={l.condition === 'OK'} onChange={(v) => upd(l.product_id, { defect_qty: v ?? 0 })} /></label>
                <label>Số lô<Input maxLength={50} value={l.lot_no} onChange={(e) => upd(l.product_id, { lot_no: e.target.value })} /></label>
                <label>Ngày sản xuất{l.type === 'PRODUCT' ? ' *' : ''}<DatePicker className="w-full" format="DD/MM/YYYY" value={l.manufacture_date} disabledDate={(d) => d.isAfter(dayjs(), 'day')} onChange={(v) => upd(l.product_id, { manufacture_date: v })} /></label>
                <label>Hạn sử dụng *<DatePicker className="w-full" format="DD/MM/YYYY" value={l.expiry_date} onChange={(v) => upd(l.product_id, { expiry_date: v })} /></label>
                <div className="flex flex-col gap-1 pt-4">
                  <Checkbox checked={l.label_ok} onChange={(e) => upd(l.product_id, { label_ok: e.target.checked })}>Nhãn phụ tiếng Việt đúng</Checkbox>
                  {l.type === 'PRODUCT' && <Checkbox checked={l.registration_ok} onChange={(e) => upd(l.product_id, { registration_ok: e.target.checked })}>Số công bố khớp{l.registration_no ? ` (${l.registration_no})` : ''}</Checkbox>}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-center mt-2">
                <PhotoInput value={l.images} onChange={(v) => upd(l.product_id, { images: v })} />
                <Input className="flex-1 min-w-[240px]" maxLength={500} placeholder={issues.length ? 'Ghi chú chênh lệch / lỗi (bắt buộc)' : 'Ghi chú (không bắt buộc)'} value={l.note} onChange={(e) => upd(l.product_id, { note: e.target.value })} />
              </div>
            </Card>
          );
        })}
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm">Ảnh phiếu giao / hóa đơn:</span>
          <PhotoInput value={form?.delivery_images || []} onChange={(v) => setForm((f) => ({ ...f, delivery_images: v }))} />
          <Input className="flex-1 min-w-[240px]" maxLength={1000} placeholder="Ghi chú chung (không bắt buộc)" value={form?.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </Modal>
    </>
  );
}
