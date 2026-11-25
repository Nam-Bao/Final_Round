// Khách tự hủy đơn mỹ phẩm chưa giao cho GHN.
// Đã chuyển khoản: chọn hoàn tiền về tài khoản (CSKH chuyển khoản) hoặc hoàn Điểm GlowSkin tương đương (1:1, nhận ngay).
// Trả bằng điểm: luôn hoàn lại điểm. COD / chưa trả tiền: hủy luôn.
import { useState } from 'react';
import axios from 'axios';

const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export default function CancelOrderModal({ order, token, pointValue = 100, onClose, onDone }) {
  const paidMoney = order.payment_method === 'VIETQR_SEPAY' && order.status !== 'UNPAID';
  const paidPoints = order.payment_method === 'POINTS';
  const amount = Number(order.total_amount) - Number(order.discount_amount || 0) + Number(order.shipping_fee || 0);
  const [method, setMethod] = useState('POINTS');
  const [reason, setReason] = useState('');
  const [bank, setBank] = useState({ bank_name: '', bank_account: '', bank_holder: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body = { reason: reason.trim() || undefined, ...(paidMoney ? { refund_method: method, ...(method === 'MONEY' ? bank : {}) } : {}) };
      const res = await axios.put(`/api/commerce/orders/${order.id}/cancel`, body, { headers: { Authorization: `Bearer ${token}` } });
      onDone(res.data.message);
    } catch (e) { setError(e.response?.data?.message || 'Không hủy được đơn, vui lòng thử lại'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg">Hủy đơn #{order.id.substring(0, 8).toUpperCase()}</h3>
        {paidPoints && <p className="text-sm text-slate-600">Đơn trả bằng điểm: bạn được hoàn lại <b>{Number(order.points_used || 0).toLocaleString('vi-VN')} Điểm GlowSkin</b> ngay sau khi hủy.</p>}
        {!paidMoney && !paidPoints && <p className="text-sm text-slate-600">Đơn chưa thanh toán nên không phát sinh hoàn tiền.</p>}
        {paidMoney && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Bạn đã chuyển khoản <b>{vnd(amount)}</b>. Chọn cách nhận lại:</p>
            <label className={`flex gap-3 p-3 border rounded-xl cursor-pointer ${method === 'POINTS' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" className="radio radio-primary radio-sm mt-0.5" checked={method === 'POINTS'} onChange={() => setMethod('POINTS')} />
              <span className="text-sm"><b>Hoàn {Math.floor(amount / pointValue).toLocaleString('vi-VN')} Điểm GlowSkin</b> (nhận ngay)<br /><span className="text-slate-500">Dùng mua mỹ phẩm, trả cọc lịch khám / tư vấn. Hạn dùng 12 tháng, không đổi ra tiền mặt.</span></span>
            </label>
            <label className={`flex gap-3 p-3 border rounded-xl cursor-pointer ${method === 'MONEY' ? 'border-primary bg-primary/5' : ''}`}>
              <input type="radio" className="radio radio-primary radio-sm mt-0.5" checked={method === 'MONEY'} onChange={() => setMethod('MONEY')} />
              <span className="text-sm"><b>Hoàn tiền về tài khoản</b><br /><span className="text-slate-500">CSKH chuyển khoản trong giờ làm việc, tiền về 1 - 3 ngày.</span></span>
            </label>
            {method === 'MONEY' && (
              <div className="grid gap-2">
                <input className="input input-bordered input-sm" placeholder="Ngân hàng (VD: Vietcombank)" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
                <input className="input input-bordered input-sm" placeholder="Số tài khoản" inputMode="numeric" value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} />
                <input className="input input-bordered input-sm" placeholder="Tên chủ tài khoản" value={bank.bank_holder} onChange={(e) => setBank({ ...bank, bank_holder: e.target.value })} />
              </div>
            )}
          </div>
        )}
        <input className="input input-bordered input-sm w-full" maxLength={500} placeholder="Lý do hủy (không bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs text-slate-500">Mã giảm giá đã dùng cho đơn không được trả lại khi bạn tự hủy.</p>
        {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Không hủy</button>
          <button className="btn btn-sm btn-error text-white" disabled={busy} onClick={submit}>{busy ? 'Đang hủy...' : 'Xác nhận hủy đơn'}</button>
        </div>
      </div>
    </div>
  );
}
