const axios = require('axios');
const { sequelize, AppointmentReview, Appointment } = require('../models');

// "Nguyễn Văn An" -> "Nguyễn V. A." (che bớt tên thật khi hiển thị công khai)
const maskName = (fullName) => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Khách hàng';
    if (parts.length === 1) return `${parts[0].charAt(0)}***`;
    return [parts[0], ...parts.slice(1).map(p => `${p.charAt(0).toUpperCase()}.`)].join(' ');
};

const toPublicReview = (r) => ({
    id: r.id,
    customer_name: maskName(r.customer_name),
    doctor_id: r.doctor_id,
    doctor_name: r.doctor_name,
    rating: r.rating,
    comment: r.comment || '',
    createdAt: r.createdAt
});

// [PUBLIC] GET /reviews?doctor_id= — chỉ lấy đánh giá gắn với lịch khám thật
exports.getPublicReviews = async(req, res) => {
    try {
        const where = { status: 'VISIBLE' };
        if (req.query.doctor_id) where.doctor_id = req.query.doctor_id;

        const reviews = await AppointmentReview.findAll({
            where,
            include: [{ model: Appointment, attributes: [], required: true }],
            order: [['createdAt', 'DESC']],
            limit: 100
        });
        return res.status(200).json({ success: true, data: reviews.map(toPublicReview) });
    } catch (error) {
        console.error('Lỗi getPublicReviews:', error);
        return res.status(500).json({ success: false, message: 'Lỗi server khi lấy đánh giá', error: error.message });
    }
};

