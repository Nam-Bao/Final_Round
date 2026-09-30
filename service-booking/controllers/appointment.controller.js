const { Appointment } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios'); // Import axios

const getMyTodayAppointments = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const myDoctorId = req.user.id; 

    // 1. Lấy lịch hẹn từ Database của Booking
    const appointments = await Appointment.findAll({
      where: {
        doctor_id: myDoctorId,
        appointment_date: today,
        status: { [Op.in]: ['WAITING', 'IN_PROGRESS', 'COMPLETED'] }
      },
      order: [['appointment_time', 'ASC']],
      raw: true // Lấy dữ liệu thô (plain object) để dễ thao tác thêm cột
    });

    // Nếu không có khách nào thì trả về rỗng luôn, đỡ tốn công gọi service khác
    if (appointments.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // 2. Chuyển tiếp Token (Token Relay)
    // Lấy token từ header của request hiện tại do Frontend gửi lên
    const token = req.headers.authorization; 

    let allUsers = [];
    try {
      // 3. Gọi nội bộ sang service-identity qua cổng API Gateway (4000)
      const identityResponse = await axios.get('http://localhost:4000/api/identity/users', {
        headers: { 'Authorization': token }
      });
      allUsers = identityResponse.data.data;
    } catch (identityError) {
      console.warn("Không thể gọi sang service-identity:", identityError.message);
      // Nếu service-identity sập, ta vẫn cho code chạy tiếp nhưng danh sách user sẽ rỗng
    }

    // 4. Lắp ráp dữ liệu (Mapping)
    const enrichedAppointments = appointments.map(apt => {
      // Tìm khách hàng có id khớp với customer_id trong lịch hẹn
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      
      return {
        ...apt,
        // Tạo thêm 2 trường mới gửi cho Frontend
        customer_name: customerInfo?.Profile?.full_name || 'Khách vãng lai (Chưa rõ tên)',
        customer_phone: customerInfo?.Profile?.phone || 'Chưa cập nhật'
      };
    });

    // Trả về dữ liệu đã được "làm giàu"
    res.status(200).json({ data: enrichedAppointments });
  } catch (error) {
    console.error("LỖI LẤY LỊCH HẸN HÔM NAY:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getMyTodayAppointments };