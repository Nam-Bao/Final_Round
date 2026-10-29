const { Appointment, WorkShift, Invoice, Transaction, CustomerPackage, TreatmentPackage, TreatmentSession, ServiceSession, SpaService } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');
const { isOnlineAppointment } = require('./video.controller');

// Phí khám bác sĩ 100k. Khám online trả trước toàn bộ; khám tại phòng khám cọc 50k, phần còn lại thu khi chốt sale.
// Khách cũ (đã từng hoàn tất 1 buổi khám) được miễn phí khám. Server tự quyết định, không tin số tiền / ghi chú từ client.
const EXAM_FEE = 100000;
const OFFLINE_DEPOSIT = 50000;

const calculateDeposit = async (customer_id, preNotes) => {
  const completedCount = await Appointment.count({ where: { customer_id, status: 'COMPLETED' } });
  if (completedCount > 0) return { amount: 0, isReturningCustomer: true };
  return { amount: isOnlineAppointment({ pre_notes: preNotes }) ? EXAM_FEE : OFFLINE_DEPOSIT, isReturningCustomer: false };
};

// Hóa đơn cọc 0đ nghĩa là khách cũ được miễn phí khám
const getExamFee = (invoice) => (invoice && Number(invoice.total_amount) === 0 ? 0 : EXAM_FEE);
const getDepositPaid = (invoice) => (invoice?.payment_status === 'PAID' ? Number(invoice.total_amount) : 0);

// Đánh dấu đã thu tiền cọc: lịch online vào thẳng hàng chờ bác sĩ, lịch tại phòng khám chờ check-in
const markDepositPaid = async (apt, invoice, paymentMethod, note) => {
  apt.status = isOnlineAppointment(apt) ? 'WAITING' : 'CONFIRMED';
  await apt.save();
  if (invoice && invoice.payment_status === 'PENDING') {
    invoice.payment_status = 'PAID';
    invoice.payment_method = paymentMethod;
    await invoice.save();
    if (Number(invoice.total_amount) > 0) {
      await Transaction.create({ invoice_id: invoice.id, amount: invoice.total_amount, transaction_type: 'INCOME', note });
    }
  }
};

