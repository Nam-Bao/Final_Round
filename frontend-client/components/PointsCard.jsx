// Hồ sơ cá nhân: Điểm GlowSkin (số dư + lịch sử). Điểm có từ cọc của lịch hủy đúng hạn, dùng để trả cọc lần đặt sau.
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Coins } from 'lucide-react';

export default function PointsCard() {
  const [data, setData] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch('/api/booking/points/me', { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d.data)).catch(() => {});
  }, []);

  if (!data) return null;
  const rows = showAll ? data.history : data.history.slice(0, 5);
  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 p-4 sm:p-6">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-2"><Coins className="text-amber-500" /> Điểm GlowSkin</h2>
      <p className="text-3xl font-extrabold text-amber-600">{data.balance.toLocaleString('vi-VN')} <span className="text-base font-semibold">điểm</span></p>
      <p className="text-sm text-base-content/60 mb-3">Tương đương {data.balance_vnd.toLocaleString('vi-VN')}đ (1 điểm = {data.value_vnd}đ). Dùng để trả cọc lịch khám hoặc phí tư vấn chuyên gia, không đổi ra tiền mặt.</p>
      <ul className="text-xs text-base-content/60 list-disc pl-4 mb-3 space-y-0.5">
        <li>Tự hủy lịch trước giờ hẹn từ 24 giờ: tiền cọc đổi thành điểm.</li>
        <li>Phòng khám hủy lịch: chọn nhận lại tiền hoặc nhận điểm (cộng thêm {data.clinic_refund_bonus_percent}%).</li>
      </ul>
      {data.history.length === 0 ? (
        <p className="text-sm text-base-content/50 italic">Chưa có điểm nào.</p>
      ) : (
        <>
          <ul className="divide-y divide-base-200 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex justify-between gap-3">
                <span>
                  <span className="font-medium">{r.type_label}</span>
                  <span className="block text-xs text-base-content/50">{dayjs(r.created_at).format('HH:mm DD/MM/YYYY')}{r.note ? ` · ${r.note}` : ''}</span>
                </span>
                <span className={`font-bold whitespace-nowrap ${r.delta > 0 ? 'text-success' : 'text-error'}`}>{r.delta > 0 ? '+' : ''}{r.delta.toLocaleString('vi-VN')}</span>
              </li>
            ))}
          </ul>
          {data.history.length > 5 && (
            <button type="button" className="btn btn-ghost btn-xs mt-2" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Thu gọn' : `Xem tất cả (${data.history.length})`}</button>
          )}
        </>
      )}
    </div>
  );
}
