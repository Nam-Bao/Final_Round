// Đề xuất nhập hàng: quản lý duyệt / từ chối và tạo đơn đặt hàng gửi nhà cung cấp; NVBH / KTV tạo đề xuất và xem đề xuất của mình
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Input, InputNumber, Select, DatePicker, Space, Alert, message } from 'antd';
import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLiveRefresh } from '../Notifications';
import { API, auth, vnd, role, isManagerRole, errMsg } from './common';

const statusTag = (r) => {
  if (r.status === 'APPROVED' && r.received_at) return <Tag color="green">Đã nhập kho</Tag>;
  if (r.status === 'APPROVED' && r.ordered_at) return <Tag color="cyan">Đã đặt hàng, chờ hàng về</Tag>;
  return <Tag color={{ PENDING: 'gold', APPROVED: 'blue', REJECTED: 'red' }[r.status]}>{{ PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt, chưa đặt hàng', REJECTED: 'Từ chối' }[r.status]}</Tag>;
};

// productType: 'PRODUCT' (NVBH, trang Nhập hàng) | 'MATERIAL' (trang Vật tư) | null (quản lý: tất cả)
export default function RequestsTab({ productType = null }) {
  const myRole = role();
  const manager = isManagerRole(myRole);
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [deciding, setDeciding] = useState(null);
  const [ordering, setOrdering] = useState(null);
  const [creating, setCreating] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => axios.get(`${API}/materials/purchase-requests`, auth()).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được đề xuất'));
  useEffect(() => { load(); }, []);
  useLiveRefresh(['purchase-requests', 'purchase-orders'], load);

  const openCreate = async () => {
    try {
      // NVBH: danh sách mỹ phẩm (API sản phẩm công khai cho nhân viên); quản lý: cả vật tư
      const r = manager ? await axios.get(`${API}/products/admin`, auth()) : await axios.get(`${API}/products`, auth());
      setProducts((r.data.data || []).filter((p) => (manager ? (!productType || p.type === productType) : p.type !== 'MATERIAL')));
      setCreating({ reason: '', items: [{ product_id: null, packs: 1 }] });
    } catch (e) { message.error(errMsg(e, 'Không tải được danh sách sản phẩm')); }
  };
  const submitCreate = async () => {
    const items = creating.items.filter((i) => i.product_id);
    if (!items.length) { message.warning('Chọn sản phẩm cần nhập'); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/materials/purchase-requests`, { reason: creating.reason, items }, auth());
      message.success('Đã gửi đề xuất nhập hàng cho quản lý');
      setCreating(null); load();
    } catch (e) { message.error(errMsg(e, 'Không tạo được đề xuất')); } finally { setBusy(false); }
  };

  const submitDecision = async () => {
    const { row, decision, note, packs } = deciding;
    if (decision === 'REJECT' && !note.trim()) { message.warning('Cần ghi lý do từ chối'); return; }
    setBusy(true);
    try {
      await axios.put(`${API}/materials/purchase-requests/${row.id}/decision`, {
        decision, note, items: decision === 'APPROVE' ? Object.entries(packs).map(([product_id, n]) => ({ product_id, packs: n })) : undefined,
      }, auth());
      message.success(decision === 'APPROVE' ? 'Đã duyệt, bấm "Đặt hàng" để gửi nhà cung cấp' : 'Đã từ chối đề xuất');
      setDeciding(null); load();
    } catch (e) { message.error(errMsg(e, 'Không xử lý được')); } finally { setBusy(false); }
  };

  const openOrder = async (row) => {
    try {
      const r = await axios.get(`${API}/purchasing/suppliers`, auth());
      setSuppliers(r.data.data || []);
      setOrdering({ row, supplier_id: null, expected_date: null, note: '', costs: {} });
    } catch (e) { message.error(errMsg(e, 'Không tải được nhà cung cấp')); }
  };
  const submitOrder = async () => {
    if (!ordering.supplier_id) { message.warning('Chọn nhà cung cấp'); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API}/purchasing/orders`, {
        request_id: ordering.row.id, supplier_id: ordering.supplier_id, note: ordering.note,
        expected_date: ordering.expected_date ? ordering.expected_date.format('YYYY-MM-DD') : null,
        items: (ordering.row.items || []).map((i) => ({ product_id: i.product_id, unit_cost: ordering.costs[i.product_id] ?? null })),
      }, auth());
      (r.data.email_status === 'SENT' ? message.success : message.warning)(r.data.message);
      setOrdering(null); load();
    } catch (e) { message.error(errMsg(e, 'Không tạo được đơn đặt hàng')); } finally { setBusy(false); }
  };
  const total = ordering ? (ordering.row.items || []).reduce((s, i) => s + (Number(ordering.costs[i.product_id]) || 0) * Number(i.quantity), 0) : 0;

  return (
    <>
      <Alert className="mb-3" type="info" showIcon
        message={manager
          ? 'Đề xuất (tự động khi dưới tồn tối thiểu, hoặc do NVBH / KTV / quản lý tạo) → Duyệt (không tự duyệt đề xuất của mình) → Đặt hàng: chọn nhà cung cấp, hệ thống gửi email + PDF đơn đặt hàng → NVBH nhận hàng ở tab Nhận hàng.'
          : 'Thấy hàng sắp hết thì tạo đề xuất nhập. Quản lý duyệt và đặt hàng nhà cung cấp; khi hàng về, bạn nhận hàng ở tab Nhận hàng.'} />
      <div className="flex justify-end mb-3"><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo đề xuất nhập</Button></div>
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
        columns={[
          { title: 'Ngày tạo', dataIndex: 'createdAt', width: 130, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
          { title: 'Người đề xuất', dataIndex: 'requester_name', width: 170, render: (v, r) => <div>{v || '-'}<div className="text-xs text-gray-500">{r.reason}</div></div> },
          { title: 'Cần nhập', render: (_, r) => (r.items || []).map((i) => <div key={i.product_id}>{i.name}: <b>{i.packs} × {i.pack_label || 'quy cách'}</b> ({i.quantity} {i.unit}; tồn lúc đề xuất {i.stock})</div>) },
          {
            title: 'Trạng thái', width: 220,
            render: (_, r) => (
              <div>
                {statusTag(r)}
                {r.decided_at && <div className="text-xs text-gray-500 mt-1">{r.status === 'REJECTED' ? 'Từ chối' : 'Duyệt'} {r.approver_name ? `bởi ${r.approver_name} ` : ''}lúc {dayjs(r.decided_at).format('HH:mm DD/MM')}{r.decision_note ? `: ${r.decision_note}` : ''}</div>}
                {r.ordered_at && <div className="text-xs text-gray-500">Đặt của {r.supplier}{r.expected_date ? `, dự kiến ${dayjs(r.expected_date).format('DD/MM')}` : ''}</div>}
              </div>
            ),
          },
          ...(manager ? [{
            title: '', width: 170, fixed: 'right',
            render: (_, r) => (
              <Space wrap>
                {r.status === 'PENDING' && (
                  <>
                    <Button size="small" type="primary" onClick={() => setDeciding({ row: r, decision: 'APPROVE', note: '', packs: Object.fromEntries((r.items || []).map((i) => [i.product_id, i.packs])) })}>Duyệt</Button>
                    <Button size="small" danger onClick={() => setDeciding({ row: r, decision: 'REJECT', note: '', packs: {} })}>Từ chối</Button>
                  </>
                )}
                {r.status === 'APPROVED' && !r.ordered_at && !r.received_at && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => openOrder(r)}>Đặt hàng</Button>}
              </Space>
            ),
          }] : []),
        ]} />

      <Modal open={!!creating} title="Tạo đề xuất nhập hàng" onCancel={() => setCreating(null)} onOk={submitCreate} confirmLoading={busy} cancelText="Đóng" okText="Gửi đề xuất" width={640} destroyOnHidden>
        {(creating?.items || []).map((it, k) => (
          <div key={k} className="flex gap-2 mb-2">
            <Select showSearch optionFilterProp="label" className="flex-1" placeholder="Chọn sản phẩm" value={it.product_id}
              options={products.map((p) => ({ value: p.id, label: `${p.name} (còn ${p.stock_quantity})` }))}
              onChange={(v) => setCreating((c) => ({ ...c, items: c.items.map((x, i) => (i === k ? { ...x, product_id: v } : x)) }))} />
            <InputNumber min={1} max={10000} precision={0} value={it.packs} addonAfter="quy cách" className="!w-40"
              onChange={(v) => setCreating((c) => ({ ...c, items: c.items.map((x, i) => (i === k ? { ...x, packs: v || 1 } : x)) }))} />
          </div>
        ))}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setCreating((c) => ({ ...c, items: [...c.items, { product_id: null, packs: 1 }] }))}>Thêm sản phẩm</Button>
        <Input.TextArea className="mt-3" rows={2} maxLength={255} placeholder="Lý do, vd: Khách hỏi nhiều, còn 3 hộp" value={creating?.reason} onChange={(e) => setCreating((c) => ({ ...c, reason: e.target.value }))} />
      </Modal>

      <Modal open={!!deciding} title={deciding?.decision === 'APPROVE' ? 'Duyệt đề xuất nhập hàng' : 'Từ chối đề xuất nhập hàng'}
        onCancel={() => setDeciding(null)} onOk={submitDecision} confirmLoading={busy} cancelText="Đóng" okText={deciding?.decision === 'APPROVE' ? 'Duyệt' : 'Từ chối'}
        okButtonProps={{ danger: deciding?.decision === 'REJECT' }} destroyOnHidden>
        {deciding?.decision === 'APPROVE' && (deciding.row.items || []).map((i) => (
          <div key={i.product_id} className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm">{i.name}</span>
            <InputNumber min={1} max={10000} precision={0} value={deciding.packs[i.product_id]} suffix={i.pack_label || 'quy cách'} className="!w-48"
              onChange={(v) => setDeciding((d) => ({ ...d, packs: { ...d.packs, [i.product_id]: v || 1 } }))} />
          </div>
        ))}
        <Input.TextArea className="mt-2" rows={3} maxLength={1000} value={deciding?.note}
          placeholder={deciding?.decision === 'APPROVE' ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối (bắt buộc)'}
          onChange={(e) => setDeciding((d) => ({ ...d, note: e.target.value }))} />
      </Modal>

      <Modal open={!!ordering} title="Tạo đơn đặt hàng gửi nhà cung cấp" onCancel={() => setOrdering(null)} onOk={submitOrder} confirmLoading={busy} cancelText="Đóng" okText="Tạo đơn và gửi email" width={760} destroyOnHidden>
        {suppliers.length === 0 && <Alert className="mb-3" type="warning" showIcon message="Chưa có nhà cung cấp. Thêm ở tab Nhà cung cấp trước." />}
        <Select className="w-full mb-3" placeholder="Nhà cung cấp" value={ordering?.supplier_id} showSearch optionFilterProp="label"
          options={suppliers.map((s) => ({ value: s.id, label: `${s.name} - ${s.email}` }))} onChange={(v) => setOrdering((o) => ({ ...o, supplier_id: v }))} />
        <Table rowKey="product_id" size="small" pagination={false} dataSource={ordering?.row.items || []}
          columns={[
            { title: 'Sản phẩm', dataIndex: 'name' },
            { title: 'Số lượng', width: 120, render: (_, i) => `${i.quantity} ${i.unit}` },
            { title: 'Đơn giá dự kiến', width: 170, render: (_, i) => <InputNumber size="small" min={0} precision={0} step={1000} className="!w-full" placeholder="Theo báo giá" value={ordering.costs[i.product_id]} onChange={(v) => setOrdering((o) => ({ ...o, costs: { ...o.costs, [i.product_id]: v } }))} /> },
            { title: 'Thành tiền', width: 120, render: (_, i) => (ordering.costs[i.product_id] != null ? vnd(ordering.costs[i.product_id] * i.quantity) : '-') },
          ]} />
        <div className="text-right mt-2">Tổng dự kiến: <b>{vnd(total)}</b></div>
        <DatePicker className="w-full mt-3" format="DD/MM/YYYY" placeholder="Ngày giao mong muốn (không bắt buộc)" disabledDate={(d) => d.isBefore(dayjs(), 'day')}
          value={ordering?.expected_date} onChange={(v) => setOrdering((o) => ({ ...o, expected_date: v }))} />
        <Input.TextArea className="mt-3" rows={2} maxLength={1000} placeholder="Ghi chú gửi nhà cung cấp (không bắt buộc), vd: giao giờ hành chính" value={ordering?.note} onChange={(e) => setOrdering((o) => ({ ...o, note: e.target.value }))} />
      </Modal>
    </>
  );
}
