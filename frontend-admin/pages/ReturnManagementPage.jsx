import React, { useState, useEffect } from 'react';
import { Table, Tag, Drawer, Descriptions, Image, Button, Space, Modal, Input, Checkbox, Segmented, Steps, Popconfirm, message } from 'antd';
import { Undo2 } from 'lucide-react';
import axios from 'axios';
import RefundTransferNote from '../components/RefundTransferNote';
import { useLiveRefresh } from '../components/Notifications';

const API = 'http://localhost:4000/api/commerce/returns';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '');

const STATUS = {
  PENDING: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt - chờ tạo GHN', color: 'cyan' },
  PICKING: { label: 'GHN đang lấy hàng', color: 'geekblue' },
  RECEIVED: { label: 'Kho đã nhận - chờ kiểm tra', color: 'blue' },
  REFUNDED: { label: 'Đã hoàn tiền', color: 'green' },
  EXCHANGED: { label: 'Đã đổi hàng', color: 'green' },
  REJECTED: { label: 'Từ chối', color: 'red' },
  CANCELLED: { label: 'Khách đã hủy', color: 'default' },
};
const REASONS = {
  DAMAGED: 'Móp, vỡ, rò rỉ khi vận chuyển',
  WRONG_ITEM: 'Giao sai sản phẩm / phân loại',
  DEFECTIVE: 'Sản phẩm lỗi',
  EXPIRED: 'Hết hạn / không có hạn sử dụng',
};
// Bước cuối theo cách xử lý khách chọn: đổi hàng (mặc định) hoặc hoàn tiền
const stepsOf = (r) => ['PENDING', 'APPROVED', 'PICKING', 'RECEIVED', r?.resolution === 'REFUND' ? 'REFUNDED' : 'EXCHANGED'];
const hasSale = (r) => (r?.items || []).some((i) => i.is_sale);
const FILTERS = [
  { value: 'TODO', label: 'Cần xử lý' },
  { value: 'ALL', label: 'Tất cả' },
  { value: 'DONE', label: 'Đã đóng' },
];
const TODO_STATUSES = ['PENDING', 'APPROVED', 'PICKING', 'RECEIVED'];

