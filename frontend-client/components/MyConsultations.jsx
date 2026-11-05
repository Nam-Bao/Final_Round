import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { MessagesSquare, Calendar, CheckCircle, XCircle, Clock, Star, Gift, Stethoscope, UserX, ShoppingBag } from 'lucide-react';
import VideoCallModal from './VideoCallModal';
import ReviewModal from './ReviewModal';
import RescheduleModal from './RescheduleModal';
import { useAuthStore } from '../store/authStore';
import { formatVnd } from '../utils/consult';

const API = 'http://localhost:4000/api/booking/consultations';
const EXPERTS_API = 'http://localhost:4000/api/identity/users/experts/public';

const STATUS_UI = {
  CONFIRMED: <span className="badge badge-info gap-1 text-white"><Clock className="w-3 h-3" /> Đã đặt cọc</span>,
  COMPLETED: <span className="badge badge-success gap-1 text-white"><CheckCircle className="w-3 h-3" /> Đã tư vấn</span>,
  NO_SHOW: <span className="badge badge-warning gap-1"><UserX className="w-3 h-3" /> Bạn vắng mặt</span>,
  EXPERT_ABSENT: <span className="badge badge-error gap-1 text-white"><XCircle className="w-3 h-3" /> Chuyên gia vắng</span>,
  CANCELLED: <span className="badge badge-error gap-1 text-white"><XCircle className="w-3 h-3" /> Đã hủy</span>,
};

const DEPOSIT_TEXT = {
  FORFEITED: 'Tiền cọc không được hoàn theo chính sách.',
  REFUND_PENDING: 'Phòng khám sẽ hoàn lại tiền cọc cho bạn.',
  REFUNDED: 'Đã hoàn tiền cọc.',
};

const firstImage = (v) => {
  if (Array.isArray(v)) return v[0];
  try { return JSON.parse(v)?.[0] || v; } catch { return v; }
};

