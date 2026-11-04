import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Table, Tag, Button, Modal, Form, Input, InputNumber, Select, Alert, DatePicker, Space, Tooltip, message, Statistic, Card, Row, Col } from 'antd';
import { EditOutlined, ShoppingCartOutlined, ReloadOutlined, LinkOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';

const API = 'http://localhost:4000/api';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

const STATUS = {
  OUT: { color: 'red', label: 'Hết hàng' },
  LOW: { color: 'volcano', label: 'Dưới tồn tối thiểu' },
  SHORT: { color: 'orange', label: 'Không đủ cho lịch 14 ngày' },
  OK: { color: 'green', label: 'Đủ dùng' },
};

// ---------------- Tab 1: Tồn kho vật tư + cảnh báo sớm ----------------
function StockTab({ materials, demandAvailable, reload }) {
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const alerts = materials.filter((m) => m.status !== 'OK');

  const openEdit = (m) => { setEditing(m); form.setFieldsValue(m); };
  const saveSpec = async () => {
    const values = await form.validateFields();
    try {
      await axios.put(`${API}/commerce/materials/${editing.id}/spec`, values, authConfig());
      message.success('Đã lưu thông tin vật tư');
      setEditing(null);
      reload();
    } catch (e) { message.error(e.response?.data?.message || 'Không lưu được'); }
  };
  const requestPurchase = async (m) => {
    try {
      await axios.post(`${API}/commerce/materials/purchase-requests`, {
        reason: `${STATUS[m.status].label}: ${m.name}`, items: [{ product_id: m.id, packs: Math.max(1, m.suggested_packs) }],
      }, authConfig());
      message.success('Đã tạo đề xuất nhập hàng');
      reload();
    } catch (e) { message.error(e.response?.data?.message || 'Không tạo được đề xuất'); }
  };

  return (
    <>
      {!demandAvailable && <Alert className="mb-3" type="warning" showIcon message="Không lấy được lịch hẹn sắp tới nên chưa dự báo được nhu cầu 14 ngày." />}
      {alerts.length > 0 ? (
        <Alert className="mb-3" type="error" showIcon
          message={`${alerts.length} vật tư cần nhập hàng`}
          description={alerts.map((m) => `${m.name}: còn ${m.stock} ${m.unit} (${STATUS[m.status].label}${m.purchase_pending ? ', đã có đề xuất chờ duyệt' : ''})`).join(' • ')} />
      ) : <Alert className="mb-3" type="success" showIcon message="Tất cả vật tư đủ dùng cho lịch hẹn 14 ngày tới và trên mức tồn tối thiểu." />}
      <Table rowKey="id" dataSource={materials} pagination={false} size="middle" scroll={{ x: 1200 }}
        columns={[
          { title: 'Vật tư', dataIndex: 'name', width: 260, render: (v, m) => <div><b>{v}</b><div className="text-xs text-gray-500">Quy cách: {m.pack_label || '-'} • Giá: {vnd(m.price)}</div></div> },
          { title: 'Tồn kho', width: 130, render: (_, m) => <div><b>{m.stock}</b> {m.unit}<div className="text-xs text-gray-500">≈ {(m.stock / (m.pack_size || 1)).toFixed(1)} quy cách</div></div> },
          { title: 'Tồn tối thiểu', dataIndex: 'min_stock', width: 110, render: (v, m) => `${v} ${m.unit}` },
          { title: 'Cần cho lịch 14 ngày', dataIndex: 'demand_14d', width: 120, render: (v, m) => `${v} ${m.unit}` },
          { title: 'Dùng TB / ngày', dataIndex: 'avg_daily', width: 110, render: (v, m) => (v ? `${v} ${m.unit}` : '-') },
          { title: 'Đủ dùng', dataIndex: 'days_left', width: 90, render: (v) => (v === null ? '-' : `~${v} ngày`) },
          { title: 'Trạng thái', width: 170, render: (_, m) => <Space orientation="vertical" size={2}><Tag color={STATUS[m.status].color}>{STATUS[m.status].label}</Tag>{m.purchase_pending && <Tag color="blue">Đã đề xuất nhập</Tag>}</Space> },
          {
            title: 'Nguồn gốc', width: 280,
            render: (_, m) => (
              <div className="text-xs">
                <div>Xuất xứ: {m.origin || '-'}</div>
                <div>Sản xuất / nhập khẩu: {m.manufacturer || '-'}</div>
                <div>Mua tại: {m.supplier || '-'}</div>
                {m.registration_no && <div>Số công bố / lưu hành: {m.registration_no}</div>}
                {m.source_url && <a href={m.source_url} target="_blank" rel="noopener noreferrer"><LinkOutlined /> Trang sản phẩm</a>}
              </div>
            ),
          },
          {
            title: '', fixed: 'right', width: 150,
            render: (_, m) => (
              <Space orientation="vertical" size={4}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(m)}>Thông tin</Button>
                {m.status !== 'OK' && !m.purchase_pending && (
                  <Button size="small" type="primary" danger icon={<ShoppingCartOutlined />} onClick={() => requestPurchase(m)}>
                    Đề xuất nhập {m.suggested_packs > 0 ? `${m.suggested_packs}` : ''}
                  </Button>
                )}
              </Space>
            ),
          },
        ]} />

      <Modal title={editing ? `Thông tin vật tư: ${editing.name}` : ''} open={!!editing} onCancel={() => setEditing(null)} onOk={saveSpec} okText="Lưu" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={8}><Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true }]}><Input maxLength={20} placeholder="ml, g, chiếc" /></Form.Item></Col>
            <Col span={8}><Form.Item name="pack_size" label="Số đơn vị / quy cách" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="!w-full" /></Form.Item></Col>
            <Col span={8}><Form.Item name="min_stock" label="Tồn tối thiểu" extra="Xuống mức này sẽ tự đề xuất nhập" rules={[{ required: true }]}><InputNumber min={0} precision={0} className="!w-full" /></Form.Item></Col>
          </Row>
          <Form.Item name="pack_label" label="Quy cách nhập"><Input maxLength={60} placeholder="Hộp 100 chiếc" /></Form.Item>
          <Form.Item name="origin" label="Xuất xứ"><Input maxLength={100} /></Form.Item>
          <Form.Item name="manufacturer" label="Nhà sản xuất / nhập khẩu"><Input maxLength={200} /></Form.Item>
          <Form.Item name="supplier" label="Công ty cung cấp (nơi mua)"><Input maxLength={200} /></Form.Item>
          <Form.Item name="registration_no" label="Số công bố / số lưu hành"><Input maxLength={100} /></Form.Item>
          <Form.Item name="source_url" label="Link trang sản phẩm (nguồn thông tin)"><Input maxLength={500} placeholder="https://..." /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---------------- Tab 2: Định mức theo dịch vụ / gói ----------------
