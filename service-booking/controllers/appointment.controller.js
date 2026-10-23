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
      
      // TÌM ĐÚNG HỒ SƠ ĐÃ ĐẶT LỊCH (Bản thân hoặc Người thân)
      const patientProfile = customerInfo?.PatientProfiles?.find(p => p.id === apt.patient_profile_id);

      return {
        ...apt,
        // Ưu tiên lấy thông tin từ PatientProfile, nếu không có mới lấy từ Account gốc
        customer_name: patientProfile?.full_name || customerInfo?.Profile?.full_name || 'Khách vãng lai',
        customer_phone: patientProfile?.phone || customerInfo?.Profile?.phone || 'Chưa cập nhật',
        dob: patientProfile?.dob || customerInfo?.Profile?.dob || null,
        gender: patientProfile?.gender || customerInfo?.Profile?.gender || 'OTHER',
        patient_profile_id: apt.patient_profile_id, // TRUYỀN ID HỒ SƠ Y TẾ RA FRONTEND
        pre_notes: apt.pre_notes || '',
        pre_exam_images: apt.pre_exam_images || []
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
    const { patient_profile_id, doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes, pre_exam_images } = req.body;

    if (!appointment_date || !appointment_time || !customer_id || !patient_profile_id) {
       return res.status(400).json({ message: 'Vui lòng điền đủ thông tin hồ sơ và thời gian' });
    }

    let finalPreNotes = pre_notes; 
    if (pre_notes?.includes('[Khám ONLINE]') && symptoms) {
       const formattedSymptomsForDoctor = symptoms.replace(/\n/g, ' - ');
       finalPreNotes = `${pre_notes} - ${formattedSymptomsForDoctor}`;
    }

    const newAppointment = await Appointment.create({
      customer_id,
      patient_profile_id, 
      doctor_id: doctor_id || null,
      consultant_id: req.user.role !== 'CUSTOMER' ? req.user.id : null,
      type: type || 'NEW_EXAM',
      appointment_date,
      appointment_time,
      symptoms: '', 
      pre_notes: finalPreNotes,
      // ĐÃ SỬA: KHÁCH HÀNG TỰ TẠO SẼ CHỜ THANH TOÁN (PENDING_PAYMENT), LỄ TÂN/CSKH TẠO SẼ VÀO HÀNG ĐỢI (PENDING)
      status: req.user.role === 'CUSTOMER' ? 'PENDING_PAYMENT' : 'PENDING',
      pre_exam_images: pre_exam_images || [] 
    });

    let depositAmount = 50000; 
    if (finalPreNotes?.includes('[Khám ONLINE]')) depositAmount = 100000;
    if (finalPreNotes?.includes('Miễn phí')) depositAmount = 0;

    await Invoice.create({ customer_id, appointment_id: newAppointment.id, total_amount: depositAmount, payment_status: 'PENDING' });

    res.status(201).json({ message: 'Tạo lịch khám thành công', data: newAppointment });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
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

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    if (invoice && invoice.payment_status === 'PENDING') {
       invoice.payment_status = 'PAID';
       invoice.payment_method = 'CASH'; 
       await invoice.save();
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
           const invoice = await Invoice.findOne({ where: { appointment_id: apt.id } });
           
           if (invoice && transferAmount >= invoice.total_amount) {
               if (apt.pre_notes?.includes('[Khám ONLINE]') && apt.pre_notes?.includes('TÌNH TRẠNG DA')) {
                  apt.status = 'WAITING'; 
               } else {
                  apt.status = 'CONFIRMED'; 
               }
               await apt.save();

               if (invoice.payment_status === 'PENDING') {
                   invoice.payment_status = 'PAID';
                   invoice.payment_method = 'VIETQR';
                   await invoice.save();

                   await Transaction.create({
                      invoice_id: invoice.id,
                      amount: invoice.total_amount, 
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
    
    // Đã thêm: Kéo hóa đơn để lấy số tiền cọc khách đã đóng
    const invoices = await Invoice.findAll({ raw: true });
    
    const token = req.headers.authorization;
    let allUsers = [];
    try {
      allUsers = (await axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': token } })).data.data;
    } catch (error) {}

    const queues = { checkIn: [], hotLeads: [], followUp: [], reschedule: [] };

    appointments.forEach(apt => {
      const customerInfo = allUsers.find(u => u.id === apt.customer_id);
      const patientProfile = customerInfo?.PatientProfiles?.find(p => p.id === apt.patient_profile_id);
      
      const invoice = invoices.find(inv => inv.appointment_id === apt.id);
      const deposit_paid = (invoice && invoice.payment_status === 'PAID') ? Number(invoice.total_amount) : 0;

      const enrichedApt = { 
        ...apt, 
        customer_name: patientProfile?.full_name || customerInfo?.Profile?.full_name || 'Khách hàng', 
        customer_phone: patientProfile?.phone || customerInfo?.Profile?.phone || '',
        deposit_paid // Gắn tiền cọc vào để Frontend tính toán
      };

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
    const { budget, pre_notes, current_skincare, reason, lifestyle, pre_exam_images } = req.body;
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
    if (pre_exam_images && pre_exam_images.length > 0) {
       apt.pre_exam_images = pre_exam_images;
    }
    apt.status = 'WAITING'; 
    await apt.save();
    
    res.status(200).json({ message: 'Đã lưu hồ sơ', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const finishExam = async (req, res) => {
  try {
    const { id } = req.params;
    const { symptoms, diagnosis, doctor_notes, follow_up_date, post_exam_images, spa_services, treatment_package, prescriptions } = req.body; 
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    try {
      await axios.post('http://localhost:4000/api/identity/medical-records', {
        patient_profile_id: apt.patient_profile_id, 
        doctor_id: apt.doctor_id, 
        appointment_id: apt.id,
        symptoms: symptoms || apt.symptoms || apt.pre_notes, // Không ghi đè nữa
        diagnosis, 
        doctor_notes, 
        follow_up_date,
        pre_exam_images: apt.pre_exam_images,
        post_exam_images: post_exam_images || []
      }, { headers: { 'Authorization': req.headers.authorization } });
    } catch (err) { 
        console.warn('Lỗi khi đồng bộ Hồ sơ y tế:', err.message); 
    }

    // ĐÃ SỬA: Lưu 5 thông tin mới vào thẳng Appointment cho Thu ngân
    if (symptoms) apt.symptoms = symptoms;
    apt.diagnosis = diagnosis;
    apt.doctor_notes = doctor_notes;
    apt.prescribed_services = spa_services || [];
    apt.prescribed_packages = treatment_package ? [treatment_package] : []; 
    apt.prescribed_medicines = prescriptions || [];
    
    apt.status = 'WAITING_FOR_SALE'; 
    await apt.save();
    res.status(200).json({ message: 'Khám xong, đã lưu Hồ sơ Y tế và chuyển Thu Ngân', data: apt });
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
    const { doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes, status } = req.body;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    apt.doctor_id = doctor_id !== undefined ? doctor_id : apt.doctor_id;
    apt.type = type || apt.type;
    apt.appointment_date = appointment_date || apt.appointment_date;
    apt.appointment_time = appointment_time || apt.appointment_time;
    apt.symptoms = symptoms || apt.symptoms;
    apt.pre_notes = pre_notes || apt.pre_notes;
    apt.status = status || apt.status; // ĐÃ SỬA: Cho phép cập nhật status (VD: Bác sĩ click để đổi thành IN_PROGRESS)
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

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    if (invoice && invoice.payment_status === 'PAID') {
       invoice.payment_status = 'REFUNDED';
       await invoice.save();

       await Transaction.create({
          invoice_id: invoice.id,
          amount: -invoice.total_amount, 
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

const checkoutAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { selected_services, selected_packages, selected_medicines, discount_amount, voucher_code, total_bill, payment_method } = req.body;

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    apt.prescribed_services = selected_services || [];
    apt.prescribed_packages = selected_packages || [];
    apt.prescribed_medicines = selected_medicines || [];
    apt.status = 'COMPLETED'; 
    await apt.save();

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    let depositPaid = 0;
    
    if (invoice) {
        if (invoice.payment_status === 'PAID') depositPaid = Number(invoice.total_amount);
        const remainingToPay = total_bill - depositPaid;

        invoice.total_amount = total_bill; 
        invoice.payment_status = 'PAID';
        invoice.payment_method = payment_method || 'CASH';
        await invoice.save();

        if (remainingToPay > 0) {
           await Transaction.create({
              invoice_id: invoice.id,
              amount: remainingToPay,
              transaction_type: 'INCOME',
              note: `Thu phần còn lại. Tổng bill: ${total_bill}, Cọc: ${depositPaid}, Giảm giá: ${discount_amount}`
           });
        }
    }

    if (selected_packages && selected_packages.length > 0) {
       for (const pkgId of selected_packages) {
          const pkgInfo = await TreatmentPackage.findByPk(pkgId);
          if (pkgInfo) {
             await CustomerPackage.create({
                customer_id: apt.customer_id, package_id: pkgId,
                total_sessions: pkgInfo.total_sessions, remaining_sessions: pkgInfo.total_sessions,
                status: 'ACTIVE'
             });
          }
       }
    }

    if (selected_medicines && selected_medicines.length > 0) {
       try {
         await axios.post('http://localhost:4000/api/commerce/products/deduct', { product_ids: selected_medicines }, { headers: { 'Authorization': req.headers.authorization } });
       } catch (err) { console.warn('Lỗi đồng bộ trừ tồn kho:', err.message); }
    }

    if (voucher_code && discount_amount > 0) {
       try {
         await axios.post('http://localhost:4000/api/commerce/promotions/increment-usage', { 
            code: voucher_code 
         }, { headers: { 'Authorization': req.headers.authorization } });
       } catch (err) { console.warn('Lỗi đồng bộ lượt dùng voucher:', err.message); }
    }

    res.status(200).json({ message: 'Chốt Sale và Thanh toán thành công!', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { 
  getMyTodayAppointments, getMyHistory, getTakenSlots, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment, 
  getAvailableDoctors, getAvailableSlots, checkoutAppointment
};