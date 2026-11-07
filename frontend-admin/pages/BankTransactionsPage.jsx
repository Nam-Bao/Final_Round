import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Modal, Input, Radio, Segmented, Alert, message, Typography } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const API = 'http://localhost:4000/api/booking/bank-transactions';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

const STATUS = {
  PARTIAL: { color: 'orange', text: 'Chuyển thiếu' },
  UNMATCHED: { color: 'red', text: 'Chưa khớp' },
  OVERPAID: { color: 'purple', text: 'Chuyển thừa' },
  MATCHED: { color: 'green', text: 'Đã khớp' },
  RESOLVED: { color: 'blue', text: 'Đã xử lý' },
};
const CODE_TYPE = { APPOINTMENT: 'Cọc khám', CONSULTATION: 'Cọc tư vấn', ORDER: 'Đơn mỹ phẩm', NONE: 'Không có mã' };
const ACTION = { REFUNDED: 'Đã hoàn tiền cho khách', MANUAL: 'Đã xử lý tay cho khách', IGNORED: 'Không phải tiền của khách' };

// Đối soát tiền vào: mọi giao dịch SePay báo về đều được lưu, khoản không tự khớp được lịch / đơn nằm ở "Chưa xử lý"
export default function BankTransactionsPage() {
  const [tab, setTab] = useState('OPEN');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [form, setForm] = useState({ action: 'REFUNDED', ref: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(API, { headers: headers(), params: { status: tab } });
      setRows(res.data.data || []);
      setOpen(res.data.open || 0);
    } catch (err) { message.error(err.response?.data?.message || 'Không tải được giao dịch'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    try {
      const res = await axios.put(`${API}/${resolving.id}/resolve`, form, { headers: headers() });
      message.success(res.data.message);
      setResolving(null);
      load();
    } catch (err) { message.error(err.response?.data?.message || 'Không lưu được'); }
  };

  return (
    <Card title="Đối soát tiền vào">
      {open > 0 && <Alert className="mb-3" type="warning" showIcon message={`Có ${open} khoản tiền chưa xử lý`} description="Liên hệ khách theo nội dung chuyển khoản. Khách chuyển thiếu hoặc chuyển sau khi hết giữ chỗ: hoàn tiền, hoặc xác nhận cọc thủ công rồi ghi lại tại đây. Khách chuyển thừa: lịch hoặc đơn đã được xác nhận, chỉ cần hoàn phần dư." />}
      <Segmented
        className="mb-3" value={tab} onChange={setTab}
        options={[{ value: 'OPEN', label: `Chưa xử lý (${open})` }, { value: 'RESOLVED', label: 'Đã xử lý' }, { value: 'MATCHED', label: 'Đã khớp tự động' }]}
      />
      <Table
        rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 15 }} scroll={{ x: 900 }}
        columns={[
          { title: 'Thời gian', dataIndex: 'received_at', width: 140, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
          { title: 'Số tiền', dataIndex: 'amount', width: 120, align: 'right', render: (v) => <b>{money(v)}</b> },
          { title: 'Nội dung chuyển khoản', dataIndex: 'content' },
          { title: 'Loại', dataIndex: 'code_type', width: 120, render: (v) => CODE_TYPE[v] || v },
          {
            title: 'Tình trạng', key: 's', width: 260,
            render: (_, r) => (
              <>
                <Tag color={STATUS[r.status]?.color}>{STATUS[r.status]?.text}</Tag>
                {r.reason && <div className="text-xs text-gray-500 mt-1">{r.reason}</div>}
                {r.resolved_action && <div className="text-xs text-gray-500 mt-1">{ACTION[r.resolved_action]}{r.resolved_ref ? ` (${r.resolved_ref})` : ''}: {r.resolved_note}</div>}
              </>
            ),
          },
          {
            title: '', key: 'a', width: 90,
            render: (_, r) => ['PARTIAL', 'UNMATCHED', 'OVERPAID'].includes(r.status) && (
              <Button size="small" type="primary" onClick={() => { setResolving(r); setForm({ action: 'REFUNDED', ref: '', note: '' }); }}>Xử lý</Button>
            ),
          },
        ]}
      />

      <Modal title="Xử lý khoản tiền" open={!!resolving} onCancel={() => setResolving(null)} onOk={submit} okText="Lưu" cancelText="Đóng" destroyOnHidden>
        <p className="mb-2"><b>{money(resolving?.amount)}</b> <Text type="secondary">{resolving?.content}</Text></p>
        <Radio.Group className="flex flex-col gap-1 mb-3" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
          {Object.entries(ACTION).map(([value, label]) => <Radio key={value} value={value}>{label}</Radio>)}
        </Radio.Group>
        <Input className="mb-2" maxLength={50} placeholder={form.action === 'REFUNDED' ? 'Mã giao dịch hoàn tiền (bắt buộc)' : 'Mã giao dịch / số phiếu (nếu có)'} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
        <Input.TextArea rows={3} maxLength={500} placeholder="Nội dung xử lý (ít nhất 10 ký tự)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Modal>
    </Card>
  );
}
