import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Stethoscope, Star, CalendarCheck, ClipboardCheck, MessageSquare } from 'lucide-react';
import { fetchPublicStats, doctorTitle } from '../utils/publicStats';

// Đội ngũ bác sĩ: dữ liệu thật từ hệ thống (bác sĩ đang làm việc, lượt khám đã hoàn tất, đánh giá của khách)
export default function DoctorsPage() {
  const [doctors, setDoctors] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    let isMounted = true;
    fetchPublicStats()
      .then((data) => {
        if (!isMounted) return;
        setDoctors(data.doctors);
        setStatus('ok');
      })
      .catch(() => isMounted && setStatus('error'));
    return () => { isMounted = false; };
  }, []);

  if (status === 'loading') {
    return <div className="flex justify-center py-24"><span className="loading loading-spinner loading-lg text-primary"></span></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-secondary flex items-center gap-2">
          <Stethoscope className="w-7 h-7 text-primary" /> Đội Ngũ Bác Sĩ
        </h1>
        <p className="text-base-content/60 mt-1">
          Bác sĩ da liễu trực tiếp thăm khám, chẩn đoán và chỉ định liệu trình cho khách hàng tại GlowSkin.
        </p>
      </div>

      {status === 'error' ? (
        <div className="alert alert-error">Không tải được danh sách bác sĩ, vui lòng thử lại sau.</div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-16 bg-base-100 rounded-2xl border border-base-200 text-base-content/60">
          Thông tin đội ngũ bác sĩ đang được cập nhật.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doc) => (
            <div key={doc.id} className="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md transition-shadow p-6 space-y-4">
              <div className="flex items-center gap-4">
                {doc.avatar ? (
                  <img src={doc.avatar} alt={doc.full_name} className="w-20 h-20 rounded-full object-cover border-2 border-primary/30" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                    {doc.full_name.split(' ').pop()?.charAt(0)}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-secondary">{doctorTitle(doc.full_name)}</h2>
                  <p className="text-sm text-base-content/60">Bác sĩ Da liễu</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-base-200/50 rounded-xl p-3">
                  <ClipboardCheck className="w-4 h-4 mx-auto text-primary mb-1" />
                  <div className="font-bold text-secondary">{doc.completed_exams}</div>
                  <div className="text-xs text-base-content/60">Lượt khám hoàn tất</div>
                </div>
                <div className="bg-base-200/50 rounded-xl p-3">
                  <Star className="w-4 h-4 mx-auto text-amber-400 fill-current mb-1" />
                  <div className="font-bold text-secondary">{doc.avg_rating ? `${doc.avg_rating.toFixed(1)}/5` : '—'}</div>
                  <div className="text-xs text-base-content/60">{doc.review_count ? `${doc.review_count} đánh giá` : 'Chưa có đánh giá'}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Link to="/booking" className="btn btn-primary btn-sm flex-1 gap-1">
                  <CalendarCheck className="w-4 h-4" /> Đặt lịch khám
                </Link>
                {doc.review_count > 0 && (
                  <Link to={`/reviews?doctor=${doc.id}`} className="btn btn-outline btn-primary btn-sm gap-1">
                    <MessageSquare className="w-4 h-4" /> Đánh giá
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
