// Số liệu thật của phòng khám (đếm từ database), dùng cho trang chủ, giới thiệu, đội ngũ bác sĩ.
const API = 'http://localhost:4000/api';

const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))));

export async function fetchPublicStats() {
  const [stats, doctors, doctorStats, productReviews] = await Promise.all([
    getJson(`${API}/booking/stats/public`).then((d) => d.data),
    getJson(`${API}/identity/users/doctors/public`).then((d) => d.data || []),
    getJson(`${API}/booking/reviews/doctor-stats`).then((d) => d.data || {}).catch(() => ({})),
    getJson(`${API}/commerce/reviews`).then((d) => d.data || []).catch(() => []),
  ]);

  // Điểm trung bình gộp cả đánh giá bác sĩ, dịch vụ và mỹ phẩm
  const productTotal = productReviews.reduce((s, r) => s + Number(r.rating), 0);
  const reviewCount = stats.reviews.doctor.count + stats.reviews.service.count + productReviews.length;
  const reviewTotal = stats.reviews.doctor.total + stats.reviews.service.total + productTotal;

  return {
    doctors: doctors.map((doc) => ({
      ...doc,
      completed_exams: stats.exams_by_doctor[doc.id] || 0,
      avg_rating: doctorStats[doc.id]?.avg_rating || null,
      review_count: doctorStats[doc.id]?.review_count || 0,
    })),
    completedExams: stats.completed_exams,
    completedSessions: stats.completed_service_sessions,
    activeServices: stats.active_services,
    reviewCount,
    avgRating: reviewCount ? reviewTotal / reviewCount : null,
  };
}

// "Nguyễn Văn A" -> "BS. Nguyễn Văn A" (hồ sơ có thể đã kèm "BS.")
export const doctorTitle = (name) => (/^(BS|Bác sĩ)/i.test(name || '') ? name : `BS. ${name}`);
