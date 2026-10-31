const { sequelize, Appointment, WorkShift, Invoice, Transaction, CustomerPackage, TreatmentPackage, TreatmentSession, ServiceSession, SpaService } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');
const { isOnlineAppointment } = require('./video.controller');

// Phí khám bác sĩ 100k. Khám online trả trước toàn bộ; khám tại phòng khám cọc 50k, phần còn lại thu khi chốt sale.
// Server tự quyết định, không tin số tiền / ghi chú từ client.
const EXAM_FEE = 100000;
const OFFLINE_DEPOSIT = 50000;

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

const calculateDeposit = async (customer_id, profile, preNotes) => {
  if (await isOldPatient(customer_id, profile)) return { amount: 0, isReturningCustomer: true };
  return { amount: isOnlineAppointment({ pre_notes: preNotes }) ? EXAM_FEE : OFFLINE_DEPOSIT, isReturningCustomer: false };
};

// Lấy hồ sơ người bệnh của 1 tài khoản từ service-identity (khách: hồ sơ của chính mình; nhân viên: theo userId).
// Trả về hồ sơ (null nếu không thuộc tài khoản); không gọi được identity => ném lỗi để trả 503.
const findPatientProfile = async (req, customer_id, patient_profile_id) => {
  const url = req.user.role === 'CUSTOMER'
    ? 'http://localhost:4000/api/identity/profile/patients'
    : `http://localhost:4000/api/identity/profile/patients/user/${encodeURIComponent(customer_id)}`;
  // identity trả lỗi (không có quyền / không tìm thấy) -> coi như hồ sơ không hợp lệ
  const profRes = await axios.get(url, { headers: { Authorization: req.headers.authorization } })
    .catch(err => { if (err.response) return { data: { data: [] } }; throw err; });
  return (profRes.data?.data || []).find(p => p.id === patient_profile_id) || null;
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
    res.status(200).json({ data: { isOldCustomer: old, examFee: EXAM_FEE, online: old ? 0 : EXAM_FEE, offline: old ? 0 : OFFLINE_DEPOSIT } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
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

// Đơn thuốc / mỹ phẩm: [{ product_id, quantity }]. Vẫn nhận dữ liệu cũ dạng mảng mã sản phẩm (mỗi mã = 1 sản phẩm).
// Gộp dòng trùng, số lượng 1 - 20.
const normalizeMedicines = (list) => {
  const qty = {};
  (Array.isArray(list) ? list : []).forEach((m) => {
    const productId = typeof m === 'string' ? m : (m?.product_id || m?.id);
    const quantity = typeof m === 'string' ? 1 : Math.min(Math.max(parseInt(m?.quantity, 10) || 1, 1), 20);
    if (productId) qty[productId] = Math.min((qty[productId] || 0) + quantity, 20);
  });
  return Object.entries(qty).map(([product_id, quantity]) => ({ product_id, quantity }));
};

class CheckoutError extends Error {}

// Tính hóa đơn chốt sale từ giá trong DB: phí khám + dịch vụ/gói/thuốc, tiền cọc đã thu được trừ đúng 1 lần.
// selected_medicines đã được normalizeMedicines; báo lỗi nếu sản phẩm không còn bán hoặc không đủ hàng.
const calculateCheckoutBill = async ({ invoice, selected_services, selected_packages, selected_medicines }) => {
  const [services, packages, productsRes] = await Promise.all([
    selected_services.length ? SpaService.findAll({ where: { id: selected_services }, raw: true }) : [],
    selected_packages.length ? TreatmentPackage.findAll({ where: { id: selected_packages }, raw: true }) : [],
    selected_medicines.length ? axios.get('http://localhost:4000/api/commerce/products') : { data: { data: [] } },
  ]);
  const catalog = productsRes.data.data || [];
  const productLines = selected_medicines.map((m) => {
    const product = catalog.find(p => p.id === m.product_id);
    if (!product) throw new CheckoutError('Có sản phẩm trong đơn không còn bán, vui lòng chọn lại');
    if (Number(product.stock_quantity || 0) < m.quantity) {
      throw new CheckoutError(`Sản phẩm ${product.name} chỉ còn ${product.stock_quantity || 0} trong kho`);
    }
    return Number(product.price) * m.quantity;
  });

  const scope_values = {
    SPA_SERVICE: services.reduce((s, x) => s + Number(x.price), 0),
    TREATMENT_PACKAGE: packages.reduce((s, x) => s + Number(x.promotional_price || x.price), 0),
    PRODUCT: productLines.reduce((s, x) => s + x, 0),
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

// Khung giờ khám theo ca (khớp với getAvailableSlots và trang đặt lịch)
const SHIFT_SLOTS = {
  MORNING: ['08:00', '09:00', '10:00', '11:00'],
  AFTERNOON: ['13:00', '14:00', '15:00', '16:00'],
  EVENING: ['18:00', '19:00', '20:00']
};

// Trả về { status, message } nếu không đặt được, null nếu hợp lệ. Giờ tính theo múi giờ của server (VN).
const validateAppointmentSlot = async ({ doctor_id, appointment_date, appointment_time, isCustomer, excludeId }) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(appointment_time)) {
    return { status: 400, message: 'Ngày hoặc giờ khám không hợp lệ' };
  }
  const time = appointment_time.slice(0, 5);
  const slotStart = dayjs(`${appointment_date} ${time}`);
  if (!slotStart.isValid() || slotStart.format('YYYY-MM-DD') !== appointment_date) {
    return { status: 400, message: 'Ngày hoặc giờ khám không hợp lệ' };
  }
  // Khách chỉ đặt giờ trong tương lai; nhân viên được xếp lịch trong ngày (khách vãng lai tới quầy) nhưng không lùi ngày
  if (isCustomer ? !slotStart.isAfter(dayjs()) : slotStart.isBefore(dayjs(), 'day')) {
    return { status: 400, message: 'Không thể đặt lịch vào thời gian đã qua, vui lòng chọn ngày giờ khác' };
  }
  if (!doctor_id) return null;

  const shifts = await WorkShift.findAll({ where: { employee_id: doctor_id, date: appointment_date, status: 'SCHEDULED' }, raw: true });
  if (!shifts.some(s => (SHIFT_SLOTS[s.shift_type] || []).includes(time))) {
    return { status: 400, message: 'Bác sĩ không có lịch làm việc vào giờ này, vui lòng chọn giờ khác' };
  }
  const taken = await Appointment.count({
    where: {
      doctor_id, appointment_date, appointment_time: { [Op.in]: [time, `${time}:00`] }, status: { [Op.notIn]: ['CANCELLED'] },
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
    }
  });
  if (taken > 0) return { status: 409, message: 'Giờ này vừa có người đặt, vui lòng chọn giờ khác' };
  return null;
};

// Khi nhân viên đổi bác sĩ / ngày / giờ của lịch có sẵn: kiểm tra lại khung giờ mới
const validateSlotChange = (apt, { doctor_id, appointment_date, appointment_time }) => {
  const next = {
    doctor_id: doctor_id !== undefined ? doctor_id : apt.doctor_id,
    appointment_date: appointment_date || apt.appointment_date,
    appointment_time: String(appointment_time || apt.appointment_time)
  };
  const changed = next.doctor_id !== apt.doctor_id || next.appointment_date !== apt.appointment_date
    || next.appointment_time.slice(0, 5) !== String(apt.appointment_time).slice(0, 5);
  return changed ? validateAppointmentSlot({ ...next, isCustomer: false, excludeId: apt.id }) : null;
};

const createAppointment = async (req, res) => {
  try {
    const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : req.body.customer_id; 
    const { patient_profile_id, doctor_id, type, appointment_date, appointment_time, symptoms, pre_notes, pre_exam_images } = req.body;

    if (!appointment_date || !appointment_time || !customer_id || !patient_profile_id) {
       return res.status(400).json({ message: 'Vui lòng điền đủ thông tin hồ sơ và thời gian' });
    }

    // Ngày giờ hợp lệ, không ở quá khứ, đúng ca làm của bác sĩ và chưa ai đặt (lịch giữ chỗ quá hạn thanh toán không tính)
    await releaseExpiredHolds();
    const slotError = await validateAppointmentSlot({ doctor_id, appointment_date, appointment_time, isCustomer: req.user.role === 'CUSTOMER' });
    if (slotError) return res.status(slotError.status).json({ message: slotError.message });

    // Hồ sơ người khám phải là hồ sơ thật thuộc tài khoản khách (cần cả quan hệ "Bản thân"/người thân để tính cọc)
    let profile;
    try { profile = await findPatientProfile(req, customer_id, patient_profile_id); }
    catch (err) { return res.status(503).json({ message: 'Không kiểm tra được hồ sơ người khám, vui lòng thử lại sau' }); }
    if (!profile) {
      return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ, vui lòng chọn lại' });
    }

    let finalPreNotes = pre_notes;
    if (isOnlineAppointment({ pre_notes }) && symptoms) {
       const formattedSymptomsForDoctor = symptoms.replace(/\n/g, ' - ');
       finalPreNotes = `${pre_notes} - ${formattedSymptomsForDoctor}`;
    }

    const deposit = await calculateDeposit(customer_id, profile, finalPreNotes);

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
      return res.status(404).json({ message: 'Lịch giữ chỗ đã hết hạn hoặc đã bị hủy, vui lòng đặt lại' });
    }
    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    res.status(200).json({
      isPaid: apt.status !== 'PENDING_PAYMENT',
      amount: invoice ? Number(invoice.total_amount) : 0,
      exam_fee: getExamFee(invoice),
      is_online: isOnlineAppointment(apt),
      holdExpiresAt: apt.status === 'PENDING_PAYMENT' ? holdExpiresAt(apt) : null // Trang thanh toán đếm ngược
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
// API key SePay đã được kiểm tra ở route (middleware verifySepay) để chống giả mạo.
const sepayWebhook = async (req, res) => {
  try {
    const { transferAmount, content, transferType } = req.body;
    if (transferType && transferType !== 'in') return res.status(200).json({ success: true });
    if (Number(transferAmount) > 0 && content) {
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
    const slotError = await validateSlotChange(apt, { doctor_id: doctor_id || undefined, appointment_date, appointment_time });
    if (slotError) return res.status(slotError.status).json({ message: slotError.message });
    
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
    // Chỉ bác sĩ phụ trách (hoặc quản lý) kết thúc buổi khám đang diễn ra; lịch đã chốt sale không mở lại được
    if (req.user.role === 'DOCTOR' && apt.doctor_id !== req.user.id) {
      return res.status(403).json({ message: 'Lịch khám này không phải của bạn' });
    }
    if (!['WAITING', 'IN_PROGRESS'].includes(apt.status)) {
      return res.status(400).json({ message: 'Lịch hẹn không ở trạng thái đang chờ / đang khám' });
    }

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
    apt.prescribed_medicines = normalizeMedicines(prescriptions);
    
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
    const slotError = await validateSlotChange(apt, { doctor_id, appointment_date, appointment_time });
    if (slotError) return res.status(slotError.status).json({ message: slotError.message });
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
    // nếu cho hủy sẽ sinh giao dịch hoàn tiền toàn bộ bill.
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
    if (!date || !doctorId) return res.status(400).json({ message: 'Thiếu ngày khám hoặc bác sĩ' });
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
    const { selected_services = [], selected_packages = [], voucher_code, payment_method } = req.body;
    const selected_medicines = normalizeMedicines(req.body.selected_medicines);

    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (apt.status !== 'WAITING_FOR_SALE') {
      return res.status(400).json({ message: 'Lịch hẹn chưa khám xong hoặc đã được thanh toán' });
    }

    const invoice = await Invoice.findOne({ where: { appointment_id: id } });
    let bill;
    try {
      bill = await calculateCheckoutBill({ invoice, selected_services, selected_packages, selected_medicines });
    } catch (err) {
      if (err instanceof CheckoutError) return res.status(400).json({ message: err.message });
      throw err;
    }

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

    // Mỹ phẩm mua tại quầy: ghi thành đơn hàng của khách bên commerce (trừ kho trong cùng giao dịch),
    // để khách xem lại trong "Đơn hàng Mỹ phẩm" và đánh giá được sản phẩm
    if (selected_medicines.length > 0) {
      const headers = { Authorization: req.headers.authorization };
      const customersRes = await axios.get('http://localhost:4000/api/identity/users/customers', { headers }).catch(() => null);
      const customer = (customersRes?.data?.data || []).find(u => u.id === apt.customer_id);
      try {
        await axios.post('http://localhost:4000/api/commerce/orders/counter', {
          customer_id: apt.customer_id,
          appointment_id: apt.id,
          items: selected_medicines,
          recipient_name: customer?.Profile?.full_name,
          shipping_phone: customer?.Profile?.phone,
          payment_method: payment_method || 'CASH'
        }, { headers });
      } catch (err) {
        return res.status(400).json({ message: err.response?.data?.message || 'Không ghi được đơn mỹ phẩm, vui lòng thử lại' });
      }
    }

    // Chọn KTV ít việc nhất hôm nay (chỉ đọc dữ liệu, làm trước khi mở transaction)
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

        if (invoice) {
            invoice.total_amount = totalBill;
            invoice.payment_status = 'PAID';
            invoice.payment_method = payment_method || 'CASH';
            await invoice.save({ transaction: t });

            if (amountDueNow > 0) {
               await Transaction.create({
                  invoice_id: invoice.id,
                  amount: amountDueNow,
                  transaction_type: 'INCOME',
                  note: `Thu phần còn lại. Phí khám: ${bill.exam_fee}, Dịch vụ/SP: ${bill.items_total}, Giảm giá: ${discountAmount}, Đã cọc: ${bill.deposit_paid}`
               }, { transaction: t });
            }
        }

        for (const pkgId of selected_packages) {
           const pkgInfo = await TreatmentPackage.findByPk(pkgId, { transaction: t });
           if (pkgInfo) {
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
    await apt.reload();

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
  getMyTodayAppointments, getMyHistory, getTakenSlots, getDepositQuote, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment,
  getAvailableDoctors, getAvailableSlots, checkoutAppointment, getAppointmentsByPatient,
  abandonUnpaidAppointment, releaseExpiredHolds
};