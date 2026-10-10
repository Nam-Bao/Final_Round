const { Appointment, WorkShift } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');

// 1. Dành cho Bác sĩ: Xem danh sách chờ hôm nay
const getMyTodayAppointments = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const myDoctorId = req.user.id; 

    const appointments = await Appointment.findAll({
      where: {
        doctor_id: myDoctorId,
        appointment_date: today,
        status: { [Op.in]: ['WAITING', 'IN_PROGRESS', 'COMPLETED'] }
      },
      order: [['appointment_time', 'ASC']],
      raw: true 
    });

    if (appointments.length === 0) {
      return res.status(200).json({ data: [] });
    }

    const token = req.headers.authorization; 
    let allUsers = [];
    try {
      const identityResponse = await axios.get('http://localhost:4000/api/identity/users/customers', {
        headers: { 'Authorization': token }
      });
      allUsers = identityResponse.data.data;
    } catch (identityError) {
      console.warn("Không thể gọi sang service-identity:", identityError.message);
    }

    const enrichedAppointments = appointments.map(apt => {
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      return {
        ...apt,
        customer_name: customerInfo?.Profile?.full_name || 'Khách vãng lai (Chưa rõ tên)',
        customer_phone: customerInfo?.Profile?.phone || 'Chưa cập nhật',
        pre_notes: apt.pre_notes || ''
      };
    });

    res.status(200).json({ data: enrichedAppointments });
  } catch (error) {
    console.error("LỖI LẤY LỊCH HẸN HÔM NAY:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. - Dành cho Khách: Xem lịch sử (để check khách cũ/mới)
const getMyHistory = async (req, res) => {
  try {
    const myId = req.user.id; 
    
    const history = await Appointment.findAll({
      where: { customer_id: myId },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ data: history });
  } catch (error) {
    console.error("Lỗi lấy lịch sử:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 3. - Lấy danh sách các giờ đã bị đặt (Để tính khung giờ trống)
const getTakenSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ message: 'Thiếu doctorId hoặc date' });
    }

    const takenAppointments = await Appointment.findAll({
      where: {
        doctor_id: doctorId,
        appointment_date: date,
        status: { [Op.notIn]: ['CANCELLED'] } 
      },
      attributes: ['appointment_time'], 
      raw: true
    });

    const takenTimes = takenAppointments.map(apt => apt.appointment_time);
    res.status(200).json({ data: takenTimes });
  } catch (error) {
    console.error("Lỗi lấy giờ trống:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 4. - Dành cho Khách: Đặt lịch hẹn mới
const createAppointment = async (req, res) => {
  try {
    // Nếu là CSKH đặt: lấy customer_id từ Form. Nếu khách tự đặt: lấy từ Token
    const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : req.body.customer_id; 
    const { doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes } = req.body;

    if (!appointment_date || !appointment_time || !customer_id) {
      return res.status(400).json({ message: 'Vui lòng điền đủ ngày, giờ và khách hàng' });
    }

    const newAppointment = await Appointment.create({
      customer_id,
      doctor_id: doctor_id || null,
      consultant_id: req.user.role !== 'CUSTOMER' ? req.user.id : null, // Lưu lại người tạo lịch
      type: type || 'NEW_EXAM',
      appointment_date,
      appointment_time,
      symptoms,
      pre_notes,
      status: 'PENDING' 
    });

    res.status(201).json({ message: 'Đặt lịch thành công', data: newAppointment });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 5. - API Lấy danh sách các phễu khách hàng cho CSKH
const getConsultantQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    // Lấy các lịch hẹn cần xử lý
    const appointments = await Appointment.findAll({
      where: {
        status: {
          [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING_FOR_SALE', 'NEEDS_RESCHEDULE'] 
        }
      },
      raw: true
    });

    const token = req.headers.authorization;
    let allUsers = [];
    try {
      const identityResponse = await axios.get('http://localhost:4000/api/identity/users/customers', {
        headers: { 'Authorization': token }
      });
      allUsers = identityResponse.data.data;
    } catch (error) { console.warn("Lỗi gọi identity:", error.message); }

    const queues = { checkIn: [], hotLeads: [], followUp: [], reschedule: [] };

    appointments.forEach(apt => {
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      const enrichedApt = {
        ...apt,
        customer_name: customerInfo?.Profile?.full_name || 'Khách hàng',
        customer_phone: customerInfo?.Profile?.phone || 'Chưa có SĐT'
      };

      if (apt.status === 'NEEDS_RESCHEDULE') {
        queues.reschedule.push(enrichedApt); // Phễu cần dời lịch gấp
      } else if (apt.status === 'WAITING_FOR_SALE') {
        queues.hotLeads.push(enrichedApt); // Phễu bác sĩ khám xong, ra chờ chốt sale
      } else if ((apt.status === 'PENDING' || apt.status === 'CONFIRMED') && apt.appointment_date === today) {
        queues.checkIn.push(enrichedApt); // Phễu khách sắp tới trong hôm nay
      }
    });

    res.status(200).json({ data: queues });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 6. - API Xử lý Dời lịch / Đổi bác sĩ
const rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id, appointment_date, appointment_time, note } = req.body;

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    
    apt.doctor_id = doctor_id || apt.doctor_id;
    apt.appointment_date = appointment_date || apt.appointment_date;
    apt.appointment_time = appointment_time || apt.appointment_time;
    apt.status = 'CONFIRMED'; // CSKH đã gọi xử lý xong thì chốt luôn
    
    // Ghi log để lễ tân hoặc bác sĩ mới biết
    if (note) {
      apt.pre_notes = `[ĐÃ DỜI LỊCH: ${note}] - ` + (apt.pre_notes || '');
    }

    await apt.save();
    res.status(200).json({ message: 'Dời lịch thành công!', data: apt });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 7. API CSKH Khai thác sơ bộ và Chuyển Bác sĩ
const preCheckAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { budget, pre_notes, current_skincare, reason, lifestyle } = req.body;

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    // Gộp chuỗi bằng dấu " - " để Frontend dễ dàng cắt (split)
    const notesArray = [];
    if (reason) notesArray.push(`Lý do khám: ${reason}`);
    if (current_skincare) notesArray.push(`Skincare: ${current_skincare}`);
    if (lifestyle) notesArray.push(`Thói quen: ${lifestyle}`);
    if (pre_notes) notesArray.push(`Ghi chú CSKH: ${pre_notes}`);

    apt.pre_notes = notesArray.join(' - ');
    apt.budget = budget || apt.budget;
    apt.consultant_id = req.user.id; 
    apt.status = 'WAITING'; // Chuyển cho bác sĩ

    await apt.save();
    res.status(200).json({ message: 'Đã lưu hồ sơ', data: apt });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 8. API Bác sĩ khám xong, tự động tạo Hồ sơ Y tế và đẩy ra CSKH chốt sale
const finishExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms, diagnosis, doctor_notes, follow_up_date } = req.body; 

    // 1. Tìm lịch hẹn đang khám
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    // 2. GỌI API SANG SERVICE-IDENTITY ĐỂ LƯU HỒ SƠ Y TẾ VĨNH VIỄN
    const token = req.headers.authorization;
    try {
      await axios.post('http://localhost:4000/api/identity/medical-records', {
        customer_id: apt.customer_id,
        doctor_id: apt.doctor_id,
        appointment_id: apt.id,
        symptoms: symptoms || apt.pre_notes, // Nếu BS không nhập triệu chứng, lấy luôn lời khai ban đầu
        diagnosis: diagnosis,
        doctor_notes: doctor_notes,
        follow_up_date: follow_up_date
      }, {
        headers: { 'Authorization': token }
      });
    } catch (identityError) {
      console.error("Lỗi khi tạo Hồ sơ Y tế bên service-identity:", identityError.message);
      // Bạn có thể return lỗi ở đây, hoặc vẫn cho phép đi tiếp nếu chấp nhận rủi ro đồng bộ
      return res.status(500).json({ message: 'Lỗi khi đồng bộ Hồ sơ y tế' });
    }

    // 3. Cập nhật trạng thái Lịch hẹn để báo hiệu khách đã ra khỏi phòng khám
    apt.symptoms = diagnosis; // Bảng booking giờ chỉ cần lưu tóm tắt ngắn gọn
    apt.status = 'WAITING_FOR_SALE'; // Đẩy ra hàng chờ thanh toán / nhận thuốc
    await apt.save();

    res.status(200).json({ message: 'Khám xong, đã lưu Hồ sơ Y tế và chuyển CSKH', data: apt });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// --- Lấy tất cả lịch hẹn (Cho màn hình Calendar) ---
const getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      order: [['appointment_date', 'DESC'], ['appointment_time', 'ASC']],
      raw: true
    });
    res.status(200).json({ data: appointments });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// --- CSKH cập nhật lịch hẹn ---
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes } = req.body;
    
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    apt.doctor_id = doctor_id !== undefined ? doctor_id : apt.doctor_id;
    apt.type = type || apt.type;
    apt.appointment_date = appointment_date || apt.appointment_date;
    apt.appointment_time = appointment_time || apt.appointment_time;
    apt.symptoms = symptoms || apt.symptoms;
    apt.pre_notes = pre_notes || apt.pre_notes;
    
    await apt.save();
    res.status(200).json({ message: 'Cập nhật thành công', data: apt });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// --- CSKH Hủy lịch ---
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    apt.status = 'CANCELLED';
    await apt.save();
    res.status(200).json({ message: 'Hủy lịch thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// --- Lấy danh sách Bác sĩ có lịch làm việc trong ngày ---
const getAvailableDoctors = async (req, res) => {
  try {
    const { date } = req.query;
    // Tìm các ca làm việc trong ngày
    const shifts = await WorkShift.findAll({ where: { date, status: 'SCHEDULED' }, raw: true });
    const employeeIds = [...new Set(shifts.map(s => s.employee_id))];

    if (employeeIds.length === 0) return res.status(200).json({ data: [] });

    // Lấy thông tin chi tiết của các Bác sĩ đó từ service-identity
    const token = req.headers.authorization;
    const resDoc = await axios.get('http://localhost:4000/api/identity/users/doctors', { headers: { 'Authorization': token } });
    
    const availableDoctors = resDoc.data.data.filter(doc => employeeIds.includes(doc.id));
    res.status(200).json({ data: availableDoctors });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// --- Lấy khung giờ trống của 1 Bác sĩ trong 1 ngày ---
const getAvailableSlots = async (req, res) => {
  try {
    const { date, doctorId } = req.query;
    const shifts = await WorkShift.findAll({ where: { date, employee_id: doctorId, status: 'SCHEDULED' }, raw: true });

    let allSlots = [];
    shifts.forEach(shift => {
      if (shift.shift_type === 'MORNING') allSlots.push('08:00', '09:00', '10:00', '11:00');
      if (shift.shift_type === 'AFTERNOON') allSlots.push('13:00', '14:00', '15:00', '16:00');
      if (shift.shift_type === 'EVENING') allSlots.push('18:00', '19:00', '20:00');
    });

    // Tìm các giờ Bác sĩ đã có lịch hẹn
    const takenAppointments = await Appointment.findAll({
      where: { appointment_date: date, doctor_id: doctorId, status: { [Op.notIn]: ['CANCELLED'] } },
      raw: true
    });
    const takenTimes = takenAppointments.map(a => String(a.appointment_time).slice(0, 5));

    // Lọc ra các giờ còn trống
    const availableSlots = allSlots.filter(slot => !takenTimes.includes(slot));
    res.status(200).json({ data: availableSlots });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Đã bổ sung xuất đủ 4 hàm
module.exports = { 
  getMyTodayAppointments, 
  getMyHistory, 
  getTakenSlots, 
  createAppointment,
  getConsultantQueues,
  rescheduleAppointment,
  preCheckAppointment,
  finishExam,
  getAllAppointments, 
  updateAppointment, 
  cancelAppointment, 
  getAvailableDoctors,
  getAvailableSlots
};