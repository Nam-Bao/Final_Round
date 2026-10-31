const { sequelize, Appointment, WorkShift, Invoice, Transaction, CustomerPackage, TreatmentPackage, TreatmentSession, ServiceSession, SpaService } = require('../models');
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

// ===== GIỮ CHỖ CHỜ THANH TOÁN =====
// Lịch khách tự đặt ở trạng thái PENDING_PAYMENT chỉ giữ ca khám trong PAYMENT_HOLD_MINUTES phút.
// Khách rời trang thanh toán (bấm quay lại) hoặc quá hạn mà chưa trả => xóa hẳn lịch + hóa đơn cọc, trả ca về trống.
const PAYMENT_HOLD_MINUTES = Number(process.env.PAYMENT_HOLD_MINUTES || 15);
const holdExpiresAt = (apt) => new Date(new Date(apt.createdAt).getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000);

const discardUnpaid = (where) => sequelize.transaction(async (t) => {
  const apts = await Appointment.findAll({ where: { ...where, status: 'PENDING_PAYMENT' }, transaction: t, lock: t.LOCK.UPDATE });
  if (!apts.length) return 0;
  const ids = apts.map(a => a.id);
  await Invoice.destroy({ where: { appointment_id: { [Op.in]: ids }, payment_status: 'PENDING' }, transaction: t });
  await Appointment.destroy({ where: { id: { [Op.in]: ids } }, transaction: t });
  return ids.length;
});

const releaseExpiredHolds = async () => {
  try {
    const n = await discardUnpaid({ createdAt: { [Op.lt]: new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000) } });
    if (n) console.log(`🧹 [HOLD] Đã giải phóng ${n} lịch quá ${PAYMENT_HOLD_MINUTES} phút chưa thanh toán`);
  } catch (err) { console.warn('[HOLD] Lỗi giải phóng lịch quá hạn:', err.message); }
};

