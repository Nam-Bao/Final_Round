const { sequelize, AppointmentReview, Appointment } = require('./models');

const sampleReviews = [{
        customer_id: '11111111-1111-1111-1111-111111111111',
        rating: 5,
        comment: 'Bác sĩ soi da rất kỹ, chỉ định liệu trình chuẩn y khoa. Sau 3 buổi lấy nhân mụn và phục hồi da thì mụn viêm giảm rõ rệt, da bớt đỏ hẳn.'
    },
    {
        customer_id: '22222222-2222-2222-2222-222222222222',
        rating: 5,
        comment: 'Không gian phòng khám sạch sẽ, thiết bị máy móc hiện đại. Kỹ thuật viên thao tác nhẹ nhàng, không bị đau hay sưng sau khi peel da.'
    },
    {
        customer_id: '33333333-3333-3333-3333-333333333333',
        rating: 4,
        comment: 'Dịch vụ tốt, nhân viên tư vấn nhiệt tình không chèo kéo mua thêm gói. Đặt lịch trên web đến là được vào khám ngay không phải chờ đợi.'
    },
    {
        customer_id: '44444444-4444-4444-4444-444444444444',
        rating: 5,
        comment: 'Liệu trình Meso căng bóng hiệu quả bất ngờ, da ẩm mịn và sáng khỏe hơn rất nhiều. Sẽ tiếp tục đồng hành cùng GlowSkin.'
    },
    {
        customer_id: '55555555-5555-5555-5555-555555555555',
        rating: 5,
        comment: 'Trải nghiệm 10/10! Bác sĩ theo sát quá trình hồi phục và dặn dò kỹ lưỡng routine chăm sóc da tại nhà.'
    }
];

(async() => {
    try {
        await sequelize.authenticate();
        console.log('✅ Kết nối database booking_db thành công!');
        await sequelize.sync({ alter: true });

        for (const item of sampleReviews) {
            await AppointmentReview.create(item);
        }

        console.log(`✅ Đã nạp thành công ${sampleReviews.length} đánh giá thật vào booking_db!`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi nạp đánh giá:', error);
        process.exit(1);
    }
})();