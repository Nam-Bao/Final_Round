const { AppointmentReview, Appointment, SpaService, TreatmentPackage } = require('../models');

// [PUBLIC] Lấy danh sách đánh giá hiển thị lên trang /reviews
exports.getPublicReviews = async(req, res) => {
    try {
        const reviews = await AppointmentReview.findAll({
            order: [
                ['createdAt', 'DESC']
            ],
            limit: 50
        });

        // Format dữ liệu trả về cho client
        const formatted = reviews.map(r => ({
            id: r.id,
            customer_name: 'Khách hàng GlowSkin',
            rating: r.rating || 5,
            comment: r.comment || '',
            service_name: 'Chăm sóc & Phục hồi da',
            createdAt: r.createdAt
        }));

        return res.status(200).json({
            success: true,
            data: formatted
        });
    } catch (error) {
        console.error('Lỗi getPublicReviews:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy đánh giá',
            error: error.message
        });
    }
};