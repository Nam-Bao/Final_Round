import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { BellRing, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const DISMISS_KEY = 'reminder_dismissed';

// Nhắc lịch khám / tư vấn trong 24 giờ tới + kết quả soi da bác sĩ vừa xem lại. Đóng thì ẩn tới khi mở lại trình duyệt
export default function ReminderBanner() {
  const token = useAuthStore((state) => state.token);
  const [items, setItems] = useState([]);
  const [reviewed, setReviewed] = useState(0); // số lượt soi da bác sĩ đã xem lại mà khách chưa xem
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    if (!token) return setItems([]);
    axios.get('/api/booking/appointments/my-reminders', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setItems(res.data.data || []))
      .catch(() => setItems([]));
    const loadReviewed = () => axios.get('/api/ai/analyses/mine/unseen', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setReviewed(res.data.data?.count || 0)).catch(() => setReviewed(0));
    loadReviewed();
    window.addEventListener('skin-review-seen', loadReviewed); // khách mở trang lịch sử soi da
    return () => window.removeEventListener('skin-review-seen', loadReviewed);
  }, [token]);

  if ((!items.length && !reviewed) || dismissed) return null;
  const close = () => { sessionStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-3 text-sm text-amber-900">
      <BellRing className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1">
        {reviewed > 0 && (
          <p>
            Bác sĩ đã xem lại <b>{reviewed} lượt soi da</b> của bạn.{' '}
            <Link to="/lich-su-soi-da" className="underline font-semibold">Xem kết quả</Link>
          </p>
        )}
        {items.map((r) => (
          <p key={r.id}>
            Bạn có {r.type === 'EXAM' ? 'lịch khám' : `lịch tư vấn với ${r.expert_name}`} lúc <b>{r.time} ngày {dayjs(r.date).format('DD/MM/YYYY')}</b>.
          </p>
        ))}
        {items.length > 0 && <Link to="/appointments" className="underline font-semibold">Xem Sổ lịch khám</Link>}
      </div>
      <button onClick={close} aria-label="Đóng nhắc lịch"><X className="w-4 h-4" /></button>
    </div>
  );
}
