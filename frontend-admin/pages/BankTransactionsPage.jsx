import React, { useCallback, useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Modal, Input, InputNumber, Radio, Segmented, Alert, message, Typography } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import RefundTransferNote from '../components/RefundTransferNote';
import { useLiveRefresh } from '../components/Notifications';

const { Text } = Typography;
const API = 'http://localhost:4000/api/booking/bank-transactions';
const headers = () => ({ Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` });
const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
const currentUser = () => { try { return JSON.parse(sessionStorage.getItem('admin_user') || '{}') || {}; } catch { return {}; } };

const STATUS = {
  PARTIAL: { color: 'orange', text: 'Chuyển thiếu' },
  UNMATCHED: { color: 'red', text: 'Chưa khớp' },
  OVERPAID: { color: 'purple', text: 'Chuyển thừa' },
  MATCHED: { color: 'green', text: 'Đã khớp' },
  RESOLVED: { color: 'blue', text: 'Đã xử lý' },
};
const CODE_TYPE = { APPOINTMENT: 'Cọc khám', CONSULTATION: 'Cọc tư vấn', ORDER: 'Đơn mỹ phẩm', NONE: 'Không có mã' };
const ACTION = { REFUNDED: 'Đã hoàn tiền cho khách', MANUAL: 'Đã xử lý tay cho khách', IGNORED: 'Không phải tiền của khách' };
const REFUND_SOURCE = { BANK_TX: 'Đối soát tiền vào', APPOINTMENT: 'Hoàn cọc khám', CONSULTATION: 'Hoàn cọc tư vấn', ORDER: 'Đơn mỹ phẩm hủy', RETURN: 'Hoàn trả hàng' };
const REFUND_STATUS = {
  WAITING: { color: 'orange', text: 'Chờ ngân hàng báo tiền ra' },
  DISPUTED: { color: 'red', text: 'Sai lệch, chưa thấy tiền ra' },
  VERIFIED: { color: 'green', text: 'Đã xác minh' },
};
// Khoản hoàn đã ghi quá 24 giờ mà ngân hàng chưa báo tiền ra: cần quản lý kiểm tra
const isLate = (r) => r.status !== 'VERIFIED' && dayjs().diff(dayjs(r.claimed_at), 'hour') >= 24;

// Thông tin khách để CSKH liên hệ hoàn tiền / xác nhận
function CustomerCell({ customer }) {
  if (customer) {
    return (
      <div className="text-sm leading-5">
        <b>{customer.name}</b>
        {customer.phone && <div><Text copyable>{customer.phone}</Text></div>}
        {customer.email && <div className="text-xs text-gray-500">{customer.email}</div>}
      </div>
    );
  }
  return <Text type="secondary" className="text-xs">Không xác định từ mã. Xem tên người chuyển trong nội dung hoặc tra sao kê ngân hàng theo mã tham chiếu.</Text>;
}

// Đối soát tiền vào: mọi giao dịch SePay báo về đều được lưu, khoản không tự khớp được lịch / đơn nằm ở "Chưa xử lý".
// Kiểm soát hoàn tiền: mọi lần nhân viên báo "đã hoàn" được đối chiếu với tiền ra trên ngân hàng.
export default function BankTransactionsPage() {
  const isManager = ['ADMIN', 'GEN_MANAGER'].includes(currentUser().role);
  const [tab, setTab] = useState('OPEN');
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(0);
  const [refundOpen, setRefundOpen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [form, setForm] = useState({ action: 'REFUNDED', ref: '', note: '', amount: 0, account: '' });
  const [reviewing, setReviewing] = useState(null);
  const [review, setReview] = useState({ result: 'VERIFIED', note: '' });
  const refundTab = tab.startsWith('REFUND_');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, refunds] = await Promise.all([
        refundTab
          ? axios.get(`${API}/refunds`, { headers: headers(), params: { status: tab === 'REFUND_VERIFIED' ? 'VERIFIED' : 'OPEN' } })
          : axios.get(API, { headers: headers(), params: { status: tab } }),
        refundTab ? null : axios.get(`${API}/refunds`, { headers: headers(), params: { status: 'OPEN' } }).catch(() => null),
      ]);
      setRows(res.data.data || []);
      if (refundTab) setRefundOpen(res.data.open || 0);
      else { setOpen(res.data.open || 0); if (refunds) setRefundOpen(refunds.data.open || 0); }
    } catch (err) { message.error(err.response?.data?.message || 'Không tải được giao dịch'); }
    finally { setLoading(false); }
  }, [tab, refundTab]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['bank'], load);

  // Chuyển thừa: mặc định hoàn phần dư (ghi trong lý do), còn lại hoàn toàn bộ
  const refundDefault = (r) => {
    const excess = r.status === 'OVERPAID' ? Number((String(r.reason || '').match(/thừa ([\d.]+)/) || [])[1]?.replace(/\./g, '') || 0) : 0;
    return excess > 0 ? excess : Number(r.amount);
  };

  const submit = async () => {
    try {
      const res = await axios.put(`${API}/${resolving.id}/resolve`, form, { headers: headers() });
      message.success(res.data.message);
      setResolving(null);
      load();
    } catch (err) { message.error(err.response?.data?.message || 'Không lưu được'); }
  };

  const submitReview = async () => {
    try {
      const res = await axios.put(`${API}/refunds/${reviewing.id}/review`, review, { headers: headers() });
      message.success(res.data.message);
      setReviewing(null);
      load();
    } catch (err) { message.error(err.response?.data?.message || 'Không lưu được'); }
  };

  const txColumns = [
    { title: 'Thời gian', dataIndex: 'received_at', width: 130, render: (v) => dayjs(v).format('HH:mm DD/MM/YYYY') },
    { title: 'Số tiền', dataIndex: 'amount', width: 110, align: 'right', render: (v) => <b>{money(v)}</b> },
    {
      title: 'Nội dung chuyển khoản', dataIndex: 'content', width: 220,
      render: (v, r) => <><div>{v}</div>{r.reference_code && <div className="text-xs text-gray-500">Mã tham chiếu: {r.reference_code}</div>}</>,
    },
    { title: 'Loại', dataIndex: 'code_type', width: 110, render: (v) => CODE_TYPE[v] || v },
    { title: 'Khách hàng', key: 'c', width: 200, render: (_, r) => <CustomerCell customer={r.customer} /> },
    {
      title: 'Tình trạng', key: 's', width: 260,
      render: (_, r) => (
        <>
          <Tag color={STATUS[r.status]?.color}>{STATUS[r.status]?.text}</Tag>
          {r.refund_status && <Tag color={REFUND_STATUS[r.refund_status].color}>{REFUND_STATUS[r.refund_status].text}</Tag>}
          {r.reason && <div className="text-xs text-gray-500 mt-1">{r.reason}</div>}
          {r.resolved_action && (
            <div className="text-xs text-gray-500 mt-1">
              {ACTION[r.resolved_action]}{r.resolved_ref ? ` (${r.resolved_ref})` : ''}: {r.resolved_note}
              {r.resolved_by_name && <div>Người xử lý: {r.resolved_by_name}, {dayjs(r.resolved_at).format('HH:mm DD/MM')}</div>}
            </div>
          )}
        </>
      ),
    },
    {
      title: '', key: 'a', width: 80, fixed: 'right',
      render: (_, r) => ['PARTIAL', 'UNMATCHED', 'OVERPAID'].includes(r.status) && (
        <Button size="small" type="primary" onClick={() => { setResolving(r); setForm({ action: 'REFUNDED', ref: '', note: '', amount: refundDefault(r), account: '' }); }}>Xử lý</Button>
      ),
    },
  ];

  const refundColumns = [
    {
      title: 'Ghi nhận', dataIndex: 'claimed_at', width: 150,
      render: (v, r) => (
        <>
          <div>{dayjs(v).format('HH:mm DD/MM/YYYY')}</div>
          <div className="text-xs text-gray-500">{r.claimed_by_name || 'Nhân viên'}</div>
          {isLate(r) && <Tag color="red" className="mt-1">Quá 24 giờ</Tag>}
        </>
      ),
    },
    { title: 'Nguồn', dataIndex: 'source', width: 130, render: (v) => REFUND_SOURCE[v] || v },
    { title: 'Số tiền', dataIndex: 'amount', width: 110, align: 'right', render: (v) => <b>{money(v)}</b> },
    { title: 'Khách hàng', key: 'c', width: 190, render: (_, r) => <CustomerCell customer={r.customer} /> },
    {
      title: 'Chuyển tới / bằng chứng', key: 'acc', width: 240,
      render: (_, r) => (
        <div className="text-xs leading-5">
          <div>{r.account}</div>
          <div>Nội dung phải có: <b>{r.content}</b></div>
          <div className="text-gray-500">Mã GD nhân viên nhập: {r.bank_ref}</div>
        </div>
      ),
    },
    {
      title: 'Đối chiếu', key: 's', width: 250,
      render: (_, r) => (
        <>
          <Tag color={REFUND_STATUS[r.status]?.color}>{REFUND_STATUS[r.status]?.text}</Tag>
          {r.verified_method === 'BANK' && r.bank_tx && (
            <div className="text-xs text-gray-500 mt-1">Ngân hàng báo tiền ra {dayjs(r.bank_tx.received_at).format('HH:mm DD/MM')}: {r.bank_tx.content}{r.bank_tx.reference_code ? ` (${r.bank_tx.reference_code})` : ''}</div>
          )}
          {r.manager_note && <div className="text-xs text-gray-500 mt-1">{r.verified_by_name || 'Quản lý'}: {r.manager_note}</div>}
        </>
      ),
    },
    ...(isManager ? [{
      title: '', key: 'a', width: 90, fixed: 'right',
      render: (_, r) => r.status !== 'VERIFIED' && <Button size="small" onClick={() => { setReviewing(r); setReview({ result: 'VERIFIED', note: '' }); }}>Đối chiếu</Button>,
    }] : []),
  ];

  return (
    <Card title="Đối soát tiền">
      {!refundTab && open > 0 && <Alert className="mb-3" type="warning" showIcon message={`Có ${open} khoản tiền chưa xử lý`} description="Liên hệ khách theo thông tin ở cột Khách hàng. Khách chuyển thiếu hoặc chuyển sau khi hết giữ chỗ: hoàn tiền, hoặc xác nhận cọc thủ công rồi ghi lại tại đây. Khách chuyển thừa: lịch hoặc đơn đã được xác nhận, chỉ cần hoàn phần dư." />}
      {refundTab && (
        <Alert className="mb-3" type="info" showIcon message="Khoản hoàn chỉ được xác minh khi ngân hàng báo tiền ra đúng nội dung HOAN và đúng số tiền"
          description={isManager
            ? 'Khoản quá 24 giờ chưa thấy tiền ra: kiểm tra sao kê ngân hàng. Thấy tiền ra (VD chuyển sai nội dung): xác nhận khớp. Không thấy: đánh dấu sai lệch và yêu cầu nhân viên chuyển lại, khoản sẽ tự xác minh khi ngân hàng báo tiền ra đúng mã.'
            : 'Nếu đã chuyển mà khoản vẫn chờ, kiểm tra lại nội dung chuyển khoản và báo quản lý.'} />
      )}
      <Segmented
        className="mb-3" value={tab} onChange={setTab}
        options={[
          { value: 'OPEN', label: `Tiền vào chưa xử lý (${open})` }, { value: 'RESOLVED', label: 'Đã xử lý' }, { value: 'MATCHED', label: 'Đã khớp tự động' },
          { value: 'REFUND_OPEN', label: `Hoàn tiền chờ xác minh (${refundOpen})` }, { value: 'REFUND_VERIFIED', label: 'Hoàn tiền đã xác minh' },
        ]}
      />
      <Table rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 15 }} scroll={{ x: 1100 }} columns={refundTab ? refundColumns : txColumns} />

      <Modal title="Xử lý khoản tiền" open={!!resolving} onCancel={() => setResolving(null)} onOk={submit} okText="Lưu" cancelText="Đóng" destroyOnHidden>
        <p className="mb-1"><b>{money(resolving?.amount)}</b> <Text type="secondary">{resolving?.content}</Text></p>
        {resolving?.customer && <p className="mb-2 text-sm">Khách: <b>{resolving.customer.name}</b> {resolving.customer.phone}</p>}
        <Radio.Group className="flex flex-col gap-1 mb-3" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
          {Object.entries(ACTION).map(([value, label]) => <Radio key={value} value={value}>{label}</Radio>)}
        </Radio.Group>
        {form.action === 'REFUNDED' && (
          <>
            <RefundTransferNote sourceId={resolving?.id} amount={form.amount} />
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">Số tiền hoàn</span>
              <InputNumber min={1} max={Number(resolving?.amount || 0)} value={form.amount} onChange={(v) => setForm({ ...form, amount: v || 0 })}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} parser={(v) => v.replace(/\./g, '')} style={{ width: 160 }} addonAfter="đ" />
            </div>
            <Input className="mb-2" maxLength={200} placeholder="Tài khoản nhận hoàn: ngân hàng - số tài khoản - chủ tài khoản" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
          </>
        )}
        <Input className="mb-2" maxLength={50} placeholder={form.action === 'REFUNDED' ? 'Mã giao dịch hoàn tiền (bắt buộc)' : 'Mã giao dịch / số phiếu (nếu có)'} value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
        <Input.TextArea rows={3} maxLength={500} placeholder="Nội dung xử lý (ít nhất 10 ký tự)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Modal>

      <Modal title="Đối chiếu sao kê" open={!!reviewing} onCancel={() => setReviewing(null)} onOk={submitReview} okText="Lưu" cancelText="Đóng" destroyOnHidden>
        <p className="mb-2"><b>{money(reviewing?.amount)}</b> tới {reviewing?.account}. Nội dung phải có <b>{reviewing?.content}</b>, mã GD nhân viên nhập {reviewing?.bank_ref}.</p>
        <Radio.Group className="flex flex-col gap-1 mb-3" value={review.result} onChange={(e) => setReview({ ...review, result: e.target.value })}>
          <Radio value="VERIFIED">Sao kê có khoản tiền ra này (xác nhận khớp)</Radio>
          <Radio value="DISPUTED">Không thấy tiền ra (đánh dấu sai lệch)</Radio>
        </Radio.Group>
        <Input.TextArea rows={3} maxLength={500} placeholder="Ghi rõ đã đối chiếu thế nào (ít nhất 10 ký tự). VD: Sao kê ngày 10/11 có GD FT2611... 50.000đ" value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} />
      </Modal>
    </Card>
  );
}