function NormsTab({ materials }) {
  const [targets, setTargets] = useState([]);
  const [norms, setNorms] = useState({});
  const [editing, setEditing] = useState(null); // { target, items }

  const load = async () => {
    try {
      const [svc, pkg, all] = await Promise.all([
        axios.get(`${API}/booking/spa-services`),
        axios.get(`${API}/booking/packages`),
        axios.get(`${API}/commerce/materials/norms/all`, authConfig()),
      ]);
      setTargets([
        ...(svc.data.data || []).map((s) => ({ key: `SERVICE:${s.id}`, target_type: 'SERVICE', target_id: s.id, name: s.name, group: 'Dịch vụ lẻ' })),
        ...(pkg.data.data || []).map((g) => ({ key: `PACKAGE:${g.id}`, target_type: 'PACKAGE', target_id: g.id, name: g.name, group: 'Gói liệu trình (mỗi buổi)' })),
      ]);
      setNorms(Object.fromEntries((all.data.data || []).map((n) => [`${n.target_type}:${n.target_id}`, n.items])));
    } catch (e) { message.error('Không tải được định mức'); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const items = editing.items.filter((i) => i.product_id && i.quantity > 0);
    try {
      await axios.put(`${API}/commerce/materials/norms`, {
        target_type: editing.target.target_type, target_id: editing.target.target_id, target_name: editing.target.name,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
      }, authConfig());
      message.success('Đã lưu định mức');
      setEditing(null);
      load();
    } catch (e) { message.error(e.response?.data?.message || 'Không lưu được'); }
  };
  const unitOf = (id) => materials.find((m) => m.id === id)?.unit || '';

  return (
    <>
      <Table rowKey="key" dataSource={targets} pagination={false} size="middle"
        columns={[
          { title: 'Dịch vụ / Gói', dataIndex: 'name', render: (v, t) => <div><b>{v}</b><div className="text-xs text-gray-500">{t.group}</div></div> },
          {
            title: 'Định mức vật tư cho 1 buổi',
            render: (_, t) => (norms[t.key]?.length
              ? <div className="flex flex-wrap gap-1">{norms[t.key].map((i) => <Tag key={i.product_id}>{i.name}: <b>{i.quantity} {i.unit}</b></Tag>)}</div>
              : <span className="text-gray-400">Chưa có định mức</span>),
          },
          { title: '', width: 110, render: (_, t) => <Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ target: t, items: (norms[t.key] || []).map((i) => ({ ...i })) })}>Sửa</Button> },
        ]} />
      <Modal title={editing ? `Định mức 1 buổi: ${editing.target.name}` : ''} open={!!editing} onCancel={() => setEditing(null)} onOk={save} okText="Lưu" width={640} destroyOnHidden>
        {editing && (
          <>
            {editing.items.map((it, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <Select className="flex-1" showSearch optionFilterProp="label" value={it.product_id} placeholder="Chọn vật tư"
                  options={materials.map((m) => ({ value: m.id, label: m.name, disabled: editing.items.some((x, j) => j !== idx && x.product_id === m.id) }))}
                  onChange={(v) => setEditing((e) => ({ ...e, items: e.items.map((x, j) => (j === idx ? { ...x, product_id: v } : x)) }))} />
                <InputNumber min={1} max={10000} precision={0} value={it.quantity} suffix={unitOf(it.product_id)} className="!w-36"
                  onChange={(v) => setEditing((e) => ({ ...e, items: e.items.map((x, j) => (j === idx ? { ...x, quantity: v } : x)) }))} />
                <Button danger type="text" icon={<DeleteOutlined />} onClick={() => setEditing((e) => ({ ...e, items: e.items.filter((_, j) => j !== idx) }))} />
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => setEditing((e) => ({ ...e, items: [...e.items, { product_id: undefined, quantity: 1 }] }))}>Thêm vật tư</Button>
          </>
        )}
      </Modal>
    </>
  );
}