// [PUBLIC] GET /reviews/doctor-stats — điểm trung bình & số lượt đánh giá của từng bác sĩ
exports.getDoctorStats = async(req, res) => {
    try {
        const rows = await AppointmentReview.findAll({
            where: { status: 'VISIBLE' },
            attributes: [
                'doctor_id',
                [sequelize.fn('AVG', sequelize.col('rating')), 'avg_rating'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'review_count']
            ],
            group: ['doctor_id'],
            raw: true
        });
        const stats = {};
        rows.filter(r => r.doctor_id).forEach(r => {
            stats[r.doctor_id] = { avg_rating: Number(Number(r.avg_rating).toFixed(1)), review_count: Number(r.review_count) };
        });
        return res.status(200).json({ success: true, data: stats });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// [CUSTOMER] GET /reviews/mine — các lịch hẹn mình đã đánh giá
exports.getMyReviews = async(req, res) => {
    try {
        const reviews = await AppointmentReview.findAll({
            where: { customer_id: req.user.id },
            attributes: ['id', 'appointment_id', 'rating', 'comment', 'createdAt']
        });
        return res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// [CUSTOMER] POST /reviews — chỉ đánh giá được lịch khám của chính mình, đã hoàn tất, có bác sĩ
exports.createReview = async(req, res) => {
    try {
        const { appointment_id, comment } = req.body;
        const rating = Number(req.body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Số sao phải từ 1 đến 5' });
        }
        if (comment && String(comment).length > 1000) {
            return res.status(400).json({ message: 'Nhận xét tối đa 1000 ký tự' });
        }

        const apt = await Appointment.findByPk(appointment_id);
        if (!apt || apt.customer_id !== req.user.id) {
            return res.status(404).json({ message: 'Không tìm thấy lịch hẹn của bạn' });
        }
        if (apt.status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Chỉ đánh giá được sau khi buổi khám đã hoàn tất' });
        }
        if (!apt.doctor_id) {
            return res.status(400).json({ message: 'Lịch hẹn này không có bác sĩ phụ trách' });
        }
        const existing = await AppointmentReview.findOne({ where: { appointment_id } });
        if (existing) return res.status(400).json({ message: 'Bạn đã đánh giá buổi khám này rồi' });

        // Lấy tên thật của khách và bác sĩ từ service-identity
        const headers = { Authorization: req.headers.authorization };
        const [profileRes, doctorsRes] = await Promise.all([
            axios.get('http://localhost:4000/api/identity/profile/me', { headers }).catch(() => null),
            axios.get('http://localhost:4000/api/identity/users/doctors', { headers }).catch(() => null)
        ]);
        const customerName = profileRes?.data?.Profile?.full_name || null;
        const doctor = (doctorsRes?.data?.data || []).find(d => d.id === apt.doctor_id);

        const review = await AppointmentReview.create({
            appointment_id,
            customer_id: req.user.id,
            doctor_id: apt.doctor_id,
            customer_name: customerName,
            doctor_name: doctor?.Profile?.full_name || null,
            rating,
            comment: comment ? String(comment).trim() : null
        });
        return res.status(201).json({ success: true, message: 'Cảm ơn bạn đã đánh giá!', data: toPublicReview(review) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/* ------------------------- Đánh giá dịch vụ / liệu trình ------------------------- */
const { ServiceReview, ServiceSession, TreatmentSession, CustomerPackage, SpaService, TreatmentPackage } = require('../models');

const toPublicServiceReview = (r) => ({
    id: r.id,
    customer_name: maskName(r.customer_name),
    session_type: r.session_type,
    service_id: r.service_id,
    service_name: r.service_name,
    rating: r.rating,
    comment: r.comment || '',
    createdAt: r.createdAt
});

// [PUBLIC] GET /reviews/services?service_id=
exports.getPublicServiceReviews = async(req, res) => {
    try {
        const where = { status: 'VISIBLE' };
        if (req.query.service_id) where.service_id = req.query.service_id;
        const reviews = await ServiceReview.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
        return res.status(200).json({ success: true, data: reviews.map(toPublicServiceReview) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi server khi lấy đánh giá dịch vụ', error: error.message });
    }
};

// [CUSTOMER] GET /reviews/services/mine — các buổi dịch vụ mình đã đánh giá
exports.getMyServiceReviews = async(req, res) => {
    try {
        const reviews = await ServiceReview.findAll({
            where: { customer_id: req.user.id },
            attributes: ['id', 'session_id', 'session_type', 'rating', 'comment', 'createdAt']
        });
        return res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// [CUSTOMER] POST /reviews/services — body: { session_id, session_type: 'SINGLE' | 'PACKAGE', rating, comment }
// Chỉ đánh giá được buổi của chính mình và đã hoàn thành
exports.createServiceReview = async(req, res) => {
    try {
        const { session_id, session_type, comment } = req.body;
        const rating = Number(req.body.rating);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Số sao phải từ 1 đến 5' });
        }
        if (comment && String(comment).length > 1000) {
            return res.status(400).json({ message: 'Nhận xét tối đa 1000 ký tự' });
        }

        let ownerId, status, serviceId, serviceName;
        if (session_type === 'SINGLE') {
            const session = session_id && await ServiceSession.findByPk(session_id, { include: [{ model: SpaService }] });
            if (session) {
                ownerId = session.customer_id;
                status = session.status;
                serviceId = session.spa_service_id;
                serviceName = session.SpaService?.name;
            }
        } else if (session_type === 'PACKAGE') {
            const session = session_id && await TreatmentSession.findByPk(session_id, {
                include: [{ model: CustomerPackage, include: [{ model: TreatmentPackage }] }]
            });
            if (session?.CustomerPackage) {
                ownerId = session.CustomerPackage.customer_id;
                status = session.status;
                serviceId = session.CustomerPackage.package_id;
                serviceName = session.CustomerPackage.TreatmentPackage?.name;
            }
        } else {
            return res.status(400).json({ message: 'Loại dịch vụ không hợp lệ' });
        }

        if (!ownerId || ownerId !== req.user.id) {
            return res.status(404).json({ message: 'Không tìm thấy buổi dịch vụ của bạn' });
        }
        if (status !== 'COMPLETED') {
            return res.status(400).json({ message: 'Chỉ đánh giá được sau khi buổi dịch vụ đã hoàn thành' });
        }
        const existing = await ServiceReview.findOne({ where: { session_id } });
        if (existing) return res.status(400).json({ message: 'Bạn đã đánh giá buổi dịch vụ này rồi' });

        const profileRes = await axios.get('http://localhost:4000/api/identity/profile/me', {
            headers: { Authorization: req.headers.authorization }
        }).catch(() => null);

        const review = await ServiceReview.create({
            customer_id: req.user.id,
            session_type,
            session_id,
            service_id: serviceId,
            service_name: serviceName || null,
            customer_name: profileRes?.data?.Profile?.full_name || null,
            rating,
            comment: comment ? String(comment).trim() : null
        });
        return res.status(201).json({ success: true, message: 'Cảm ơn bạn đã đánh giá!', data: toPublicServiceReview(review) });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
