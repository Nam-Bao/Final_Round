const { Appointment, WorkShift, Invoice, Transaction } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');

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

    if (appointments.length === 0) return res.status(200).json({ data: [] });

    const token = req.headers.authorization; 
    let allUsers = [];
    try {
      const identityResponse = await axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': token } });
      allUsers = identityResponse.data.data;
    } catch (identityError) {
      console.warn("Không thể gọi sang service-identity:", identityError.message);
    }

    const enrichedAppointments = appointments.map(apt => {
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      return {
        ...apt,
        customer_name: customerInfo?.Profile?.full_name || 'Khách vãng lai',
        customer_phone: customerInfo?.Profile?.phone || 'Chưa cập nhật',
        pre_notes: apt.pre_notes || ''
      };
    });

    res.status(200).json({ data: enrichedAppointments });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getMyHistory = async (req, res) => {
  try {
    const history = await Appointment.findAll({ where: { customer_id: req.user.id }, order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: history });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getTakenSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) return res.status(400).json({ message: 'Thiếu doctorId hoặc date' });

    const takenAppointments = await Appointment.findAll({
      where: { doctor_id: doctorId, appointment_date: date, status: { [Op.notIn]: ['CANCELLED'] } },
      attributes: ['appointment_time'], raw: true
    });

    const takenTimes = takenAppointments.map(apt => apt.appointment_time);
    res.status(200).json({ data: takenTimes });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const createAppointment = async (req, res) => {
  try {
    const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : req.body.customer_id; 
    const { doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes } = req.body;

    if (!appointment_date || !appointment_time || !customer_id) return res.status(400).json({ message: 'Vui lòng điền đủ thông tin' });

    let finalPreNotes = pre_notes; 
    if (pre_notes?.includes('[Khám ONLINE]') && symptoms) {
       const formattedSymptomsForDoctor = symptoms.replace(/\n/g, ' - ');
       finalPreNotes = `${pre_notes} - ${formattedSymptomsForDoctor}`;
    }

    const newAppointment = await Appointment.create({
      customer_id,
      doctor_id: doctor_id || null,
      consultant_id: req.user.role !== 'CUSTOMER' ? req.user.id : null,
      type: type || 'NEW_EXAM',
      appointment_date,
      appointment_time,
      symptoms: '', 
      pre_notes: finalPreNotes,
      status: 'PENDING_PAYMENT' 
    });

    // --- TẠO HÓA ĐƠN PENDING (Doanh thu chưa ghi nhận) ---
    // Xác định số tiền cọc
    let depositAmount = 50000; // Khám Offline cọc 50k
    if (finalPreNotes?.includes('[Khám ONLINE]')) depositAmount = 100000;
    if (finalPreNotes?.includes('Miễn phí')) depositAmount = 0;

    await Invoice.create({
      customer_id,
      appointment_id: newAppointment.id,
      total_amount: depositAmount,
      payment_status: 'PENDING'
    });

    res.status(201).json({ message: 'Tạo đơn chờ thanh toán thành công', data: newAppointment });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    const isPaid = apt.status !== 'PENDING_PAYMENT';
    res.status(200).json({ isPaid });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    if (apt.pre_notes?.includes('[Khám ONLINE]') && apt.pre_notes?.includes('TÌNH TRẠNG DA')) {
       apt.status = 'WAITING'; 
    } else {
       apt.status = 'CONFIRMED'; 
    }
    await apt.save();

    // --- XỬ LÝ HÓA ĐƠN CHO KHÁCH 0Đ ---
    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    if (invoice && invoice.payment_status === 'PENDING') {
       invoice.payment_status = 'PAID';
       invoice.payment_method = 'CASH'; // Tạm gán Cash cho đơn 0đ
       await invoice.save();
       // Không tạo Transaction vì số tiền = 0
    }

    res.status(200).json({ message: 'Xác nhận thanh toán thành công!', data: apt });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const sepayWebhook = async (req, res) => {
  try {
    const { transferAmount, content } = req.body;

    if (transferAmount > 0 && content) {
      console.log(`💰 Có tiền vào: +${transferAmount} VND. Nội dung: ${content}`);
      
      const match = content.match(/O2O\s?([a-zA-Z0-9]{6})/i);
      
      if (match) {
        const orderCode = match[1].toLowerCase();
        
        const pendingApts = await Appointment.findAll({ where: { status: 'PENDING_PAYMENT' } });
        const apt = pendingApts.find(a => a.id.toLowerCase().startsWith(orderCode));

        if (apt) {
           // --- KIỂM TRA HÓA ĐƠN TRONG DB ---
           const invoice = await Invoice.findOne({ where: { appointment_id: apt.id } });
           
           if (invoice && transferAmount >= invoice.total_amount) {
               
               // 1. Chốt đơn
               if (apt.pre_notes?.includes('[Khám ONLINE]') && apt.pre_notes?.includes('TÌNH TRẠNG DA')) {
                  apt.status = 'WAITING'; 
               } else {
                  apt.status = 'CONFIRMED'; 
               }
               await apt.save();

               // 2. Chốt hóa đơn & Ghi nhận doanh thu (INCOME)
               if (invoice.payment_status === 'PENDING') {
                   invoice.payment_status = 'PAID';
                   invoice.payment_method = 'VIETQR';
                   await invoice.save();

                   await Transaction.create({
                      invoice_id: invoice.id,
                      amount: invoice.total_amount, // Ghi đúng số tiền cọc cần thu
                      transaction_type: 'INCOME',
                      note: `Khách thanh toán cọc VietQR cho đơn ${orderCode.toUpperCase()}`
                   });
               }

               console.log(`🎉 Đã tự động chốt lịch hẹn ID: ${apt.id}`);
           } else {
               console.log(`⚠️ Đơn hàng ${orderCode} chuyển THIẾU TIỀN`);
           }
        } else {
           console.log(`❌ Không tìm thấy đơn hàng nào khớp với mã ${orderCode}`);
        }
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Lỗi Webhook SePay:", error);
    res.status(200).json({ success: false, message: error.message }); 
  }
};

const getConsultantQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const appointments = await Appointment.findAll({
      where: { status: { [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING_FOR_SALE', 'NEEDS_RESCHEDULE'] } }, raw: true
    });
    const token = req.headers.authorization;
    let allUsers = [];
    try {
      allUsers = (await axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': token } })).data.data;
    } catch (error) {}

    const queues = { checkIn: [], hotLeads: [], followUp: [], reschedule: [] };

    appointments.forEach(apt => {
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      const enrichedApt = { ...apt, customer_name: customerInfo?.Profile?.full_name || 'Khách hàng', customer_phone: customerInfo?.Profile?.phone || '' };

      if (apt.status === 'NEEDS_RESCHEDULE') queues.reschedule.push(enrichedApt);
      else if (apt.status === 'WAITING_FOR_SALE') queues.hotLeads.push(enrichedApt);
      else if ((apt.status === 'PENDING' || apt.status === 'CONFIRMED') && apt.appointment_date === today) queues.checkIn.push(enrichedApt);
    });
    res.status(200).json({ data: queues });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id, appointment_date, appointment_time, note } = req.body;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    
    apt.doctor_id = doctor_id || apt.doctor_id;
    apt.appointment_date = appointment_date || apt.appointment_date;
    apt.appointment_time = appointment_time || apt.appointment_time;
    apt.status = 'CONFIRMED'; 
    if (note) apt.pre_notes = `[ĐÃ DỜI LỊCH: ${note}] - ` + (apt.pre_notes || '');
    await apt.save();
    res.status(200).json({ message: 'Dời lịch thành công!', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const preCheckAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { budget, pre_notes, current_skincare, reason, lifestyle } = req.body;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    const notesArray = [];
    if (reason) notesArray.push(`Lý do khám: ${reason}`);
    if (current_skincare) notesArray.push(`Skincare: ${current_skincare}`);
    if (lifestyle) notesArray.push(`Thói quen: ${lifestyle}`);
    if (pre_notes) notesArray.push(`Ghi chú CSKH: ${pre_notes}`);

    apt.pre_notes = notesArray.join(' - ');
    apt.budget = budget || apt.budget;
    apt.consultant_id = req.user.id; 
    apt.status = 'WAITING'; 
    await apt.save();
    res.status(200).json({ message: 'Đã lưu hồ sơ', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const finishExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms, diagnosis, doctor_notes, follow_up_date } = req.body; 
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    try {
      await axios.post('http://localhost:4000/api/identity/medical-records', {
        customer_id: apt.customer_id, doctor_id: apt.doctor_id, appointment_id: apt.id,
        symptoms: symptoms || apt.pre_notes, diagnosis, doctor_notes, follow_up_date
      }, { headers: { 'Authorization': req.headers.authorization } });
    } catch (err) { return res.status(500).json({ message: 'Lỗi khi đồng bộ Hồ sơ y tế' }); }

    apt.symptoms = diagnosis; 
    apt.status = 'WAITING_FOR_SALE'; 
    await apt.save();
    res.status(200).json({ message: 'Khám xong, đã lưu Hồ sơ Y tế và chuyển CSKH', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.findAll({ order: [['appointment_date', 'DESC'], ['appointment_time', 'ASC']], raw: true });
    res.status(200).json({ data: appointments });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

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
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    if (req.user.role === 'CUSTOMER' && apt.customer_id !== req.user.id) {
       return res.status(403).json({ message: 'Bạn không có quyền hủy lịch của người khác' });
    }

    apt.status = 'CANCELLED';
    await apt.save();

    // --- XỬ LÝ KẾ TOÁN KHI HỦY LỊCH ---
    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    // Nếu khách đã trả tiền rồi thì mới hoàn tiền
    if (invoice && invoice.payment_status === 'PAID') {
       invoice.payment_status = 'REFUNDED';
       await invoice.save();

       // Sinh ra một Transaction âm để trừ doanh thu
       await Transaction.create({
          invoice_id: invoice.id,
          amount: -invoice.total_amount, // Số âm
          transaction_type: 'REFUND',
          note: `Khách hủy lịch - Hoàn cọc đơn ${id.slice(0,6).toUpperCase()}`
       });
    }

    res.status(200).json({ message: 'Hủy lịch thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message }); 
  }
};

const getAvailableDoctors = async (req, res) => {
  try {
    const { date } = req.query;
    const shifts = await WorkShift.findAll({ where: { date, status: 'SCHEDULED' }, raw: true });
    const employeeIds = [...new Set(shifts.map(s => s.employee_id))];
    if (employeeIds.length === 0) return res.status(200).json({ data: [] });
    const resDoc = await axios.get('http://localhost:4000/api/identity/users/doctors', { headers: { 'Authorization': req.headers.authorization } });
    const availableDoctors = resDoc.data.data.filter(doc => employeeIds.includes(doc.id));
    res.status(200).json({ data: availableDoctors });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

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
    const takenAppointments = await Appointment.findAll({
      where: { appointment_date: date, doctor_id: doctorId, status: { [Op.notIn]: ['CANCELLED'] } }, raw: true
    });
    const takenTimes = takenAppointments.map(a => String(a.appointment_time).slice(0, 5));
    const availableSlots = allSlots.filter(slot => !takenTimes.includes(slot));
    res.status(200).json({ data: availableSlots });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { 
  getMyTodayAppointments, getMyHistory, getTakenSlots, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment, 
  getAvailableDoctors, getAvailableSlots
};