// NVBH xử lý yêu cầu hoàn/trả: duyệt hồ sơ -> tạo đơn GHN lấy hàng -> nhận & kiểm tra -> hoàn tiền (hoặc từ chối)
export default function ReturnManagementPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('TODO');
  const [selectedId, setSelectedId] = useState(null);
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundRef, setRefundRef] = useState('');
  const [restock, setRestock] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchangeLines, setExchangeLines] = useState([]); // [{ product_id, quantity }]
  const [products, setProducts] = useState([]);
  const [toRefundOpen, setToRefundOpen] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', bank_account: '', bank_holder: '' });

  const openExchange = async () => {
    setExchangeLines(selected.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })));
    setRestock(selected.reason === 'WRONG_ITEM');
    setExchangeOpen(true);
    if (!products.length) {
      axios.get('http://localhost:4000/api/commerce/products/shop').then((r) => setProducts(r.data.data || [])).catch(() => {});
    }
  };
  const fetchReturns = async () => {
    try {
      const res = await axios.get(`${API}/admin`, authConfig());
      setReturns(res.data.data || []);
    } catch (error) {
      message.error(error.response?.data?.message || 'Lỗi tải danh sách hoàn trả');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReturns(); }, []);
  useLiveRefresh(['returns', 'orders'], fetchReturns);

  const selected = returns.find((r) => r.id === selectedId);
  // Giá trị đổi: cùng sản phẩm tính theo giá khách đã mua, sản phẩm khác theo giá niêm yết (server tính lại theo giá bán hiện tại)
  const returnedValue = selected ? selected.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0) : 0;
  const priceOf = (pid) => Number(selected?.items.find((i) => i.product_id === pid)?.price ?? products.find((p) => p.id === pid)?.price ?? 0);
  const exchangeValue = exchangeLines.reduce((s, l) => s + priceOf(l.product_id) * (l.quantity || 0), 0);
  const shown = returns.filter((r) => filter === 'ALL' || (filter === 'TODO') === TODO_STATUSES.includes(r.status));

  const act = async (path, body = {}) => {
    setActing(true);
    try {
      const res = await axios.put(`${API}/admin/${selected.id}/${path}`, body, authConfig());
      message.success(res.data.message);
      await fetchReturns();
      return true;
    } catch (error) {
      message.error(error.response?.data?.message || 'Thao tác thất bại');
      return false;
    } finally {
      setActing(false);
    }
  };

  const columns = [
    { title: 'Mã đơn', render: (_, r) => <b>#{r.order_id.substring(0, 8).toUpperCase()}</b> },
    { title: 'Khách', render: (_, r) => <div>{r.Order?.recipient_name}<div className="text-xs text-slate-500">{r.Order?.shipping_phone}</div></div> },
    { title: 'Lý do', dataIndex: 'reason', render: (v) => REASONS[v] || v },
    { title: 'Cách xử lý', render: (_, r) => (r.resolution === 'REFUND'
      ? <span><Tag color="blue">Hoàn tiền</Tag><b className="text-blue-600">{vnd(r.refund_amount)}</b></span>
      : <span><Tag color="purple">Đổi hàng</Tag>{hasSale(r) && <Tag color="orange">Khuyến mãi</Tag>}</span>) },
    { title: 'Gửi lúc', dataIndex: 'createdAt', render: fmtDate },
    { title: 'Trạng thái', dataIndex: 'status', render: (v) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.label || v}</Tag> },
  ];

  const stepIndex = selected ? stepsOf(selected).indexOf(selected.status) : -1;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Undo2 className="w-6 h-6" /> Quản lý hoàn / trả hàng</h1>
        <Segmented options={FILTERS.map((f) => ({
          value: f.value,
          label: `${f.label} (${returns.filter((r) => f.value === 'ALL' || (f.value === 'TODO') === TODO_STATUSES.includes(r.status)).length})`,
        }))} value={filter} onChange={setFilter} />
      </div>

      <Table rowKey="id" loading={loading} columns={columns} dataSource={shown} size="middle"
        onRow={(r) => ({ onClick: () => setSelectedId(r.id), className: 'cursor-pointer' })}
        locale={{ emptyText: 'Không có yêu cầu hoàn trả' }} />

      <Drawer title={selected ? `Hoàn trả đơn #${selected.order_id.substring(0, 8).toUpperCase()}` : ''} width={560}
        open={!!selected} onClose={() => setSelectedId(null)} destroyOnHidden>
        {selected && (
          <div className="space-y-4">
            {['REJECTED', 'CANCELLED'].includes(selected.status) ? (
              <Tag color={STATUS[selected.status].color} className="text-sm">{STATUS[selected.status].label}</Tag>
            ) : (
              <Steps size="small" current={stepIndex} items={stepsOf(selected).map((s) => ({ title: STATUS[s].label.split(' - ')[0] }))} />
            )}

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Khách / SĐT">{selected.Order?.recipient_name} · {selected.Order?.shipping_phone}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ lấy hàng">{selected.Order?.shipping_address}</Descriptions.Item>
              <Descriptions.Item label="Sản phẩm trả">
                {selected.items.map((i) => <div key={i.order_detail_id}>{i.name} x{i.quantity} ({vnd(i.price)}) {i.is_sale && <Tag color="orange">Khuyến mãi: chỉ đổi</Tag>}</div>)}
              </Descriptions.Item>
              <Descriptions.Item label="Khách chọn">{selected.resolution === 'REFUND' ? <Tag color="blue">Hoàn tiền</Tag> : <Tag color="purple">Đổi sản phẩm</Tag>}</Descriptions.Item>
              {selected.exchange_order_id && <Descriptions.Item label="Đơn giao hàng đổi"><b>#{selected.exchange_order_id.substring(0, 8).toUpperCase()}</b> (xử lý ở Quản lý đơn hàng) {selected.restocked && <Tag color="green">Đã nhập lại kho</Tag>}</Descriptions.Item>}
              <Descriptions.Item label="Lý do">{REASONS[selected.reason] || selected.reason}</Descriptions.Item>
              <Descriptions.Item label="Mô tả của khách">{selected.description}</Descriptions.Item>
              {selected.resolution === 'REFUND' && <Descriptions.Item label="Số tiền hoàn"><b className="text-blue-600">{vnd(selected.refund_amount)}</b></Descriptions.Item>}
              {selected.resolution === 'REFUND' && <Descriptions.Item label="Nhận hoàn tiền">{selected.bank_name} · {selected.bank_account} · {selected.bank_holder}</Descriptions.Item>}
              {selected.tracking_code && <Descriptions.Item label="Vận đơn GHN">{selected.tracking_code} {selected.ghn_status && <Tag>{selected.ghn_status}</Tag>}</Descriptions.Item>}
              {selected.refund_ref && <Descriptions.Item label="Mã GD hoàn tiền">{selected.refund_ref} {selected.restocked && <Tag color="green">Đã nhập lại kho</Tag>}</Descriptions.Item>}
              {selected.reject_reason && <Descriptions.Item label="Lý do từ chối">{selected.reject_reason}</Descriptions.Item>}
            </Descriptions>

            <div>
              <div className="font-semibold text-slate-700 mb-2">Ảnh bằng chứng</div>
              <Image.PreviewGroup>
                <Space wrap>{selected.images.map((url) => <Image key={url} src={url} width={90} height={90} className="object-cover rounded" />)}</Space>
              </Image.PreviewGroup>
            </div>

            {/* Thao tác theo từng bước */}
            <div className="bg-slate-50 border rounded-lg p-3 space-y-2">
              {selected.status === 'PENDING' && (
                <>
                  <p className="text-xs text-slate-500">Đối chiếu ảnh và mô tả với quy định (lỗi / hư hỏng / giao sai / hết hạn, trong 7 ngày kể từ khi nhận hàng). Không đạt thì từ chối và ghi rõ lý do.</p>
                  <Space>
                    <Button type="primary" loading={acting} onClick={() => act('approve')}>Duyệt yêu cầu</Button>
                    <Button danger onClick={() => { setRejectReason(''); setRejectOpen(true); }}>Từ chối</Button>
                  </Space>
                </>
              )}
              {selected.status === 'APPROVED' && (
                <>
                  <p className="text-xs text-slate-500">Tạo đơn GHN lấy hàng tại địa chỉ khách, giao về kho. Phí vận chuyển do shop trả, không thu hộ.</p>
                  <Space>
                    <Popconfirm title="Tạo đơn GHN lấy hàng hoàn trả?" onConfirm={() => act('pickup')}>
                      <Button type="primary" loading={acting}>Tạo đơn GHN lấy hàng</Button>
                    </Popconfirm>
                    <Button danger onClick={() => { setRejectReason(''); setRejectOpen(true); }}>Từ chối</Button>
                  </Space>
                </>
              )}
              {selected.status === 'PICKING' && (
                <>
                  <p className="text-xs text-slate-500">Hệ thống tự chuyển sang "Kho đã nhận" khi GHN báo giao thành công. Nếu chưa có webhook, xác nhận thủ công khi hàng về.</p>
                  <Space>
                    <Popconfirm title="Xác nhận kho đã nhận được hàng hoàn?" onConfirm={() => act('receive')}>
                      <Button type="primary" loading={acting}>Kho đã nhận hàng</Button>
                    </Popconfirm>
                    <Popconfirm title="Hủy đơn GHN lấy hàng? (chỉ được khi shipper chưa lấy)" onConfirm={() => act('cancel-pickup')}>
                      <Button loading={acting}>Hủy đơn GHN</Button>
                    </Popconfirm>
                  </Space>
                </>
              )}
              {selected.status === 'RECEIVED' && (
                <>
                  {selected.resolution === 'REFUND' ? (
                    <p className="text-xs text-slate-500">Kiểm tra sản phẩm nhận về đúng mô tả, đủ số lượng. Đạt: chuyển khoản {vnd(selected.refund_amount)} cho khách rồi ghi nhận mã giao dịch. Không đạt: từ chối và liên hệ gửi trả hàng cho khách.</p>
                  ) : (
                    <p className="text-xs text-slate-500">Kiểm tra sản phẩm nhận về đúng mô tả, đủ số lượng. Đạt: tạo đơn giao hàng đổi (0đ), rồi đóng gói và tạo vận đơn ở Quản lý đơn hàng như đơn thường. {hasSale(selected) ? 'Hàng khuyến mãi: chỉ đổi đúng sản phẩm, không hoàn tiền.' : 'Hết hàng: đổi sản phẩm khác không vượt giá trị hàng trả, hoặc chuyển sang hoàn tiền nếu khách đồng ý.'}</p>
                  )}
                  <Space wrap>
                    {selected.resolution === 'REFUND'
                      ? <Button type="primary" onClick={() => { setRefundRef(''); setRestock(selected.reason === 'WRONG_ITEM'); setRefundOpen(true); }}>Đạt - Ghi nhận hoàn tiền</Button>
                      : <Button type="primary" onClick={openExchange}>Đạt - Đổi hàng</Button>}
                    {selected.resolution !== 'REFUND' && !hasSale(selected) && (
                      <Button onClick={() => { setBank({ bank_name: '', bank_account: '', bank_holder: '' }); setToRefundOpen(true); }}>Không còn hàng - Chuyển sang hoàn tiền</Button>
                    )}
                    <Button danger onClick={() => { setRejectReason(''); setRejectOpen(true); }}>Không đạt - Từ chối</Button>
                  </Space>
                </>
              )}
              {['REFUNDED', 'EXCHANGED', 'REJECTED', 'CANCELLED'].includes(selected.status) && (
                <p className="text-xs text-slate-500">Yêu cầu đã đóng. Cập nhật lần cuối: {fmtDate(selected.updatedAt)}</p>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal title="Từ chối yêu cầu hoàn trả" open={rejectOpen} onCancel={() => setRejectOpen(false)} okText="Từ chối" okButtonProps={{ danger: true, loading: acting }}
        onOk={async () => { if (await act('reject', { reason: rejectReason })) setRejectOpen(false); }}>
        <p className="text-sm text-slate-500 mb-2">Lý do sẽ hiển thị cho khách (ít nhất 10 ký tự).</p>
        <Input.TextArea rows={3} maxLength={500} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
      </Modal>

      <Modal title="Ghi nhận hoàn tiền" open={refundOpen} onCancel={() => setRefundOpen(false)} okText="Xác nhận đã hoàn tiền" okButtonProps={{ loading: acting }}
        onOk={async () => { if (await act('refund', { refund_ref: refundRef, restock })) setRefundOpen(false); }}>
        {selected && (
          <div className="space-y-3">
            <RefundTransferNote sourceId={selected.id} amount={selected.refund_amount} />
            <p className="text-sm">Tài khoản khách: <b>{selected.bank_name} · {selected.bank_account} · {selected.bank_holder}</b></p>
            <Input placeholder="Mã giao dịch chuyển khoản" maxLength={50} value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />
            <Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)}>
              Nhập lại kho (chỉ chọn khi sản phẩm còn nguyên vẹn, bán lại được)
            </Checkbox>
          </div>
        )}
      </Modal>

      <Modal title="Đổi hàng cho khách" open={exchangeOpen} onCancel={() => setExchangeOpen(false)} okText="Tạo đơn giao hàng đổi" okButtonProps={{ loading: acting, disabled: exchangeValue > returnedValue }}
        onOk={async () => { if (await act('exchange', { items: exchangeLines, restock })) setExchangeOpen(false); }}>
        {selected && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {hasSale(selected) ? 'Hàng khuyến mãi: chỉ đổi đúng sản phẩm và số lượng khách đã trả.' : 'Mặc định đổi đúng sản phẩm. Hết hàng thì chọn sản phẩm khác, tổng giá trị không vượt giá trị hàng trả.'}
            </p>
            {exchangeLines.map((l, idx) => (
              <Space key={idx} className="w-full" align="center">
                <select className="border rounded px-2 py-1 text-sm" style={{ width: 330 }} disabled={hasSale(selected)} value={l.product_id}
                  onChange={(e) => setExchangeLines(exchangeLines.map((x, i) => (i === idx ? { ...x, product_id: e.target.value } : x)))}>
                  {[...selected.items.map((i) => ({ id: i.product_id, name: i.name })), ...products.filter((p) => !selected.items.some((i) => i.product_id === p.id))]
                    .map((p) => <option key={p.id} value={p.id}>{p.name}{p.stock_quantity != null ? ` (còn ${p.stock_quantity})` : ''}</option>)}
                </select>
                <Input type="number" min={1} style={{ width: 70 }} disabled={hasSale(selected)} value={l.quantity}
                  onChange={(e) => setExchangeLines(exchangeLines.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
              </Space>
            ))}
            <p className={`text-sm ${exchangeValue > returnedValue ? 'text-red-600' : 'text-slate-600'}`}>
              Giá trị hàng đổi: <b>{vnd(exchangeValue)}</b> / hàng khách trả: <b>{vnd(returnedValue)}</b>{exchangeValue > returnedValue ? ' (vượt, hãy chọn lại)' : ''}
            </p>
            <Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)}>
              Nhập lại kho hàng khách trả (chỉ chọn khi còn nguyên vẹn, bán lại được)
            </Checkbox>
          </div>
        )}
      </Modal>

      <Modal title="Chuyển sang hoàn tiền" open={toRefundOpen} onCancel={() => setToRefundOpen(false)} okText="Chuyển sang hoàn tiền" okButtonProps={{ loading: acting }}
        onOk={async () => { if (await act('to-refund', bank)) setToRefundOpen(false); }}>
        <p className="text-sm text-slate-500 mb-2">Chỉ dùng khi không còn hàng để đổi và khách đồng ý nhận tiền. Nhập tài khoản khách cung cấp.</p>
        <div className="space-y-2">
          <Input placeholder="Ngân hàng" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
          <Input placeholder="Số tài khoản" value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} />
          <Input placeholder="Tên chủ tài khoản" value={bank.bank_holder} onChange={(e) => setBank({ ...bank, bank_holder: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
