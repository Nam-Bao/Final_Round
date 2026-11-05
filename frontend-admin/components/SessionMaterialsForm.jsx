import React, { useEffect, useState } from 'react';
import { Table, Input, InputNumber, Select, Button, Tag, Alert, Spin, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

const API = 'http://localhost:4000/api/commerce/materials';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });

// Vật tư dùng trong 1 buổi: điền sẵn theo định mức của dịch vụ / gói, KTV sửa số thực dùng hoặc thêm vật tư khác.
// onChange: [{ product_id, quantity }] để gửi kèm khi hoàn thành buổi (server trừ kho); onNoteChange: lý do khi vượt định mức
export default function SessionMaterialsForm({ targetType, targetId, onChange, onNoteChange }) {
  const [rows, setRows] = useState([]);      // { product_id, name, unit, stock, norm, quantity }
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!targetType || !targetId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      axios.get(API, authConfig()),
      axios.get(`${API}/norms`, { ...authConfig(), params: { target_type: targetType, target_id: targetId } }),
    ]).then(([all, norms]) => {
      setMaterials(all.data.data || []);
      setRows((norms.data.data || []).map((n) => ({ product_id: n.product_id, name: n.name, unit: n.unit, stock: n.stock, norm: n.quantity, quantity: n.quantity })));
      setError('');
    }).catch((e) => setError(e.response?.data?.message || 'Không tải được định mức vật tư'))
      .finally(() => setLoading(false));
  }, [targetType, targetId]);

  useEffect(() => { onChange?.(rows.map((r) => ({ product_id: r.product_id, quantity: r.quantity || 0 }))); }, [rows]);

  const update = (id, quantity) => setRows((rs) => rs.map((r) => (r.product_id === id ? { ...r, quantity } : r)));
  const remove = (id) => setRows((rs) => rs.filter((r) => r.product_id !== id));
  const add = (id) => {
    const m = materials.find((x) => x.id === id);
    if (m) setRows((rs) => [...rs, { product_id: m.id, name: m.name, unit: m.unit, stock: m.stock, norm: null, quantity: 1 }]);
  };

  if (loading) return <Spin size="small" />;
  if (error) return <Alert type="error" showIcon message={error} />;

  const notEnough = rows.filter((r) => (r.quantity || 0) > r.stock);
  const hasNorm = rows.some((r) => r.norm !== null);
  const overNorm = hasNorm && rows.some((r) => (r.quantity || 0) > (r.norm ?? 0));
  const underNorm = rows.some((r) => r.norm !== null && (r.quantity || 0) < r.norm);
  return (
    <div>
      <Table size="small" pagination={false} rowKey="product_id" dataSource={rows}
        locale={{ emptyText: 'Dịch vụ này chưa có định mức vật tư. Thêm vật tư đã dùng bên dưới (nếu có).' }}
        columns={[
          { title: 'Vật tư', dataIndex: 'name', render: (v) => <span className="text-sm">{v}</span> },
          { title: 'Định mức', dataIndex: 'norm', width: 90, align: 'center', render: (v, r) => (v === null ? <Tag>Ngoài ĐM</Tag> : `${v} ${r.unit}`) },
          {
            title: 'Thực dùng', width: 140,
            render: (_, r) => (
              <InputNumber size="small" min={0} max={10000} precision={0} value={r.quantity} onChange={(v) => update(r.product_id, v ?? 0)}
                suffix={r.unit} status={r.norm !== null && r.quantity > r.norm ? 'warning' : undefined} className="!w-full" />
            ),
          },
          {
            title: 'Tồn kho', dataIndex: 'stock', width: 110, align: 'right',
            render: (v, r) => (
              <span className={r.quantity > v ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                {r.quantity > v && <Tooltip title="Kho không đủ"><WarningOutlined className="mr-1" /></Tooltip>}{v} {r.unit}
              </span>
            ),
          },
          { width: 40, render: (_, r) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(r.product_id)} /> },
        ]} />
      <Select className="mt-2 w-full" placeholder={<span><PlusOutlined /> Thêm vật tư khác đã dùng</span>} value={null} showSearch optionFilterProp="label"
        onChange={add}
        options={materials.filter((m) => !rows.some((r) => r.product_id === m.id)).map((m) => ({ value: m.id, label: `${m.name} (còn ${m.stock} ${m.unit})` }))} />
      {overNorm && (
        <Input.TextArea className="mt-2" rows={2} maxLength={500} status="warning" onChange={(e) => onNoteChange?.(e.target.value)}
          placeholder="Lý do dùng vượt định mức (bắt buộc), VD: Da khách nhiều nhân mụn, phải thay thêm găng tay" />
      )}
      {underNorm && <p className="text-xs text-orange-600 mt-2">Có vật tư ghi thấp hơn định mức, hệ thống sẽ cảnh báo cho quản lý.</p>}
      {notEnough.length > 0 && (
        <Alert className="mt-2" type="warning" showIcon
          message={`Kho không đủ: ${notEnough.map((r) => r.name).join(', ')}. Buổi vẫn được lưu, hệ thống báo quản lý kiểm kê và nhập hàng.`} />
      )}
    </div>
  );
}
