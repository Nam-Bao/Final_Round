import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { MessagesSquare, Star, Briefcase, Clock, Calendar, Info, Video, IdCard } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import DoctorProfileModal from '../components/DoctorProfileModal';
import { CONSULT_FIELDS, CONSULT_DEPOSIT, CREDIT_VALID_DAYS, formatVnd } from '../utils/consult';

const API = 'http://localhost:4000/api';
// Chuyên gia không nhất thiết là bác sĩ => không tự thêm "BS."
const expertName = (e) => (e.title ? `${e.title} ${e.full_name}` : e.full_name);

export default function ConsultationBookingPage() {
  const token = useAuthStore((state) => state.token);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [field, setField] = useState('DERMATOLOGY');
  const [experts, setExperts] = useState([]);
  const [stats, setStats] = useState({});
  const [expert, setExpert] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [time, setTime] = useState('');
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Danh sách chuyên gia (tất cả lĩnh vực) + điểm đánh giá thật từ các buổi tư vấn đã hoàn thành
  useEffect(() => {
    Promise.all([
      axios.get(`${API}/identity/users/experts/public`),
      axios.get(`${API}/booking/consultations/expert-stats`).catch(() => ({ data: { data: {} } })),
    ]).then(([e, s]) => {
      const list = e.data.data || [];
      setExperts(list);
      setStats(s.data.data || {});
      // Đi từ popup hồ sơ chuyên gia (?expert=) => chọn sẵn
      const preset = list.find((x) => x.id === searchParams.get('expert'));
      if (preset) { setField(preset.consult_field); setExpert(preset); }
    }).catch(() => setExperts([]));
  }, [searchParams]);

  const fieldExperts = useMemo(() => experts.filter((e) => e.consult_field === field), [experts, field]);

  // Giờ trống theo chuyên gia + ngày
  useEffect(() => {
    setTime('');
    if (!expert || !date) return setSlots([]);
    setSlotsLoading(true);
    axios.get(`${API}/booking/consultations/slots`, { params: { expert_id: expert.id, date } })
      .then((res) => setSlots(res.data.data || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [expert, date]);

  const chooseField = (key) => {
    setField(key);
    if (expert?.consult_field !== key) setExpert(null);
  };

  const handleSubmit = async () => {
    setError('');
    if (!expert || !time) return setError('Vui lòng chọn chuyên gia và giờ tư vấn');
    if (question.trim().length < 10) return setError('Vui lòng mô tả vấn đề cần tư vấn (ít nhất 10 ký tự) để chuyên gia chuẩn bị trước');
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/booking/consultations`, {
        expert_id: expert.id, appointment_date: date, appointment_time: time, question: question.trim(),
      }, { headers: { Authorization: `Bearer ${token}` } });
      navigate(`/payment/tu-van/${res.data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Không đặt được lịch tư vấn, vui lòng thử lại');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MessagesSquare className="text-primary" /> Đặt Lịch Tư Vấn Chuyên Gia
        </h1>
        <p className="text-base-content/60 mt-1">
          Gặp chuyên gia qua video call để được hỏi đáp và định hướng. Tư vấn không thay thế buổi khám:
          cần chẩn đoán, kê đơn hay làm liệu trình, vui lòng <Link to="/booking" className="link link-primary">đặt lịch khám bác sĩ</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* 1. Lĩnh vực */}
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
            <h2 className="font-bold text-lg mb-4">1. Chọn lĩnh vực tư vấn</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {Object.entries(CONSULT_FIELDS).map(([key, f]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseField(key)}
                  className={`text-left p-4 rounded-xl border transition-colors ${field === key ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'}`}
                >
                  <p className="font-bold">{f.label}</p>
                  <p className="text-xs text-base-content/60 mt-1">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Chuyên gia */}
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
            <h2 className="font-bold text-lg mb-4">2. Chọn chuyên gia</h2>
            {fieldExperts.length === 0 ? (
              <p className="text-base-content/60 italic">Hiện chưa có chuyên gia {CONSULT_FIELDS[field].label.toLowerCase()} nhận tư vấn. Vui lòng chọn lĩnh vực khác hoặc quay lại sau.</p>
            ) : (
              <div className="space-y-3">
                {fieldExperts.map((e) => {
                  const st = stats[e.id];
                  return (
                    <div
                      key={e.id}
                      onClick={() => setExpert(e)}
                      className={`p-4 rounded-xl border cursor-pointer flex items-center gap-4 ${expert?.id === e.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}
                    >
                      {e.avatar ? (
                        <img src={e.avatar} alt={e.full_name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-xl shrink-0">{e.full_name.split(' ').pop()?.charAt(0)}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold">{expertName(e)}</p>
                        <p className="text-xs text-base-content/60 truncate">
                          {e.specialty || 'Chuyên gia tư vấn'}
                          {e.experience_years != null && <> · <Briefcase className="w-3 h-3 inline" /> {e.experience_years} năm kinh nghiệm</>}
                        </p>
                        <p className="text-sm opacity-70 flex items-center gap-1">
                          {st?.review_count ? <><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {st.avg_rating} · {st.review_count} đánh giá</> : 'Chưa có đánh giá'}
                        </p>
                      </div>
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); setProfileId(e.id); }} className="btn btn-ghost btn-xs text-primary gap-1 shrink-0">
                        <IdCard className="w-3.5 h-3.5" /> Hồ sơ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Ngày giờ */}
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
            <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Calendar className="w-5 h-5" /> 3. Chọn ngày & giờ</h2>
            <input type="date" className="input input-bordered w-full sm:w-64" value={date} min={dayjs().format('YYYY-MM-DD')} onChange={(e) => setDate(e.target.value)} />
            <div className="mt-4">
              {!expert ? (
                <p className="text-sm text-base-content/60 italic">Chọn chuyên gia để xem giờ trống.</p>
              ) : slotsLoading ? (
                <span className="loading loading-spinner text-primary"></span>
              ) : slots.length === 0 ? (
                <p className="text-sm text-base-content/60 italic">Chuyên gia không nhận tư vấn ngày này, vui lòng chọn ngày khác.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setTime(s.time)}
                      title={s.available ? 'Bấm để chọn giờ này' : 'Giờ này đã có người đặt hoặc đã qua'}
                      className={`btn btn-sm gap-1 ${!s.available ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed opacity-70' : time === s.time ? 'btn-success text-white' : 'btn-outline border-gray-300'}`}
                    >
                      <Clock className="w-3 h-3" /> {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Vấn đề cần tư vấn */}
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
            <h2 className="font-bold text-lg mb-2">4. Bạn cần tư vấn điều gì?</h2>
            <p className="text-sm text-base-content/60 mb-3">Chuyên gia đọc trước để chuẩn bị. Mô tả càng rõ (tình trạng, đã dùng sản phẩm gì, mong muốn) buổi tư vấn càng hiệu quả.</p>
            <textarea
              className="textarea textarea-bordered w-full h-32"
              maxLength={2000}
              placeholder="VD: Da em dầu, hay nổi mụn ở cằm trước kỳ kinh, đang dùng sữa rửa mặt... Em nên chăm sóc và ăn uống thế nào?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <p className="text-xs text-right text-base-content/50">{question.length}/2000</p>
          </div>
        </div>

        {/* Tóm tắt */}
        <div className="md:col-span-1">
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200 sticky top-24 space-y-4">
            <h2 className="font-bold text-lg">Tóm tắt lịch tư vấn</h2>
            <div className="text-sm space-y-2">
              <p>Lĩnh vực: <b>{CONSULT_FIELDS[field].label}</b></p>
              <p>Chuyên gia: <b>{expert ? expertName(expert) : '—'}</b></p>
              <p>Thời gian: <b>{time ? `${time} - ${dayjs(date).format('DD/MM/YYYY')}` : '—'}</b></p>
              <p className="flex items-center gap-1"><Video className="w-4 h-4 text-info" /> Hình thức: <b>Video call trên website</b></p>
            </div>
            <div className="border-t pt-3 flex justify-between font-bold text-lg">
              <span>Đặt cọc:</span><span className="text-primary">{formatVnd(CONSULT_DEPOSIT)}</span>
            </div>
            <div className="bg-info/10 border border-info/30 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1"><Info className="w-4 h-4" /> Quy định tiền cọc</p>
              <p>• Được trừ vào phí khám nếu bạn đặt lịch khám trong {CREDIT_VALID_DAYS} ngày sau buổi tư vấn.</p>
              <p>• Không vào phòng đúng giờ hoặc tự hủy lịch: mất cọc.</p>
              <p>• Chuyên gia vắng mặt hoặc phòng khám hủy lịch: hoàn cọc 100%.</p>
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <button type="button" onClick={handleSubmit} disabled={!expert || !time || submitting} className="btn btn-primary w-full">
              {submitting ? <span className="loading loading-spinner"></span> : 'Đặt cọc & xác nhận'}
            </button>
          </div>
        </div>
      </div>

      {profileId && (
        <DoctorProfileModal
          kind="expert"
          doctorId={profileId}
          onClose={() => setProfileId(null)}
          onBook={(d) => { setExpert(experts.find((x) => x.id === d.id) || null); setProfileId(null); }}
        />
      )}
    </div>
  );
}
