// Biên bản nhận hàng: quản lý kiểm tra thực tế các dòng lệch / lỗi rồi quyết định (nhận kho, trả NCC, hủy, giao bù, chốt thiếu).
// NVBH xem biên bản của mình.
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Input, InputNumber, Radio, Checkbox, Image, Alert, Select, Descriptions, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLiveRefresh } from '../Notifications';
import { API, auth, errMsg, role, isManagerRole, RECEIPT_STATUS, CONDITIONS } from './common';

const LineDetail = ({ l }) => (
  <div className="text-xs text-gray-600">
    Chờ nhận {l.expected_qty} • phiếu giao {l.delivered_qty ?? '-'} • đếm {l.counted_qty}{l.defect_qty ? ` • ${l.defect_qty} lỗi (${CONDITIONS[l.condition]})` : ''}
    {l.lot_no ? ` • Lô ${l.lot_no}` : ''}{l.manufacture_date ? ` • NSX ${dayjs(l.manufacture_date).format('DD/MM/YYYY')}` : ''}{l.expiry_date ? ` • HSD ${dayjs(l.expiry_date).format('DD/MM/YYYY')}` : ''}
    {l.note ? <div>Ghi chú NVBH: {l.note}</div> : null}
  </div>
);

export default function ReceiptsTab() {
  const manager = isManagerRole(role());
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(manager ? 'PENDING_REVIEW' : null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/purchasing/receipts`, { ...auth(), params: status ? { status } : {} }).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được biên bản'));
  useEffect(() => { load(); }, [status]);
  useLiveRefresh(['goods-receipts'], load);

  const openReview = (r) => setReview({
    r, checked: false, note: '', supplier_note: '',
    decisions: Object.fromEntries(r.lines.filter((l) => l.issues?.length).map((l) => [l.product_id, { accept_qty: Math.max(l.counted_qty - (l.defect_qty || 0), 0), reject_action: 'RETURN', shortage_action: 'BACKORDER', note: '' }])),
  });
  const setDec = (id, patch) => setReview((v) => ({ ...v, decisions: { ...v.decisions, [id]: { ...v.decisions[id], ...patch } } }));
  const submit = async () => {
    setBusy(true);
    try {
      const r = await axios.put(`${API}/purchasing/receipts/${review.r.id}/review`, {
        checked: review.checked, note: review.note, supplier_note: review.supplier_note,
        decisions: Object.entries(review.decisions).map(([product_id, d]) => ({ product_id, ...d })),
      }, auth());
      message.success(r.data.message); setReview(null); load();
    } catch (e) { message.error(errMsg(e, 'Không chốt được biên bản')); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Select allowClear placeholder="Lọc trạng thái" className="!w-60" value={status} onChange={setStatus} options={Object.entries(RECEIPT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
        expandable={{
          expandedRowRender: (r) => (
            <div>
              {r.lines.map((l) => (
                <div key={l.product_id} className="mb-2">
                  <b>{l.name}</b> {l.issues?.length ? <Tag color="red">{l.problem}</Tag> : <Tag color="green">Khớp</Tag>} {l.stocked_qty > 0 && <Tag color="blue">Đã nhập kho {l.stocked_qty}</Tag>}
                  <LineDetail l={l} />
                  {l.decision && <div className="text-xs text-blue-700">Quản lý: nhận {l.decision.accept_qty}{l.decision.rejected_qty ? `, ${l.decision.reject_action === 'RETURN' ? 'trả NCC' : 'hủy'} ${l.decision.rejected_qty}` : ''}{l.decision.shortage_qty ? `, thiếu ${l.decision.shortage_qty}: ${l.decision.shortage_action === 'BACKORDER' ? 'yêu cầu giao bù' : 'chốt thiếu'}` : ''}</div>}
                  {l.images?.length > 0 && <Image.PreviewGroup>{l.images.map((u) => <Image key={u} src={u} width={56} height={56} className="object-cover mr-1 rounded" />)}</Image.PreviewGroup>}
                </div>
              ))}
              {r.delivery_images?.length > 0 && <div className="mt-1 text-xs">Phiếu giao: <Image.PreviewGroup>{r.delivery_images.map((u) => <Image key={u} src={u} width={56} height={56} className="object-cover mr-1 rounded" />)}</Image.PreviewGroup></div>}
              {r.review_note && <div className="mt-1 text-sm">Kết quả kiểm tra của quản lý: {r.review_note}</div>}
            </div>
          ),
        }}
        columns={[
          { title: 'Biên bản', dataIndex: 'code', width: 150, render: (v, r) => <div><b>{v}</b><div className="text-xs text-gray-500">{dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}</div></div> },
          { title: 'Đơn / NCC', width: 200, render: (_, r) => <div>{r.po_code}<div className="text-xs text-gray-500">{r.supplier_name}</div></div> },
          { title: 'Người nhận', dataIndex: 'received_by_name', width: 150 },
          { title: 'Vấn đề', render: (_, r) => (r.lines.filter((l) => l.issues?.length).map((l) => <div key={l.product_id} className="text-sm">{l.name}: <span className="text-red-600">{l.problem}</span></div>)) },
          { title: 'Trạng thái', width: 190, render: (_, r) => <div><Tag color={RECEIPT_STATUS[r.status]?.color}>{RECEIPT_STATUS[r.status]?.label}</Tag>{r.reviewed_by_name && <div className="text-xs text-gray-500">{r.reviewed_by_name}</div>}</div> },
          ...(manager ? [{ title: '', width: 120, fixed: 'right', render: (_, r) => r.status === 'PENDING_REVIEW' && <Button size="small" type="primary" onClick={() => openReview(r)}>Kiểm tra</Button> }] : []),
        ]} />

      <Modal open={!!review} title={`Kiểm tra biên bản ${review?.r.code} (đơn ${review?.r.po_code})`} onCancel={() => setReview(null)} onOk={submit} confirmLoading={busy} cancelText="Đóng" okText="Chốt biên bản" width={900} destroyOnHidden>
        <Alert className="mb-3" type="warning" showIcon message="Kiểm tra thực tế hàng ở kho trước khi chốt. Số nhận kho được nhập theo lô NVBH đã ghi; phần còn lại trả nhà cung cấp hoặc hủy; phần thiếu yêu cầu giao bù hoặc chốt thiếu. Hệ thống gửi email cho nhà cung cấp." />
        {review && review.r.lines.filter((l) => l.issues?.length).map((l) => {
          const d = review.decisions[l.product_id];
          const rejected = l.counted_qty - (d.accept_qty || 0);
          const short = Math.max(l.expected_qty - (d.accept_qty || 0), 0);
          return (
            <div key={l.product_id} className="border rounded p-3 mb-3">
              <div><b>{l.name}</b> <Tag color="red">{l.problem}</Tag></div>
              <LineDetail l={l} />
              {l.images?.length > 0 && <Image.PreviewGroup>{l.images.map((u) => <Image key={u} src={u} width={64} height={64} className="object-cover mr-1 rounded" />)}</Image.PreviewGroup>}
              <Descriptions size="small" column={1} className="mt-2">
                <Descriptions.Item label="Nhận vào kho">
                  <InputNumber min={0} max={l.counted_qty} precision={0} value={d.accept_qty} onChange={(v) => setDec(l.product_id, { accept_qty: v ?? 0 })} /> <span className="text-xs text-gray-500 ml-2">tối đa {l.counted_qty} (số đếm được)</span>
                </Descriptions.Item>
                {rejected > 0 && (
                  <Descriptions.Item label={`${rejected} không nhận`}>
                    <Radio.Group value={d.reject_action} onChange={(e) => setDec(l.product_id, { reject_action: e.target.value })}><Radio value="RETURN">Trả nhà cung cấp</Radio><Radio value="DISPOSE">Hủy</Radio></Radio.Group>
                  </Descriptions.Item>
                )}
                {short > 0 && (
                  <Descriptions.Item label={`Thiếu ${short}`}>
                    <Radio.Group value={d.shortage_action} onChange={(e) => setDec(l.product_id, { shortage_action: e.target.value })}><Radio value="BACKORDER">Yêu cầu giao bù</Radio><Radio value="CLOSE">Chốt thiếu, không cần giao thêm</Radio></Radio.Group>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>
          );
        })}
        <Input.TextArea rows={2} maxLength={1000} placeholder="Kết quả kiểm tra thực tế (bắt buộc), vd: đếm lại đủ 7 hộp, 1 hộp móp nặng" value={review?.note} onChange={(e) => setReview((v) => ({ ...v, note: e.target.value }))} />
        <Input.TextArea className="mt-2" rows={2} maxLength={500} placeholder="Ghi chú gửi nhà cung cấp (không bắt buộc)" value={review?.supplier_note} onChange={(e) => setReview((v) => ({ ...v, supplier_note: e.target.value }))} />
        <Checkbox className="mt-2" checked={review?.checked} onChange={(e) => setReview((v) => ({ ...v, checked: e.target.checked }))}>Tôi đã kiểm tra thực tế hàng hóa của biên bản này</Checkbox>
      </Modal>
    </>
  );
}
