import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Star, Briefcase, Building2, GraduationCap, Award, ShieldCheck, ClipboardCheck, CalendarCheck, MessageSquare, Sparkles,
} from 'lucide-react';
import { doctorTitle } from '../utils/publicStats';

const API = 'http://localhost:4000/api';
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));

// Tên hiển thị kèm học vị: "ThS.BS Nguyễn Văn A"; chưa có học vị thì "BS. Nguyễn Văn A".
// Tên trong hồ sơ có thể đã kèm "BS." => bỏ đi trước khi gắn học vị để không bị lặp.
export const doctorDisplayName = (doc) => {
  if (!doc?.title) return doctorTitle(doc?.full_name);
  const name = String(doc.full_name || '').replace(/^(BS\.?|Bác sĩ)\s*/i, '');
  return `${doc.title} ${name}`;
};

const Section = ({ icon: Icon, title, children }) => (
  <div className="space-y-2">
    <h3 className="font-bold text-secondary flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" /> {title}
    </h3>
    {children}
  </div>
);

// Popup hồ sơ chuyên môn của 1 bác sĩ / chuyên gia tư vấn: dữ liệu thật (hồ sơ do phòng khám xác minh, lượt khám/tư vấn, đánh giá của khách).
// onBook: có thì nút "Đặt lịch" gọi hàm này (dùng ở trang đặt lịch để chọn luôn), không thì chuyển tới trang đặt lịch.
// kind="expert": số liệu & đánh giá lấy từ lịch tư vấn chuyên gia
export default function DoctorProfileModal({ doctorId, onClose, onBook, kind = 'doctor' }) {
  const isExpert = kind === 'expert';
  const [doctor, setDoctor] = useState(null);
  const [stats, setStats] = useState({ exams: 0, avg: null, count: 0 });
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    let isMounted = true;
    setStatus('loading');
    const id = encodeURIComponent(doctorId);
    Promise.all([
      getJson(`${API}/identity/users/doctors/public/${id}`),
      isExpert ? Promise.resolve({ data: {} }) : getJson(`${API}/booking/stats/public`).catch(() => ({ data: {} })),
      getJson(isExpert ? `${API}/booking/consultations/expert-stats` : `${API}/booking/reviews/doctor-stats`).catch(() => ({ data: {} })),
      getJson(isExpert ? `${API}/booking/consultations/reviews?expert_id=${id}` : `${API}/booking/reviews?doctor_id=${id}`).catch(() => ({ data: [] })),
    ])
      .then(([detail, publicStats, reviewStats, reviewList]) => {
        if (!isMounted) return;
        const rs = reviewStats.data?.[doctorId];
        setDoctor(detail.data);
        setStats({
          exams: isExpert ? rs?.completed || 0 : publicStats.data?.exams_by_doctor?.[doctorId] || 0,
          avg: rs?.avg_rating ?? null,
          count: rs?.review_count || 0,
        });
        setReviews((reviewList.data || []).filter((r) => r.comment).slice(0, 3));
        setStatus('ok');
      })
      .catch(() => isMounted && setStatus('error'));
    return () => { isMounted = false; };
  }, [doctorId, isExpert]);

  // Đóng bằng phím Esc
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true">
      <div className="modal-box max-w-3xl max-h-[90vh] p-0 relative">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 bg-base-100/80"
          aria-label="Đóng"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 overflow-y-auto max-h-[90vh]">
          {status === 'loading' && (
            <div className="flex justify-center py-16"><span className="loading loading-spinner loading-lg text-primary"></span></div>
          )}
          {status === 'error' && (
            <div className="alert alert-error mt-6">Không tải được hồ sơ bác sĩ, vui lòng thử lại sau.</div>
          )}

          {status === 'ok' && doctor && (
            <div className="space-y-6">
              {/* Đầu hồ sơ */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pr-8">
                {doctor.avatar ? (
                  <img src={doctor.avatar} alt={doctor.full_name} className="w-28 h-28 rounded-2xl object-cover border-2 border-primary/30 shrink-0" />
                ) : (
                  <div className="w-28 h-28 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-4xl font-bold shrink-0">
                    {doctor.full_name.split(' ').pop()?.charAt(0)}
                  </div>
                )}
                <div className="text-center sm:text-left space-y-1">
                  <h2 className="text-2xl font-extrabold text-secondary">{doctorDisplayName(doctor)}</h2>
                  <p className="text-primary font-semibold">{doctor.specialty || (isExpert ? 'Chuyên gia tư vấn' : 'Bác sĩ Da liễu')}</p>
                  {isExpert && <span className="badge badge-secondary badge-outline">Chuyên gia tư vấn thỉnh giảng</span>}
                  <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1 text-sm text-base-content/70 pt-1">
                    {doctor.experience_years != null && (
                      <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {doctor.experience_years} năm kinh nghiệm</span>
                    )}
                    {doctor.workplace && (
                      <span className="flex items-center gap-1"><Building2 className="w-4 h-4" /> {doctor.workplace}</span>
                    )}
                  </div>
                  {doctor.license_number && (
                    <p className="text-xs text-success flex items-center justify-center sm:justify-start gap-1 pt-1">
                      <ShieldCheck className="w-4 h-4" /> Chứng chỉ hành nghề số {doctor.license_number}
                    </p>
                  )}
                </div>
              </div>

              {/* Số liệu thật */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-base-200/50 rounded-xl p-3">
                  <ClipboardCheck className="w-4 h-4 mx-auto text-primary mb-1" />
                  <div className="font-bold text-secondary">{stats.exams}</div>
                  <div className="text-xs text-base-content/60">{isExpert ? 'Buổi tư vấn hoàn thành tại GlowSkin' : 'Lượt khám hoàn tất tại GlowSkin'}</div>
                </div>
                <div className="bg-base-200/50 rounded-xl p-3">
                  <Star className="w-4 h-4 mx-auto text-amber-400 fill-current mb-1" />
                  <div className="font-bold text-secondary">{stats.avg ? `${Number(stats.avg).toFixed(1)}/5` : '—'}</div>
                  <div className="text-xs text-base-content/60">{stats.count ? `${stats.count} đánh giá của khách` : 'Chưa có đánh giá'}</div>
                </div>
              </div>

              {doctor.bio && <p className="text-base-content/80 leading-relaxed whitespace-pre-line">{doctor.bio}</p>}

              {doctor.expertise.length > 0 && (
                <Section icon={Sparkles} title="Thế mạnh điều trị">
                  <div className="flex flex-wrap gap-2">
                    {doctor.expertise.map((x) => <span key={x} className="badge badge-primary badge-outline py-3">{x}</span>)}
                  </div>
                </Section>
              )}

              {doctor.education.length > 0 && (
                <Section icon={GraduationCap} title="Quá trình đào tạo">
                  <ul className="border-l-2 border-primary/30 ml-2 space-y-3">
                    {doctor.education.map((e, i) => (
                      <li key={i} className="pl-4 relative">
                        <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-primary"></span>
                        <p className="font-semibold">{e.degree}{e.year ? <span className="text-base-content/50 font-normal"> · {e.year}</span> : null}</p>
                        <p className="text-sm text-base-content/70">{e.school}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {doctor.work_history.length > 0 && (
                <Section icon={Briefcase} title="Kinh nghiệm công tác">
                  <ul className="border-l-2 border-secondary/30 ml-2 space-y-3">
                    {doctor.work_history.map((w, i) => (
                      <li key={i} className="pl-4 relative">
                        <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-secondary"></span>
                        <p className="font-semibold">
                          {w.position}
                          <span className="text-base-content/50 font-normal"> · {w.from} – {w.to ?? 'nay'}</span>
                        </p>
                        <p className="text-sm text-base-content/70">{w.place}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {doctor.certificates.length > 0 && (
                <Section icon={Award} title="Chứng chỉ chuyên môn">
                  <ul className="space-y-1 text-base-content/80">
                    {doctor.certificates.map((c) => <li key={c} className="flex gap-2"><span className="text-primary">•</span>{c}</li>)}
                  </ul>
                </Section>
              )}

              {!doctor.specialty && !doctor.education.length && (
                <p className="text-sm text-base-content/60 italic">Phòng khám đang cập nhật hồ sơ chuyên môn của bác sĩ.</p>
              )}

              {reviews.length > 0 && (
                <Section icon={MessageSquare} title="Khách hàng nói gì">
                  <div className="space-y-2">
                    {reviews.map((r) => (
                      <div key={r.id} className="bg-base-200/40 rounded-xl p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold">{r.customer_name}</span>
                          <span className="flex text-amber-400">
                            {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? 'fill-current' : 'text-slate-300'}`} />)}
                          </span>
                        </div>
                        <p className="text-sm text-base-content/80 mt-1">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                {onBook ? (
                  <button type="button" onClick={() => onBook(doctor)} className="btn btn-primary flex-1 gap-2">
                    <CalendarCheck className="w-4 h-4" /> {isExpert ? 'Chọn chuyên gia này' : 'Chọn bác sĩ này'}
                  </button>
                ) : (
                  <Link to={isExpert ? `/tu-van?expert=${doctor.id}` : '/booking'} className="btn btn-primary flex-1 gap-2">
                    <CalendarCheck className="w-4 h-4" /> {isExpert ? 'Đặt lịch tư vấn' : 'Đặt lịch khám'}
                  </Link>
                )}
                {!isExpert && stats.count > 0 && (
                  <Link to={`/reviews?doctor=${doctor.id}`} className="btn btn-outline btn-primary gap-2">
                    <MessageSquare className="w-4 h-4" /> Xem tất cả đánh giá
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  );
}