// Tính hóa đơn chốt sale từ giá trong DB: phí khám + dịch vụ/gói/thuốc, tiền cọc đã thu được trừ đúng 1 lần.
const calculateCheckoutBill = async ({ invoice, selected_services, selected_packages, selected_medicines }) => {
  const [services, packages, productsRes] = await Promise.all([
    selected_services.length ? SpaService.findAll({ where: { id: selected_services }, raw: true }) : [],
    selected_packages.length ? TreatmentPackage.findAll({ where: { id: selected_packages }, raw: true }) : [],
    selected_medicines.length ? axios.get('http://localhost:4000/api/commerce/products') : { data: { data: [] } },
  ]);
  const products = (productsRes.data.data || []).filter(p => selected_medicines.includes(p.id));

  const scope_values = {
    SPA_SERVICE: services.reduce((s, x) => s + Number(x.price), 0),
    TREATMENT_PACKAGE: packages.reduce((s, x) => s + Number(x.promotional_price || x.price), 0),
    PRODUCT: products.reduce((s, x) => s + Number(x.price), 0),
  };
  const items_total = scope_values.SPA_SERVICE + scope_values.TREATMENT_PACKAGE + scope_values.PRODUCT;
  const exam_fee = getExamFee(invoice);
  const deposit_paid = getDepositPaid(invoice);

  return { exam_fee, deposit_paid, items_total, scope_values, gross: exam_fee + items_total };
};

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
      const patientProfile = customerInfo?.PatientProfiles?.find(p => p.id === apt.patient_profile_id);

      return {
        ...apt,
        customer_name: patientProfile?.full_name || customerInfo?.Profile?.full_name || 'Khách vãng lai',
        customer_phone: patientProfile?.phone || customerInfo?.Profile?.phone || 'Chưa cập nhật',
        dob: patientProfile?.dob || customerInfo?.Profile?.dob || null,
        gender: patientProfile?.gender || customerInfo?.Profile?.gender || 'OTHER',
        patient_profile_id: apt.patient_profile_id, 
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
    if (isOnlineAppointment({ pre_notes }) && symptoms) {
       const formattedSymptomsForDoctor = symptoms.replace(/\n/g, ' - ');
       finalPreNotes = `${pre_notes} - ${formattedSymptomsForDoctor}`;
    }

    const deposit = await calculateDeposit(customer_id, finalPreNotes);

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
      status: req.user.role === 'CUSTOMER' ? 'PENDING_PAYMENT' : 'PENDING',
      pre_exam_images: pre_exam_images || [] 
    });

    const invoice = await Invoice.create({ customer_id, appointment_id: newAppointment.id, total_amount: deposit.amount, payment_status: 'PENDING' });
    // Khách cũ miễn phí cọc: chốt lịch luôn, không cần qua trang thanh toán
    if (deposit.amount === 0 && req.user.role === 'CUSTOMER') {
      await markDepositPaid(newAppointment, invoice, 'UNKNOWN', 'Khách cũ miễn phí phí khám');
    }

    res.status(201).json({
      message: 'Tạo lịch khám thành công',
      data: newAppointment,
      deposit_amount: deposit.amount,
      is_returning_customer: deposit.isReturningCustomer
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// Khách hỏi trạng thái thanh toán + số tiền cần chuyển (lấy từ hóa đơn, không lấy từ URL)
const checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt || (req.user.role === 'CUSTOMER' && apt.customer_id !== req.user.id)) {
      return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    }
    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    res.status(200).json({
      isPaid: apt.status !== 'PENDING_PAYMENT',
      amount: invoice ? Number(invoice.total_amount) : 0,
      exam_fee: getExamFee(invoice),
      is_online: isOnlineAppointment(apt)
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] Nhân viên xác nhận khách đã đóng cọc bằng tiền mặt tại quầy
const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (apt.status !== 'PENDING_PAYMENT') return res.status(400).json({ message: 'Lịch hẹn này không ở trạng thái chờ thanh toán' });

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    await markDepositPaid(apt, invoice, 'CASH', `Thu cọc tiền mặt tại quầy (NV ${req.user.id})`);
    res.status(200).json({ message: 'Xác nhận thanh toán thành công!', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// Webhook SePay báo có tiền chuyển khoản vào tài khoản.
// SePay gửi header "Authorization: Apikey <SEPAY_API_KEY>" — không khớp thì bỏ qua để chống giả mạo.
const sepayWebhook = async (req, res) => {
  const expectedKey = process.env.SEPAY_API_KEY;
  if (!expectedKey) {
    console.error('[SePay] Chưa cấu hình SEPAY_API_KEY — từ chối mọi webhook');
    return res.status(503).json({ success: false, message: 'Webhook chưa được cấu hình' });
  }
  if (req.headers.authorization !== `Apikey ${expectedKey}`) {
    return res.status(401).json({ success: false, message: 'Sai API key' });
  }

  try {
    const { transferAmount, content, transferType } = req.body;
    if (transferType && transferType !== 'in') return res.status(200).json({ success: true });
    if (Number(transferAmount) > 0 && content) {
      const match = content.match(/O2O\s?([a-zA-Z0-9]{6})/i);
      if (match) {
        const orderCode = match[1].toLowerCase();
        const pendingApts = await Appointment.findAll({ where: { status: 'PENDING_PAYMENT' } });
        const apt = pendingApts.find(a => a.id.toLowerCase().startsWith(orderCode));

        if (apt) {
           const invoice = await Invoice.findOne({ where: { appointment_id: apt.id } });
           if (invoice && Number(transferAmount) >= Number(invoice.total_amount)) {
               await markDepositPaid(apt, invoice, 'VIETQR', `Khách thanh toán cọc VietQR cho đơn ${orderCode.toUpperCase()}`);
           }
        }
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message }); 
  }
};

const getConsultantQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const appointments = await Appointment.findAll({
      where: { status: { [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING_FOR_SALE', 'NEEDS_RESCHEDULE'] } }, raw: true
    });
    
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
      const exam_fee = getExamFee(invoice);
      const deposit_paid = getDepositPaid(invoice);

      const enrichedApt = {
        ...apt,
        customer_name: patientProfile?.full_name || customerInfo?.Profile?.full_name || 'Khách hàng',
        customer_phone: patientProfile?.phone || customerInfo?.Profile?.phone || '',
        exam_fee,
        deposit_paid
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
        symptoms: symptoms || apt.symptoms || apt.pre_notes,
        diagnosis, 
        doctor_notes, 
        follow_up_date,
        pre_exam_images: apt.pre_exam_images,
        post_exam_images: post_exam_images || []
      }, { headers: { 'Authorization': req.headers.authorization } });
    } catch (err) { console.warn('Lỗi khi đồng bộ Hồ sơ y tế:', err.message); }

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
    apt.status = status || apt.status; 
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
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
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
    // Tổng tiền và số tiền giảm KHÔNG lấy từ client — server tự tính lại từ giá trong DB
    const { selected_services = [], selected_packages = [], selected_medicines = [], voucher_code, payment_method } = req.body;

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (apt.status !== 'WAITING_FOR_SALE') {
      return res.status(400).json({ message: 'Lịch hẹn chưa khám xong hoặc đã được thanh toán' });
    }

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    const bill = await calculateCheckoutBill({ invoice, selected_services, selected_packages, selected_medicines });

    // Kiểm tra lại voucher + ghi nhận khách đã dùng (trước khi thay đổi dữ liệu, mã sai thì dừng luôn)
    let discountAmount = 0;
    if (voucher_code) {
      try {
        const redeemRes = await axios.post('http://localhost:4000/api/commerce/promotions/redeem', {
          code: voucher_code,
          customer_id: apt.customer_id,
          order_value: bill.gross,
          scope_values: bill.scope_values
        }, { headers: { 'Authorization': req.headers.authorization } });
        discountAmount = Number(redeemRes.data.data.discount_amount) || 0;
      } catch (err) {
        return res.status(400).json({ message: err.response?.data?.message || 'Không áp dụng được mã giảm giá' });
      }
    }

    const totalBill = Math.max(0, bill.gross - discountAmount);
    // Tiền cọc đã thu chính là phí khám → chỉ trừ 1 lần
    const amountDueNow = Math.max(0, totalBill - bill.deposit_paid);

    apt.prescribed_services = selected_services;
    apt.prescribed_packages = selected_packages;
    apt.prescribed_medicines = selected_medicines;
    apt.status = 'COMPLETED';
    await apt.save();

    if (invoice) {
        invoice.total_amount = totalBill;
        invoice.payment_status = 'PAID';
        invoice.payment_method = payment_method || 'CASH';
        await invoice.save();

        if (amountDueNow > 0) {
           await Transaction.create({
              invoice_id: invoice.id,
              amount: amountDueNow,
              transaction_type: 'INCOME',
              note: `Thu phần còn lại. Phí khám: ${bill.exam_fee}, Dịch vụ/SP: ${bill.items_total}, Giảm giá: ${discountAmount}, Đã cọc: ${bill.deposit_paid}`
           });
        }
    }

    const today = dayjs().format('YYYY-MM-DD');
    const shifts = await WorkShift.findAll({ where: { date: today, status: { [Op.in]: ['SCHEDULED', 'ATTENDED'] } }, raw: true });
    const scheduledEmployeeIds = [...new Set(shifts.map(s => s.employee_id))];

    let chosenTechnicianId = null;
    if (scheduledEmployeeIds.length > 0) {
        try {
            const resUsers = await axios.get('http://localhost:4000/api/identity/users', { headers: { 'Authorization': req.headers.authorization } });
            const availableKTVs = resUsers.data.data.filter(u => u.role === 'TECHNICIAN' && scheduledEmployeeIds.includes(u.id));

            let minLoad = Infinity;
            for (const ktv of availableKTVs) {
                const tCount = await TreatmentSession.count({ where: { session_date: today, technician_id: ktv.id } });
                const sCount = await ServiceSession.count({ where: { session_date: today, technician_id: ktv.id } });
                const totalLoad = tCount + sCount;
                if (totalLoad < minLoad) {
                    minLoad = totalLoad;
                    chosenTechnicianId = ktv.id;
                }
            }
        } catch (err) { console.warn('Lỗi auto-routing KTV:', err.message); }
    }

    if (selected_packages && selected_packages.length > 0) {
       for (const pkgId of selected_packages) {
          const pkgInfo = await TreatmentPackage.findByPk(pkgId);
          if (pkgInfo) {
             const newPkg = await CustomerPackage.create({
                customer_id: apt.customer_id, package_id: pkgId,
                total_sessions: pkgInfo.total_sessions, remaining_sessions: pkgInfo.total_sessions,
                status: 'ACTIVE'
             });
             await TreatmentSession.create({
                customer_package_id: newPkg.id, technician_id: chosenTechnicianId,
                patient_profile_id: apt.patient_profile_id, // THÊM ID HỒ SƠ
                session_number: 1, session_date: today, status: 'WAITING'
             });
          }
       }
    }

    if (selected_services && selected_services.length > 0) {
       for (const srvId of selected_services) {
           await ServiceSession.create({
              customer_id: apt.customer_id, spa_service_id: srvId,
              patient_profile_id: apt.patient_profile_id, // THÊM ID HỒ SƠ
              technician_id: chosenTechnicianId, session_date: today, status: 'WAITING'
           });
       }
    }

    if (selected_medicines && selected_medicines.length > 0) {
       try {
         await axios.post('http://localhost:4000/api/commerce/products/deduct', { product_ids: selected_medicines }, { headers: { 'Authorization': req.headers.authorization } });
       } catch (err) { console.warn('Lỗi đồng bộ trừ tồn kho:', err.message); }
    }

    res.status(200).json({
      message: 'Chốt Sale và Thanh toán thành công!',
      data: apt,
      bill: { ...bill, discount_amount: discountAmount, total_bill: totalBill, amount_due_now: amountDueNow }
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const getAppointmentsByPatient = async (req, res) => {
  try {
    const { patientProfileId } = req.params;
    const apts = await Appointment.findAll({
      where: { patient_profile_id: patientProfileId },
      raw: true
    });
    res.status(200).json({ data: apts });
  } catch (error) { 
    res.status(500).json({ message: 'Lỗi server', error: error.message }); 
  }
};

module.exports = { 
  getMyTodayAppointments, getMyHistory, getTakenSlots, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment, 
  getAvailableDoctors, getAvailableSlots, checkoutAppointment, getAppointmentsByPatient
};