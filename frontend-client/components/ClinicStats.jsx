import React, { useEffect, useState } from 'react';
import { fetchPublicStats } from '../utils/publicStats';

// 4 ô số liệu thật của phòng khám. Không có dữ liệu thì hiện "—" chứ không hiện số ước lượng.
export default function ClinicStats({ className = '' }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchPublicStats()
      .then((data) => isMounted && setStats(data))
      .catch((err) => console.warn('Không tải được số liệu phòng khám:', err));
    return () => { isMounted = false; };
  }, []);

  const tiles = [
    { value: stats?.doctors.length, label: 'Bác sĩ da liễu' },
    { value: stats?.completedExams, label: 'Lượt khám đã hoàn tất' },
    { value: stats?.activeServices, label: 'Dịch vụ điều trị' },
    {
      value: stats?.avgRating ? `${stats.avgRating.toFixed(1)}/5` : null,
      label: stats?.reviewCount ? `Điểm đánh giá từ ${stats.reviewCount} lượt` : 'Điểm đánh giá trung bình',
    },
  ];

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 ${className}`}>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="bg-white text-slate-800 rounded-2xl p-5 text-center shadow-lg hover:-translate-y-1 transition-transform duration-300 flex flex-col justify-center"
        >
          <div className="text-2xl md:text-3xl font-extrabold text-[#0B69A3] tracking-tight">
            {tile.value ?? '—'}
          </div>
          <div className="text-xs md:text-sm text-slate-600 font-medium mt-1">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}