// ---------------- Tab 3: Lịch sử xuất + thống kê thực dùng so với định mức ----------------
function UsageTab() {
  const [range, setRange] = useState([dayjs().subtract(30, 'day'), dayjs()]);
  const [data, setData] = useState({ data: [], summary: [] });
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/commerce/materials/usage`, { ...authConfig(), params: { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } });
      setData(res.data);
    } catch (e) { message.error(e.response?.data?.message || 'Không tải được lịch sử'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [range]);
  const over = data.data.filter((r) => r.over_norm).length;

  return (
    <>
      <Space className="mb-3"><DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v)} format="DD/MM/YYYY" allowClear={false} /><Button icon={<ReloadOutlined />} onClick={load} /></Space>
      <Row gutter={12} className="mb-3">
        <Col span={8}><Card size="small"><Statistic title="Số buổi có xuất vật tư" value={data.data.length} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Buổi dùng vượt định mức" value={over} styles={{ content: { color: over ? "#d4380d" : undefined } }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Buổi thiếu vật tư trong kho" value={data.data.filter((r) => r.shortage).length} /></Card></Col>
      </Row>
      <h4 className="font-semibold mb-2">Thống kê theo vật tư</h4>
      <Table rowKey="product_id" dataSource={data.summary} pagination={false} size="small" loading={loading} className="mb-6"
        columns={[
          { title: 'Vật tư', dataIndex: 'name' },
          { title: 'Thực dùng', render: (_, s) => <b>{s.used} {s.unit}</b> },
          { title: 'Theo định mức', render: (_, s) => `${s.norm_total} ${s.unit}` },
          { title: 'Chênh lệch', render: (_, s) => { const d = s.used - s.norm_total; return <span className={d > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}>{d > 0 ? '+' : ''}{d} {s.unit}</span>; } },
          { title: 'Số buổi', dataIndex: 'sessions' },
          { title: 'Buổi vượt ĐM', dataIndex: 'over_sessions', render: (v) => (v ? <Tag color="orange">{v}</Tag> : 0) },
          { title: 'Thiếu kho', render: (_, s) => (s.shortage ? <Tag color="red">{s.shortage} {s.unit}</Tag> : '-') },
        ]} />
      <h4 className="font-semibold mb-2">Phiếu xuất theo buổi</h4>
      <Table rowKey="id" dataSource={data.data} size="small" loading={loading} pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Thời gian', dataIndex: 'createdAt', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
          { title: 'Kỹ thuật viên', dataIndex: 'requester_name', width: 160, render: (v) => v || '-' },
          { title: 'Buổi', dataIndex: 'reason', width: 220 },
          {
            title: 'Vật tư đã dùng',
            render: (_, r) => (
              <div className="flex flex-wrap gap-1">
                {(r.items || []).map((i) => (
                  <Tooltip key={i.product_id} title={i.norm !== null ? `Định mức ${i.norm} ${i.unit}` : 'Ngoài định mức'}>
                    <Tag color={i.shortage ? 'red' : i.over_norm ? 'orange' : undefined}>{i.name}: {i.quantity} {i.unit}{i.shortage ? ` (thiếu ${i.shortage})` : ''}</Tag>
                  </Tooltip>
                ))}
              </div>
            ),
          },
        ]} />
    </>
  );
}

// ---------------- Tab 4: Đề xuất nhập hàng ----------------
function PurchaseTab({ reloadKey }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    axios.get(`${API}/commerce/materials/purchase-requests`, authConfig()).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được đề xuất'));
  }, [reloadKey]);
  const [deciding, setDeciding] = useState(null); // { row, decision, note, packs: { product_id: n } }
  const [busy, setBusy] = useState(false);
  const reload = () => axios.get(`${API}/commerce/materials/purchase-requests`, authConfig()).then((r) => setRows(r.data.data || [])).catch(() => {});

  const submitDecision = async () => {
    const { row, decision, note, packs } = deciding;
    if (decision === 'REJECT' && !note.trim()) { message.warning('Cần ghi lý do từ chối'); return; }
    setBusy(true);
    try {
      await axios.put(`${API}/commerce/materials/purchase-requests/${row.id}/decision`, {
        decision, note, items: decision === 'APPROVE' ? Object.entries(packs).map(([product_id, n]) => ({ product_id, packs: n })) : undefined,
      }, authConfig());
      message.success(decision === 'APPROVE' ? 'Đã duyệt đề xuất' : 'Đã từ chối đề xuất');
      setDeciding(null);
      reload();
    } catch (e) { message.error(e.response?.data?.message || 'Không xử lý được'); } finally { setBusy(false); }
  };
  const receive = (row) => Modal.confirm({
    title: 'Xác nhận hàng đã về kho?',
    content: (row.items || []).map((i) => <div key={i.product_id}>+ {i.quantity} {i.unit} {i.name}</div>),
    okText: 'Đã nhận hàng, cộng kho',
    onOk: async () => {
      try {
        await axios.put(`${API}/commerce/materials/purchase-requests/${row.id}/receive`, {}, authConfig());
        message.success('Đã nhập kho');
        reload();
      } catch (e) { message.error(e.response?.data?.message || 'Không nhập kho được'); }
    },
  });
  const statusTag = (r) => {
    if (r.status === 'APPROVED' && r.received_at) return <Tag color="green">Đã nhập kho</Tag>;
    return <Tag color={{ PENDING: 'gold', APPROVED: 'blue', REJECTED: 'red' }[r.status]}>{{ PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt, chờ hàng về', REJECTED: 'Từ chối' }[r.status]}</Tag>;
  };

  return (
    <>
      <Alert className="mb-3" type="info" showIcon message="Quy trình: Chờ duyệt → Duyệt (có thể chỉnh số lượng) hoặc Từ chối (ghi lý do) → Xác nhận hàng về kho (tự cộng tồn kho). Đề xuất tự tạo khi vật tư xuống dưới tồn tối thiểu, hoặc do quản lý tạo từ tab Tồn kho." />
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Ngày tạo', dataIndex: 'createdAt', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
          { title: 'Lý do', dataIndex: 'reason', width: 220 },
          { title: 'Cần nhập', render: (_, r) => (r.items || []).map((i) => <div key={i.product_id}>{i.name}: <b>{i.packs} × {i.pack_label || 'quy cách'}</b> ({i.quantity} {i.unit}; tồn lúc đề xuất {i.stock})</div>) },
          {
            title: 'Trạng thái', width: 220,
            render: (_, r) => (
              <div>
                {statusTag(r)}
                {r.decided_at && <div className="text-xs text-gray-500 mt-1">{r.status === 'REJECTED' ? 'Từ chối' : 'Duyệt'} lúc {dayjs(r.decided_at).format('HH:mm DD/MM')}{r.decision_note ? `: ${r.decision_note}` : ''}</div>}
                {r.received_at && <div className="text-xs text-gray-500">Nhập kho lúc {dayjs(r.received_at).format('HH:mm DD/MM')}</div>}
              </div>
            ),
          },
          {
            title: '', width: 190, fixed: 'right',
            render: (_, r) => (
              <Space wrap>
                {r.status === 'PENDING' && (
                  <>
                    <Button size="small" type="primary" onClick={() => setDeciding({ row: r, decision: 'APPROVE', note: '', packs: Object.fromEntries((r.items || []).map((i) => [i.product_id, i.packs])) })}>Duyệt</Button>
                    <Button size="small" danger onClick={() => setDeciding({ row: r, decision: 'REJECT', note: '', packs: {} })}>Từ chối</Button>
                  </>
                )}
                {r.status === 'APPROVED' && !r.received_at && <Button size="small" type="primary" className="!bg-green-600" onClick={() => receive(r)}>Đã nhận hàng</Button>}
              </Space>
            ),
          },
        ]} />
      <Modal open={!!deciding} title={deciding?.decision === 'APPROVE' ? 'Duyệt đề xuất nhập hàng' : 'Từ chối đề xuất nhập hàng'}
        onCancel={() => setDeciding(null)} onOk={submitDecision} confirmLoading={busy} okText={deciding?.decision === 'APPROVE' ? 'Duyệt' : 'Từ chối'}
        okButtonProps={{ danger: deciding?.decision === 'REJECT' }} destroyOnHidden>
        {deciding?.decision === 'APPROVE' && (deciding.row.items || []).map((i) => (
          <div key={i.product_id} className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm">{i.name}</span>
            <InputNumber min={1} max={10000} precision={0} value={deciding.packs[i.product_id]} suffix={i.pack_label || 'quy cách'} className="!w-48"
              onChange={(v) => setDeciding((d) => ({ ...d, packs: { ...d.packs, [i.product_id]: v || 1 } }))} />
          </div>
        ))}
        <Input.TextArea className="mt-2" rows={3} maxLength={1000} value={deciding?.note}
          placeholder={deciding?.decision === 'APPROVE' ? 'Ghi chú (không bắt buộc), vd nhà cung cấp, ngày giao dự kiến' : 'Lý do từ chối (bắt buộc)'}
          onChange={(e) => setDeciding((d) => ({ ...d, note: e.target.value }))} />
      </Modal>
    </>
  );
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [demandAvailable, setDemandAvailable] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const load = async () => {
    try {
      const res = await axios.get(`${API}/commerce/materials`, authConfig());
      setMaterials(res.data.data || []);
      setDemandAvailable(res.data.demand_available);
      setReloadKey((k) => k + 1);
    } catch (e) { message.error(e.response?.data?.message || 'Không tải được vật tư'); }
  };
  useEffect(() => { load(); }, []);
  const alertCount = useMemo(() => materials.filter((m) => m.status !== 'OK').length, [materials]);
  // Mở thẳng tab qua URL (vd từ trang Tổng quan: /materials?tab=purchase)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'stock';

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold m-0">Vật tư tiêu hao & Định mức</h2>
        <Button icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>
      </div>
      <Tabs activeKey={activeTab} onChange={(k) => setSearchParams({ tab: k }, { replace: true })} items={[
        { key: 'stock', label: <span>Tồn kho vật tư {alertCount > 0 && <Tag color="red" className="ml-1">{alertCount}</Tag>}</span>, children: <StockTab materials={materials} demandAvailable={demandAvailable} reload={load} /> },
        { key: 'norms', label: 'Định mức theo dịch vụ', children: <NormsTab materials={materials} /> },
        { key: 'usage', label: 'Lịch sử xuất & Thống kê', children: <UsageTab /> },
        { key: 'purchase', label: 'Đề xuất nhập hàng', children: <PurchaseTab reloadKey={reloadKey} /> },
      ]} />
    </div>
  );
}