// Kết quả buổi tư vấn chuyên gia gửi cho khách
function ConsultResult({ c }) {
  const r = c.result;
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
      <p className="font-semibold text-secondary">Kết quả tư vấn</p>
      {r ? (
        <div className="space-y-2 text-sm text-slate-700 whitespace-pre-line">
          <p><span className="font-medium">Nhận định tình trạng:</span> {r.assessment}</p>
          <p><span className="font-medium">Lời khuyên chăm sóc:</span> {r.advice}</p>
          {r.lifestyle && <p><span className="font-medium">Ăn uống, sinh hoạt:</span> {r.lifestyle}</p>}
          {r.follow_up && <p><span className="font-medium">Hẹn theo dõi:</span> {r.follow_up}</p>}
        </div>
      ) : <p className="text-sm text-slate-700 whitespace-pre-line">{c.expert_note}</p>}
      {r?.products?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1"><ShoppingBag className="w-4 h-4" /> Sản phẩm chuyên gia gợi ý</p>
          {r.products.map((p) => (
            <Link key={p.product_id} to={`/shops/${p.slug || p.product_id}`} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-2 hover:border-primary/40">
              {p.image_url && <img src={firstImage(p.image_url)} alt={p.name} className="w-12 h-12 rounded object-cover shrink-0" />}
              <span className="min-w-0 text-sm">
                <span className="font-semibold block truncate">{p.name} x{p.quantity}</span>
                <span className="text-slate-500 block">{p.usage}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {c.recommend_exam && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <p className="text-sm font-medium text-orange-700 flex items-center gap-1"><Stethoscope className="w-4 h-4" /> Chuyên gia khuyên bạn nên đặt lịch khám với bác sĩ da liễu.</p>
          <Link to="/booking" className="btn btn-sm btn-primary">Đặt lịch khám</Link>
        </div>
      )}
    </div>
  );
}

// Lịch tư vấn chuyên gia của khách (hiển thị trong Sổ lịch hẹn)
export default function MyConsultations() {
  const [avatars, setAvatars] = useState({});
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [videoId, setVideoId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const headers = { Authorization: `Bearer ${token}` };

  const fetchList = () =>
    axios.get(`${API}/mine`, { headers })
      .then((res) => setList(res.data.data || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));

  useEffect(() => { fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  // Ảnh chuyên gia (công khai); lỗi hoặc chuyên gia đã ngừng hoạt động thì hiện biểu tượng thay thế
  useEffect(() => {
    axios.get(EXPERTS_API)
      .then((res) => setAvatars(Object.fromEntries((res.data.data || []).map((e) => [e.id, e.avatar]))))
      .catch(() => setAvatars({}));
  }, []);

  // Khách vào phòng từ đúng giờ hẹn đến khi phòng đóng (server kiểm tra lại)
  const handleJoin = (c) => {
    const now = dayjs();
    if (now.isBefore(dayjs(c.room_opens_at))) {
      return setNotice({ title: 'Chưa đến giờ hẹn', message: `Buổi tư vấn bắt đầu lúc ${c.appointment_time} ngày ${dayjs(c.appointment_date).format('DD/MM/YYYY')}. Vui lòng quay lại đúng giờ.` });
    }
    if (now.isAfter(dayjs(c.room_closes_at))) {
      return setNotice({ title: 'Đã quá giờ tư vấn', message: 'Phòng tư vấn của lịch này đã đóng.' });
    }
    setVideoId(c.id);
  };

  // Khách tự hủy => mất cọc (cùng quy định với lịch khám)
  const handleCancel = async (c) => {
    if (!window.confirm(`Hủy lịch tư vấn này bạn sẽ MẤT ${formatVnd(c.deposit_amount)} tiền cọc, tiền cọc không được hoàn lại.\n\nBạn vẫn muốn hủy?`)) return;
    try {
      const res = await axios.put(`${API}/${c.id}/cancel`, { accept_forfeit: true }, { headers });
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể hủy lịch tư vấn');
    }
    fetchList();
  };

  const handleReview = async ({ rating, comment }) => {
    await axios.post(`${API}/${reviewing.id}/review`, { rating, comment }, { headers });
    setReviewing(null);
    fetchList();
  };

  const fetchSlots = (date) => axios.get(`${API}/slots`, { params: { expert_id: rescheduling.expert_id, date } }).then((res) => res.data.data || []);
  const handleReschedule = async (appointment_date, appointment_time) => {
    await axios.put(`${API}/${rescheduling.id}/reschedule`, { appointment_date, appointment_time }, { headers });
    setRescheduling(null);
    fetchList();
  };

  if (loading || list.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
        <MessagesSquare className="text-primary" /> Lịch Tư Vấn Chuyên Gia
      </h2>

      {list.map((c) => {
        const canCancel = c.status === 'CONFIRMED' && dayjs().isBefore(dayjs(c.room_opens_at));
        const canJoin = c.status === 'CONFIRMED' || (c.status === 'COMPLETED' && dayjs().isBefore(dayjs(c.room_closes_at)));
        return (
          <div key={c.id} className="card bg-white shadow-sm border border-slate-200 p-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg text-slate-800">TƯ VẤN {c.consult_field_label.toUpperCase()}</span>
                  {STATUS_UI[c.status]}
                </div>
                <div className="flex items-center gap-2">
                  {avatars[c.expert_id]
                    ? <img src={avatars[c.expert_id]} alt={c.expert_name} className="w-9 h-9 rounded-full object-cover border border-base-200 shrink-0" />
                    : <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Stethoscope className="w-4 h-4" /></div>}
                  <p className="font-bold text-blue-800">{c.expert_name}</p>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2"><span className="font-medium">Câu hỏi:</span> {c.question}</p>
                {c.status === 'CANCELLED' && (
                  <p className="text-sm text-error">
                    {c.cancel_initiator === 'CLINIC' ? 'Phòng khám đã hủy lịch' : 'Bạn đã hủy lịch'}{c.cancel_reason ? `: ${c.cancel_reason}` : ''}. {DEPOSIT_TEXT[c.deposit_outcome] || ''}
                  </p>
                )}
                {['NO_SHOW', 'EXPERT_ABSENT'].includes(c.status) && <p className="text-sm text-slate-600">{DEPOSIT_TEXT[c.deposit_outcome]}</p>}
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm min-w-[220px]">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Thời gian:</span>
                  <span className="font-bold flex items-center gap-1"><Calendar className="w-4 h-4 text-primary" /> {c.appointment_time} - {dayjs(c.appointment_date).format('DD/MM/YYYY')}</span>
                </p>
                <p className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-slate-500">Đã cọc:</span><span className="font-bold">{formatVnd(c.deposit_amount)}</span>
                </p>
              </div>
            </div>

            {(c.result || c.expert_note) && <ConsultResult c={c} />}
            {c.awaiting_result && <p className="text-sm text-slate-600">Chuyên gia đang hoàn tất kết quả, bạn sẽ xem được tại đây chậm nhất 24 giờ sau buổi tư vấn.</p>}
            {c.credit_available && (
              <p className="text-sm text-success flex items-center gap-1">
                <Gift className="w-4 h-4" /> {formatVnd(c.deposit_amount)} tiền cọc sẽ được trừ vào phí khám nếu bạn đặt lịch khám trước {dayjs(c.credit_expires_at).format('DD/MM/YYYY')}.
              </p>
            )}
            {c.credit_used && <p className="text-sm text-slate-500">Tiền cọc buổi tư vấn đã được trừ vào phí khám.</p>}

            <div className="flex flex-wrap gap-2 justify-end">
              {canJoin && (
                <button onClick={() => handleJoin(c)} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white">🎥 Vào phòng tư vấn</button>
              )}
              {c.can_reschedule && <button onClick={() => setRescheduling(c)} className="btn btn-sm btn-outline">Đổi lịch</button>}
              {canCancel && <button onClick={() => handleCancel(c)} className="btn btn-sm btn-error btn-outline">Hủy lịch</button>}
              {c.status === 'COMPLETED' && (c.rating ? (
                <span className="btn btn-sm btn-ghost text-amber-500 no-animation cursor-default gap-1"><Star className="w-4 h-4 fill-current" /> Đã đánh giá {c.rating}/5</span>
              ) : (
                <button onClick={() => setReviewing(c)} className="btn btn-sm btn-outline btn-warning gap-1"><Star className="w-4 h-4" /> Đánh giá chuyên gia</button>
              ))}
            </div>
          </div>
        );
      })}

      <VideoCallModal
        kind="consultation"
        isOpen={!!videoId}
        appointmentId={videoId}
        onClose={() => { setVideoId(null); fetchList(); }}
        userName={user?.Profile?.full_name || user?.full_name || 'Khách hàng GlowSkin'}
      />
      {rescheduling && <RescheduleModal title={`Đổi lịch tư vấn với ${rescheduling.expert_name}`} onClose={() => setRescheduling(null)} fetchSlots={fetchSlots} onSubmit={handleReschedule} />}
      <ReviewModal
        isOpen={!!reviewing}
        title="Đánh giá chuyên gia tư vấn"
        subtitle={reviewing?.expert_name}
        onClose={() => setReviewing(null)}
        onSubmit={handleReview}
      />
      {notice && (
        <div className="modal modal-open" role="dialog">
          <div className="modal-box">
            <h3 className="font-bold text-lg">{notice.title}</h3>
            <p className="py-4">{notice.message}</p>
            <div className="modal-action"><button className="btn" onClick={() => setNotice(null)}>Đã hiểu</button></div>
          </div>
          <div className="modal-backdrop" onClick={() => setNotice(null)}></div>
        </div>
      )}
    </div>
  );
}