// Khách rời trang thanh toán mà chưa trả tiền => hủy giữ chỗ ngay
const abandonUnpaidAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(200).json({ message: 'Lịch giữ chỗ đã được giải phóng' });
    if (apt.customer_id !== req.user.id) return res.status(403).json({ message: 'Bạn không có quyền với lịch hẹn này' });
    if (apt.status !== 'PENDING_PAYMENT') return res.status(409).json({ message: 'Lịch hẹn đã được thanh toán, không thể hủy giữ chỗ' });
    await discardUnpaid({ id });
    res.status(200).json({ message: 'Đã hủy giữ chỗ, ca khám được trả lại' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const getTakenSlots = async (req, res) => {
  try {
    await releaseExpiredHolds(); // Ca của lịch quá hạn thanh toán phải hiện trống ngay, không chờ job định kỳ
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

// ===== TIỀN CỌC: server là nơi DUY NHẤT quyết định (không dựa vào số tiền/ghi chú client gửi lên) =====
const EXAM_FEE = 100000;        // Phí thăm khám niêm yết (khách cũ được miễn)
const DEPOSIT_OFFLINE = 50000;  // Khách mới khám trực tiếp: cọc giữ chỗ, phần còn lại thu tại quầy khi chốt bill
const DEPOSIT_ONLINE = EXAM_FEE; // Khách mới khám online: trả trước toàn bộ phí khám
// "Khách cũ" (miễn cọc + miễn phí khám) xét theo HỒ SƠ NGƯỜI ĐƯỢC KHÁM, không theo tài khoản:
// người thân lần đầu khám vẫn phải cọc và trả phí khám. Chỉ tính lịch đã được thanh toán/phục vụ
// (lịch hủy hoặc chưa trả tiền KHÔNG tính, để không thể đặt 1 lịch bỏ đó rồi đặt lịch thứ 2 miễn phí).
const SERVED_STATUSES = ['CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS', 'WAITING_FOR_SALE', 'COMPLETED', 'NEEDS_RESCHEDULE'];
const SELF_RELATIONSHIP = 'Bản thân';

// Lịch tạo trước khi model có cột patient_profile_id bị lưu null => coi là lịch của hồ sơ "Bản thân"
const isOldPatient = async (customer_id, profile) => {
  const profileMatch = profile.relationship === SELF_RELATIONSHIP
    ? { [Op.or]: [{ patient_profile_id: profile.id }, { patient_profile_id: null }] }
    : { patient_profile_id: profile.id };
  return (await Appointment.count({ where: { customer_id, ...profileMatch, status: { [Op.in]: SERVED_STATUSES } } })) > 0;
};

const isOnlineNote = (notes) => /\[(Khám )?ONLINE\]/i.test(notes || '');

const computeDeposit = async (customer_id, profile, isOnline) => {
  if (await isOldPatient(customer_id, profile)) return 0;
  return isOnline ? DEPOSIT_ONLINE : DEPOSIT_OFFLINE;
};

// Lấy hồ sơ người bệnh của 1 tài khoản từ service-identity (khách: hồ sơ của chính mình; nhân viên: theo userId)
const findPatientProfile = async (req, customer_id, patient_profile_id) => {
  const url = req.user.role === 'CUSTOMER'
    ? 'http://localhost:4000/api/identity/profile/patients'
    : `http://localhost:4000/api/identity/profile/patients/user/${customer_id}`;
  const profRes = await axios.get(url, { headers: { 'Authorization': req.headers.authorization } });
  return (profRes.data?.data || []).find(p => p.id === patient_profile_id) || null;
};

// Phí khám của 1 lịch được chốt lúc ĐẶT LỊCH, suy ra từ hóa đơn cọc: cọc 0đ <=> khách cũ (miễn phí khám).
// Không tính lại lúc thanh toán vì khi đó chính lịch này đã làm khách thành "khách cũ".
const examFeeOf = (invoice) => (invoice && Number(invoice.total_amount) > 0 ? EXAM_FEE : 0);

// Báo giá cọc cho màn hình đặt lịch (cùng công thức với lúc tạo lịch => số hiển thị luôn khớp số phải trả)
const getDepositQuote = async (req, res) => {
  try {
    const { patient_profile_id } = req.query;
    if (!patient_profile_id) return res.status(400).json({ message: 'Thiếu hồ sơ người khám' });
    let profile;
    try { profile = await findPatientProfile(req, req.user.id, patient_profile_id); }
    catch (err) { return res.status(503).json({ message: 'Không xác minh được hồ sơ người bệnh, vui lòng thử lại' }); }
    if (!profile) return res.status(403).json({ message: 'Hồ sơ người bệnh không thuộc tài khoản của bạn' });

    const old = await isOldPatient(req.user.id, profile);
    res.status(200).json({ data: { isOldCustomer: old, examFee: EXAM_FEE, online: old ? 0 : DEPOSIT_ONLINE, offline: old ? 0 : DEPOSIT_OFFLINE } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const createAppointment = async (req, res) => {
  try {
    const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : req.body.customer_id;
    const { patient_profile_id, doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes, pre_exam_images } = req.body;

    if (!appointment_date || !appointment_time || !customer_id || !patient_profile_id) {
       return res.status(400).json({ message: 'Vui lòng điền đủ thông tin hồ sơ và thời gian' });
    }

    // Hồ sơ người bệnh phải thuộc đúng tài khoản (cần cả quan hệ "Bản thân"/người thân để tính cọc)
    let profile;
    try { profile = await findPatientProfile(req, customer_id, patient_profile_id); }
    catch (err) { return res.status(503).json({ message: 'Không xác minh được hồ sơ người bệnh, vui lòng thử lại' }); }
    if (!profile) return res.status(403).json({ message: 'Hồ sơ người bệnh không thuộc tài khoản của khách' });

    // Chống đặt trùng: 1 bác sĩ chỉ nhận 1 lịch tại 1 khung giờ (lịch giữ chỗ quá hạn thanh toán không tính)
    if (doctor_id) {
      await releaseExpiredHolds();
      const clash = await Appointment.count({
        where: { doctor_id, appointment_date, appointment_time, status: { [Op.notIn]: ['CANCELLED'] } }
      });
      if (clash > 0) return res.status(409).json({ message: 'Khung giờ này của bác sĩ đã có người đặt, vui lòng chọn giờ khác' });
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
      status: req.user.role === 'CUSTOMER' ? 'PENDING_PAYMENT' : 'PENDING',
      pre_exam_images: pre_exam_images || [] 
    });

    const depositAmount = await computeDeposit(customer_id, profile, isOnlineNote(finalPreNotes));

    await Invoice.create({ customer_id, appointment_id: newAppointment.id, total_amount: depositAmount, payment_status: 'PENDING' });

    res.status(201).json({ message: 'Tạo lịch khám thành công', data: newAppointment, deposit_amount: depositAmount });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Lịch giữ chỗ đã hết hạn hoặc đã bị hủy, vui lòng đặt lại' });
    if (req.user.role === 'CUSTOMER' && apt.customer_id !== req.user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền xem lịch hẹn này' });
    }
    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    const isPaid = apt.status !== 'PENDING_PAYMENT';
    // Trả kèm số tiền cần thanh toán do server tính => trang thanh toán không đọc số tiền từ URL nữa
    res.status(200).json({
      isPaid,
      status: apt.status,
      amount: invoice ? Number(invoice.total_amount) : 0,
      isOnline: isOnlineNote(apt.pre_notes),
      holdExpiresAt: apt.status === 'PENDING_PAYMENT' ? holdExpiresAt(apt) : null // Trang thanh toán đếm ngược
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (apt.status !== 'PENDING_PAYMENT' && apt.status !== 'PENDING') {
      return res.status(400).json({ message: 'Lịch hẹn này không ở trạng thái chờ thanh toán' });
    }

    const pendingInvoice = await Invoice.findOne({ where: { appointment_id: id } });
    if (req.user.role === 'CUSTOMER') {
      // Khách chỉ được tự chốt lịch của chính mình VÀ khi cọc = 0đ (khách cũ). Có cọc thì phải chờ SePay xác nhận.
      if (apt.customer_id !== req.user.id) return res.status(403).json({ message: 'Bạn không có quyền với lịch hẹn này' });
      if (!pendingInvoice || Number(pendingInvoice.total_amount) > 0) {
        return res.status(403).json({ message: 'Lịch hẹn cần thanh toán cọc, hệ thống sẽ tự xác nhận khi nhận được tiền' });
      }
    }

    if (apt.pre_notes?.includes('[Khám ONLINE]') && apt.pre_notes?.includes('TÌNH TRẠNG DA')) {
       apt.status = 'WAITING'; 
    } else {
       apt.status = 'CONFIRMED'; 
    }
    await apt.save();

    const invoice = pendingInvoice;
    if (invoice && invoice.payment_status === 'PENDING') {
       invoice.payment_status = 'PAID';
       invoice.payment_method = 'CASH';
       await invoice.save();
       // Ghi sổ thu tiền mặt tại quầy (trước đây chỉ có luồng VietQR mới ghi Transaction)
       if (Number(invoice.total_amount) > 0) {
         await Transaction.create({
           invoice_id: invoice.id, amount: invoice.total_amount, transaction_type: 'INCOME',
           note: `Thu cọc tại quầy cho đơn ${id.slice(0, 6).toUpperCase()} (NV ${req.user.id.slice(0, 8)})`
         });
       }
    }
    res.status(200).json({ message: 'Xác nhận thanh toán thành công!', data: apt });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const sepayWebhook = async (req, res) => {
  try {
    const { transferAmount, content } = req.body;
    if (transferAmount > 0 && content) {
      // SePay gửi MỌI giao dịch tới cả webhook đặt lịch lẫn webhook mỹ phẩm => chỉ nhận mã "O2O xxxxxx" đứng riêng
      const match = content.match(/(?<![a-z0-9])O2O\s?([a-z0-9]{6})/i);
      if (match) {
        const orderCode = match[1].toLowerCase();
        const pendingApts = await Appointment.findAll({ where: { status: 'PENDING_PAYMENT' } });
        const candidates = pendingApts.filter(a => a.id.toLowerCase().startsWith(orderCode));
        // Mã 6 ký tự có thể trùng giữa 2 lịch => không tự đoán, để nhân viên đối soát tay
        if (candidates.length > 1) console.warn(`⚠️ [SEPAY] Mã O2O ${orderCode} khớp ${candidates.length} lịch hẹn, cần đối soát tay`);
        // Không khớp lịch nào: thường là khách chuyển tiền SAU khi lịch giữ chỗ đã hết hạn/bị hủy => cần hoàn tiền tay
        if (candidates.length === 0) console.warn(`⚠️ [SEPAY] Nhận ${transferAmount}đ mã O2O ${orderCode} nhưng không còn lịch chờ thanh toán, cần đối soát/hoàn tiền tay`);
        const apt = candidates.length === 1 ? candidates[0] : null;

        if (apt) {
           const invoice = await Invoice.findOne({ where: { appointment_id: apt.id } });
           if (invoice && Number(transferAmount) >= Number(invoice.total_amount)) {
               if (apt.pre_notes?.includes('[Khám ONLINE]') && apt.pre_notes?.includes('TÌNH TRẠNG DA')) apt.status = 'WAITING'; 
               else apt.status = 'CONFIRMED'; 
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
      const deposit_paid = (invoice && invoice.payment_status === 'PAID') ? Number(invoice.total_amount) : 0;

      const enrichedApt = {
        ...apt,
        customer_name: patientProfile?.full_name || customerInfo?.Profile?.full_name || 'Khách hàng',
        customer_phone: patientProfile?.phone || customerInfo?.Profile?.phone || '',
        deposit_paid,
        exam_fee: examFeeOf(invoice) // Màn hình thu ngân dùng đúng số server sẽ tính khi chốt bill
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

    // Chỉ hủy được lịch CHƯA khám. Lịch đã khám/đã chốt bill thì hóa đơn đã là tổng bill,
    // nếu cho hủy sẽ sinh giao dịch hoàn tiền toàn bộ bill (lỗi cũ).
    const cancellable = req.user.role === 'CUSTOMER'
      ? ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE']
      : ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE', 'CHECK_IN', 'WAITING'];
    if (!cancellable.includes(apt.status)) {
       return res.status(400).json({ message: 'Lịch hẹn đã khám hoặc đã hủy, không thể hủy nữa' });
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
    await releaseExpiredHolds();
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

// Tính tổng bill tại server từ giá trong DB (không tin total_bill/discount_amount client gửi lên)
const priceCheckoutItems = async ({ examFee, services, packages, medicines, voucherCode, customerId, authHeader }) => {
  const fail = (status, message) => Object.assign(new Error(message), { status });

  const srvRows = services.length ? await SpaService.findAll({ where: { id: { [Op.in]: services }, status: 'ACTIVE' }, raw: true }) : [];
  const pkgRows = packages.length ? await TreatmentPackage.findAll({ where: { id: { [Op.in]: packages }, status: 'ACTIVE' }, raw: true }) : [];
  let productRows = [];
  if (medicines.length) {
    try {
      productRows = (await axios.get('http://localhost:4000/api/commerce/products')).data?.data || [];
    } catch (err) { throw fail(503, 'Không lấy được giá dược mỹ phẩm, vui lòng thử lại'); }
  }

  const sumPrices = (ids, rows, getPrice, label) => ids.reduce((sum, itemId) => {
    const row = rows.find(r => r.id === itemId);
    if (!row) throw fail(400, `${label} không tồn tại hoặc đã ngừng bán (${itemId})`);
    return sum + Number(getPrice(row));
  }, 0);

  const subtotal = examFee +
    sumPrices(services, srvRows, r => r.price, 'Dịch vụ') +
    sumPrices(packages, pkgRows, r => r.promotional_price || r.price, 'Gói liệu trình') +
    sumPrices(medicines, productRows, r => r.price, 'Sản phẩm');

  let discount = 0;
  if (voucherCode) {
    try {
      const promoRes = await axios.post('http://localhost:4000/api/commerce/promotions/apply',
        { code: voucherCode, order_value: subtotal, customer_id: customerId },
        { headers: { 'Authorization': authHeader } });
      discount = Number(promoRes.data?.data?.discount_amount) || 0;
    } catch (err) {
      throw fail(400, err.response?.data?.message || 'Mã giảm giá không hợp lệ');
    }
  }

  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
};

const checkoutAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { voucher_code, total_bill: clientTotal } = req.body;
    const selected_services = Array.isArray(req.body.selected_services) ? req.body.selected_services : [];
    const selected_packages = Array.isArray(req.body.selected_packages) ? req.body.selected_packages : [];
    const selected_medicines = Array.isArray(req.body.selected_medicines) ? req.body.selected_medicines : [];
    const payment_method = ['CASH', 'VIETQR'].includes(req.body.payment_method) ? req.body.payment_method : 'CASH';

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    // Chỉ chốt bill cho lịch vừa khám xong; bấm 2 lần sẽ bị chặn (tránh tạo trùng gói/ca KTV)
    if (apt.status !== 'WAITING_FOR_SALE') {
      return res.status(400).json({ message: 'Lịch hẹn không ở trạng thái chờ chốt bill (có thể đã thanh toán rồi)' });
    }

    // Tổng bill = phí khám (đã chốt lúc đặt lịch) + dịch vụ/gói/sản phẩm - voucher. Cọc đã trả được trừ khi thu tiền.
    const depositInvoice = await Invoice.findOne({ where: { appointment_id: id } });
    let bill;
    try {
      bill = await priceCheckoutItems({
        examFee: examFeeOf(depositInvoice),
        services: selected_services, packages: selected_packages, medicines: selected_medicines,
        voucherCode: voucher_code, customerId: apt.customer_id, authHeader: req.headers.authorization
      });
    } catch (err) { return res.status(err.status || 500).json({ message: err.message }); }
    const total_bill = bill.total;
    let remainingToPay = 0;
    if (clientTotal != null && Number(clientTotal) !== total_bill) {
      console.warn(`⚠️ [CHECKOUT] Tổng bill client gửi (${clientTotal}) khác server tính (${total_bill}) cho lịch ${id}, dùng số của server`);
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

    // Toàn bộ thao tác ghi DB của booking nằm trong 1 transaction: lỗi giữa chừng => không còn dữ liệu nửa vời
    try {
      await sequelize.transaction(async (t) => {
        // Khóa dòng lịch hẹn và kiểm tra lại trạng thái => 2 request chốt bill cùng lúc thì chỉ 1 cái chạy
        const locked = await Appointment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (locked.status !== 'WAITING_FOR_SALE') throw Object.assign(new Error('Lịch hẹn đã được chốt bill'), { status: 409 });

        locked.prescribed_services = selected_services;
        locked.prescribed_packages = selected_packages;
        locked.prescribed_medicines = selected_medicines;
        locked.status = 'COMPLETED';
        await locked.save({ transaction: t });

        const invoice = await Invoice.findOne({ where: { appointment_id: id }, transaction: t });
        if (invoice) {
            const depositPaid = invoice.payment_status === 'PAID' ? Number(invoice.total_amount) : 0;
            remainingToPay = Math.max(0, total_bill - depositPaid);
            invoice.total_amount = total_bill;
            invoice.payment_status = 'PAID';
            invoice.payment_method = payment_method;
            await invoice.save({ transaction: t });

            if (remainingToPay > 0) {
               await Transaction.create({
                  invoice_id: invoice.id,
                  amount: remainingToPay,
                  transaction_type: 'INCOME',
                  note: `Thu phần còn lại (${payment_method}). Tạm tính: ${bill.subtotal}, Giảm giá: ${bill.discount}, Tổng bill: ${total_bill}, Cọc: ${depositPaid}`
               }, { transaction: t });
            }
        }

        for (const pkgId of selected_packages) {
           const pkgInfo = await TreatmentPackage.findByPk(pkgId, { transaction: t });
           const newPkg = await CustomerPackage.create({
              customer_id: locked.customer_id, package_id: pkgId,
              total_sessions: pkgInfo.total_sessions, remaining_sessions: pkgInfo.total_sessions,
              status: 'ACTIVE'
           }, { transaction: t });
           await TreatmentSession.create({
              customer_package_id: newPkg.id, technician_id: chosenTechnicianId,
              patient_profile_id: locked.patient_profile_id,
              session_number: 1, session_date: today, status: 'WAITING'
           }, { transaction: t });
        }

        for (const srvId of selected_services) {
           await ServiceSession.create({
              customer_id: locked.customer_id, spa_service_id: srvId,
              patient_profile_id: locked.patient_profile_id,
              technician_id: chosenTechnicianId, session_date: today, status: 'WAITING'
           }, { transaction: t });
        }
      });
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi khi lưu thanh toán', error: err.message });
    }

    // Đồng bộ sang service-commerce SAU khi đã lưu thành công (không nằm trong transaction được vì là service khác)
    if (selected_medicines.length > 0) {
       try {
         await axios.post('http://localhost:4000/api/commerce/products/deduct', { product_ids: selected_medicines }, { headers: { 'Authorization': req.headers.authorization } });
       } catch (err) { console.warn('Lỗi đồng bộ trừ tồn kho:', err.message); }
    }

    if (voucher_code && bill.discount > 0) {
       try {
         await axios.post('http://localhost:4000/api/commerce/promotions/increment-usage', { code: voucher_code, customer_id: apt.customer_id }, { headers: { 'Authorization': req.headers.authorization } });
       } catch (err) { console.warn('Lỗi đồng bộ lượt dùng voucher:', err.message); }
    }

    res.status(200).json({ message: 'Chốt Sale và Thanh toán thành công!', data: { id, total_bill, subtotal: bill.subtotal, discount_amount: bill.discount, collected: remainingToPay } });
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
  getMyTodayAppointments, getMyHistory, getTakenSlots, getDepositQuote, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment, 
  getAvailableDoctors, getAvailableSlots, checkoutAppointment, getAppointmentsByPatient,
  abandonUnpaidAppointment, releaseExpiredHolds
};