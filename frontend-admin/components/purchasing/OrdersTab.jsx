// Đơn đặt hàng (quản lý): xem trạng thái, tải PDF, gửi lại email cho nhà cung cấp, hủy đơn chưa nhận hàng
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Input, Space, Select, message } from 'antd';
import { FilePdfOutlined, MailOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { useLiveRefresh } from '../Notifications';
import { API, auth, vnd, errMsg, PO_STATUS } from './common';

export const openPoPdf = async (po) => {
  try {
    const r = await axios.get(`${API}/purchasing/orders/${po.id}/pdf`, { ...auth(), responseType: 'blob' });
    window.open(URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), '_blank');
  } catch (e) { message.error('Không tải được PDF'); }
};

export default function OrdersTab() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => axios.get(`${API}/purchasing/orders`, { ...auth(), params: status ? { status } : {} }).then((r) => setRows(r.data.data || [])).catch(() => message.error('Không tải được đơn đặt hàng'));
  useEffect(() => { load(); }, [status]);
  useLiveRefresh(['purchase-orders', 'goods-receipts'], load);

  const resend = async (po) => {
    try { const r = await axios.post(`${API}/purchasing/orders/${po.id}/resend`, {}, auth()); (r.data.email_status === 'SENT' ? message.success : message.warning)(r.data.message); load(); } catch (e) { message.error(errMsg(e, 'Không gửi lại được')); }
  };
  const submitCancel = async () => {
    setBusy(true);
    try { await axios.put(`${API}/purchasing/orders/${cancelling.po.id}/cancel`, { reason: cancelling.reason }, auth()); message.success('Đã hủy đơn và báo nhà cung cấp'); setCancelling(null); load(); } catch (e) { message.error(errMsg(e, 'Không hủy được')); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <Select allowClear placeholder="Lọc trạng thái" className="!w-60" value={status} onChange={setStatus} options={Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Table rowKey="id" dataSource={rows} size="middle" pagination={{ pageSize: 10 }} scroll={{ x: 1000 }}
        columns={[
          { title: 'Đơn', dataIndex: 'code', width: 150, render: (v, r) => <div><b>{v}</b><div className="text-xs text-gray-500">{dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}</div></div> },
          { title: 'Nhà cung cấp', width: 200, render: (_, r) => <div>{r.supplier?.name}<div className="text-xs text-gray-500">{r.supplier?.email}</div></div> },
          {
            title: 'Hàng đặt / đã nhận',
            render: (_, r) => (r.items || []).map((i) => (
              <div key={i.product_id}>{i.name}: <b>{i.received_qty || 0}/{i.quantity}</b> {i.unit}{i.unit_cost != null ? ` • ${vnd(i.unit_cost)}` : ''}{i.closed ? <Tag className="ml-1">chốt thiếu</Tag> : ''}</div>
            )),
          },
          {
            title: 'Trạng thái', width: 210,
            render: (_, r) => (
              <div>
                <Tag color={PO_STATUS[r.status]?.color}>{PO_STATUS[r.status]?.label}</Tag>
                {r.has_pending_review && <Tag color="red">Có biên bản chờ kiểm tra</Tag>}
                <div className="text-xs text-gray-500 mt-1">Email: {{ SENT: 'đã gửi', FAILED: 'gửi lỗi', SKIPPED: 'không gửi' }[r.email_status] || '-'}</div>
                {r.expected_date && <div className="text-xs text-gray-500">Dự kiến giao {dayjs(r.expected_date).format('DD/MM/YYYY')}</div>}
                {r.cancel_reason && <div className="text-xs text-gray-500">Lý do hủy: {r.cancel_reason}</div>}
              </div>
            ),
          },
          {
            title: '', width: 200, fixed: 'right',
            render: (_, r) => (
              <Space wrap>
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => openPoPdf(r)}>PDF</Button>
                {['SENT', 'PARTIAL'].includes(r.status) && <Button size="small" icon={<MailOutlined />} onClick={() => resend(r)}>Gửi lại email</Button>}
                {r.status === 'SENT' && <Button size="small" danger icon={<StopOutlined />} onClick={() => setCancelling({ po: r, reason: '' })}>Hủy</Button>}
              </Space>
            ),
          },
        ]} />
      <Modal open={!!cancelling} title={`Hủy đơn ${cancelling?.po.code}`} onCancel={() => setCancelling(null)} onOk={submitCancel} confirmLoading={busy} cancelText="Đóng" okText="Hủy đơn" okButtonProps={{ danger: true }} destroyOnHidden>
        <p className="text-sm text-gray-600">Hệ thống gửi email báo hủy cho nhà cung cấp; đề xuất quay về "đã duyệt" để đặt lại nhà cung cấp khác.</p>
        <Input.TextArea rows={3} maxLength={500} placeholder="Lý do hủy (bắt buộc)" value={cancelling?.reason} onChange={(e) => setCancelling((c) => ({ ...c, reason: e.target.value }))} />
      </Modal>
    </>
  );
}
