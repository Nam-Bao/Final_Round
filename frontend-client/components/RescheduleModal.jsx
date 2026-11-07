import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';

// Khách tự đổi lịch: chọn ngày rồi chọn giờ còn trống. fetchSlots(date) trả [{ time, available }], onSubmit(date, time) ném lỗi nếu server từ chối
export default function RescheduleModal({ title, onClose, fetchSlots, onSubmit }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setTime('');
    setError('');
    if (!date) return setSlots([]);
    let active = true;
    setLoading(true);
    fetchSlots(date)
      .then((list) => { if (active) setSlots(list); })
      .catch(() => { if (active) setSlots([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSubmit(date, time);
    } catch (err) {
      setError(err.response?.data?.message || 'Không đổi được lịch, vui lòng thử lại');
      setSaving(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="modal modal-open" role="dialog">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Xác nhận đổi lịch</h3>
          <p className="py-3">Lịch mới của bạn: <b>{time} ngày {dayjs(date).format('DD/MM/YYYY')}</b></p>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Mỗi lịch chỉ được đổi 1 lần. Sau khi xác nhận, bạn không thể đổi lịch này thêm lần nữa.</p>
          <div className="modal-action">
            <button className="btn" disabled={saving} onClick={() => setConfirming(false)}>Chọn lại</button>
            <button className="btn btn-primary" disabled={saving} onClick={submit}>Xác nhận đổi lịch</button>
          </div>
        </div>
        <div className="modal-backdrop"></div>
      </div>
    );
  }

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">Bạn được đổi lịch 1 lần, không mất cọc. Sau khi đổi không thể đổi thêm.</p>
        <input type="date" className="input input-bordered w-full mt-4" min={dayjs().add(1, 'day').format('YYYY-MM-DD')} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="mt-3 min-h-[3rem]">
          {!date ? <p className="text-sm text-slate-500 italic">Chọn ngày để xem giờ trống.</p>
            : loading ? <span className="loading loading-spinner text-primary"></span>
              : !slots.some((s) => s.available) ? <p className="text-sm text-slate-500 italic">Ngày này không còn giờ trống, vui lòng chọn ngày khác.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button key={s.time} type="button" disabled={!s.available} onClick={() => setTime(s.time)}
                        className={`btn btn-sm gap-1 ${!s.available ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed opacity-70' : time === s.time ? 'btn-success text-white' : 'btn-outline border-gray-300'}`}>
                        <Clock className="w-3 h-3" /> {s.time}
                      </button>
                    ))}
                  </div>
                )}
        </div>
        {error && <p className="text-sm text-error mt-2">{error}</p>}
        <div className="modal-action">
          <button className="btn" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" disabled={!time} onClick={() => setConfirming(true)}>Đổi lịch</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
