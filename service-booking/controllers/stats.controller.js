const { sequelize, Appointment, ServiceSession, TreatmentSession, AppointmentReview, ServiceReview, SpaService } = require('../models');

// [PUBLIC] GET /stats/public — số liệu thật cho trang chủ / giới thiệu / đội ngũ bác sĩ (chỉ số đếm, không có dữ liệu cá nhân)
exports.getPublicStats = async (req, res) => {
  try {
    const [completedExams, singleSessions, packageSessions, activeServices, examsByDoctor, doctorReviews, serviceReviews] = await Promise.all([
      Appointment.count({ where: { status: 'COMPLETED' } }),
      ServiceSession.count({ where: { status: 'COMPLETED' } }),
      TreatmentSession.count({ where: { status: 'COMPLETED' } }),
      SpaService.count({ where: { status: 'ACTIVE' } }),
      Appointment.findAll({
        where: { status: 'COMPLETED' },
        attributes: ['doctor_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['doctor_id'],
        raw: true
      }),
      AppointmentReview.findOne({
        where: { status: 'VISIBLE' },
        attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'count'], [sequelize.fn('SUM', sequelize.col('rating')), 'total']],
        raw: true
      }),
      ServiceReview.findOne({
        where: { status: 'VISIBLE' },
        attributes: [[sequelize.fn('COUNT', sequelize.col('id')), 'count'], [sequelize.fn('SUM', sequelize.col('rating')), 'total']],
        raw: true
      })
    ]);

    res.status(200).json({
      data: {
        completed_exams: completedExams,
        completed_service_sessions: singleSessions + packageSessions,
        active_services: activeServices,
        exams_by_doctor: Object.fromEntries(examsByDoctor.filter(r => r.doctor_id).map(r => [r.doctor_id, Number(r.count)])),
        // Tổng điểm & số lượt để frontend gộp với đánh giá mỹ phẩm (service-commerce)
        reviews: {
          doctor: { count: Number(doctorReviews?.count || 0), total: Number(doctorReviews?.total || 0) },
          service: { count: Number(serviceReviews?.count || 0), total: Number(serviceReviews?.total || 0) }
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy số liệu', error: error.message });
  }
};
