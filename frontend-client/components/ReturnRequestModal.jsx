import React, { useEffect, useState } from 'react';
import { X, ImagePlus, Trash2 } from 'lucide-react';
import axios from 'axios';

const API = '/api';
const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

// Hộp thoại khách gửi yêu cầu hoàn/trả cho đơn đã nhận (quy định lấy từ server để luôn khớp khi kiểm tra)
export default function ReturnRequestModal({ order, token, onClose, onCreated }) {
  const [policy, setPolicy] = useState(null);
  const [qty, setQty] = useState({}); // { order_detail_id: số lượng trả }
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [bank, setBank] = useState({ bank_name: '', bank_account: '', bank_holder: '' });
  const [agree, setAgree] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API}/commerce/returns/policy`).then((res) => setPolicy(res.data.data)).catch(() => setError('Không tải được quy định hoàn trả'));
  }, []);

  const details = order.OrderDetails || [];
  const maxImages = policy?.max_images || 5;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, maxImages - images.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    const uploaded = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await axios.post(`${API}/media/upload`, formData, { headers: { Authorization: `Bearer ${token}` } });
        uploaded.push(res.data.url);
      } catch (err) {
        setError(err.response?.data?.message || `Không tải được ảnh ${file.name}`);
      }
    }
    setImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    setError('');
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([order_detail_id, quantity]) => ({ order_detail_id, quantity }));
    if (!items.length) return setError('Chọn ít nhất một sản phẩm cần hoàn trả');
    if (!reason) return setError('Chọn lý do hoàn trả');
    if (description.trim().length < 20) return setError('Mô tả tình trạng sản phẩm ít nhất 20 ký tự');
    if (!images.length) return setError('Cần ít nhất 1 ảnh chụp sản phẩm làm bằng chứng');
    if (!bank.bank_name.trim() || !bank.bank_holder.trim() || !/^\d{6,20}$/.test(bank.bank_account.replace(/\s/g, ''))) {
      return setError('Điền đủ thông tin nhận hoàn tiền (số tài khoản 6 - 20 chữ số)');
    }
    if (!agree) return setError('Bạn cần đồng ý với quy định hoàn trả');

    setSubmitting(true);
    try {
      await axios.post(`${API}/commerce/returns`, {
        order_id: order.id, items, reason, description: description.trim(), images, ...bank, agree,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi được yêu cầu, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg text-slate-800">Yêu cầu hoàn / trả hàng</h3>
            <p className="text-sm text-slate-500">Đơn #{order.id.substring(0, 8).toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">Quy định hoàn trả</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Gửi yêu cầu trong {policy?.window_days || 7} ngày kể từ khi nhận hàng; mỗi đơn chỉ được yêu cầu một lần.</li>
            <li>Chỉ nhận hoàn trả khi sản phẩm lỗi, hư hỏng, giao sai hoặc hết hạn. Không nhận trả vì đổi ý (mỹ phẩm là hàng vệ sinh cá nhân).</li>
            <li>Sản phẩm còn đủ hộp, tem, phụ kiện; chưa qua sử dụng (trừ lỗi chỉ phát hiện khi mở).</li>
            <li>GlowSkin gửi GHN đến lấy hàng tại địa chỉ nhận hàng, phí vận chuyển do GlowSkin chịu.</li>
            <li>Hoàn tiền qua chuyển khoản sau khi kho nhận và kiểm tra đạt: giá sản phẩm trả lại trừ phần voucher đã giảm; trả toàn bộ đơn được hoàn cả phí ship. Voucher đã dùng không được hoàn lại.</li>
            <li>Hàng nhận về không đúng mô tả hoặc không đạt điều kiện, yêu cầu sẽ bị từ chối.</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-sm text-slate-700 mb-2">1. Sản phẩm cần trả</p>
          <div className="space-y-2">
            {details.map((d) => (
              <div key={d.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-700">{d.Product?.name || 'Sản phẩm'} <span className="text-slate-400">({formatVnd(d.price)})</span></span>
                <select className="select select-bordered select-sm" value={qty[d.id] || 0}
                  onChange={(e) => setQty({ ...qty, [d.id]: Number(e.target.value) })}>
                  {Array.from({ length: d.quantity + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? 'Không trả' : `Trả ${n}/${d.quantity}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="font-semibold text-sm text-slate-700 mb-2">2. Lý do và tình trạng</p>
          <select className="select select-bordered select-sm w-full mb-2" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">-- Chọn lý do --</option>
            {Object.entries(policy?.reasons || {}).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <textarea className="textarea textarea-bordered w-full h-20 text-sm" maxLength={1000}
            placeholder="Mô tả cụ thể tình trạng sản phẩm (ít nhất 20 ký tự)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <p className="font-semibold text-sm text-slate-700 mb-2">3. Ảnh bằng chứng ({images.length}/{maxImages})</p>
          <div className="flex flex-wrap gap-2">
            {images.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border" />
                <button onClick={() => setImages(images.filter((u) => u !== url))} className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < maxImages && (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-slate-400 cursor-pointer hover:border-teal-400">
                {uploading ? <span className="loading loading-spinner loading-sm"></span> : <ImagePlus className="w-5 h-5" />}
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={uploading} onChange={handleUpload} />
              </label>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Chụp rõ sản phẩm, tem nhãn, hạn sử dụng và chỗ bị lỗi.</p>
        </div>

        <div>
          <p className="font-semibold text-sm text-slate-700 mb-2">4. Tài khoản nhận hoàn tiền</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input input-bordered input-sm" placeholder="Ngân hàng" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
            <input className="input input-bordered input-sm" placeholder="Số tài khoản" inputMode="numeric" value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} />
            <input className="input input-bordered input-sm col-span-2 uppercase" placeholder="Tên chủ tài khoản" value={bank.bank_holder} onChange={(e) => setBank({ ...bank, bank_holder: e.target.value })} />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" className="checkbox checkbox-sm checkbox-primary mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Tôi xác nhận thông tin trên là đúng sự thật và đồng ý với quy định hoàn trả của GlowSkin.</span>
        </label>

        {error && <div className="alert alert-error text-sm py-2">{error}</div>}

        <button onClick={handleSubmit} disabled={submitting || uploading || !policy} className="btn btn-primary w-full">
          {submitting ? <span className="loading loading-spinner loading-sm"></span> : 'Gửi yêu cầu hoàn trả'}
        </button>
      </div>
    </div>
  );
}
