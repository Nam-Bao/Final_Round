const { sequelize, Appointment, AppointmentCancellation, WorkShift, Invoice, Transaction, CustomerPackage, TreatmentPackage, TreatmentSession, ServiceSession, SpaService, Consultation } = require('../models');
const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');
const { isOnlineAppointment } = require('./video.controller');
// Khung giờ khám theo ca (khớp với getAvailableSlots và trang đặt lịch)
const { EXAM_SLOTS, EXAM_SHIFT_HOURS } = require('../utils/shiftSlots');
// Cọc buổi tư vấn chuyên gia đã hoàn thành được trừ vào phí khám
const { findAvailableCredit, getCreditForAppointment, releaseCredit, handleConsultTransfer } = require('./consultation.controller');
const { isDuplicateTransaction, recordTransaction } = require('../utils/bankLog');

// Phí khám bác sĩ 100k. Khám online trả trước toàn bộ; khám tại phòng khám cọc 50k, phần còn lại thu khi chốt sale.
// Server tự quyết định, không tin số tiền / ghi chú từ client.
const EXAM_FEE = 100000;
const OFFLINE_DEPOSIT = 50000;

// "Khách cũ" (miễn cọc + miễn phí khám) xét theo HỒ SƠ NGƯỜI ĐƯỢC KHÁM, không theo tài khoản:
// người thân lần đầu khám vẫn phải cọc và trả phí khám. Chỉ tính lịch đã được thanh toán/phục vụ
// (lịch hủy hoặc chưa trả tiền KHÔNG tính, để không thể đặt 1 lịch bỏ đó rồi đặt lịch thứ 2 miễn phí).
const SERVED_STATUSES = ['CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS', 'WAITING_FOR_SALE', 'COMPLETED', 'NEEDS_RESCHEDULE'];
const SELF_RELATIONSHIP = 'Bản thân';
// Ca còn hiệu lực: chấm công xong ca chuyển sang ATTENDED nhưng bác sĩ vẫn đang làm
const WORKING_SHIFT_STATUSES = ['SCHEDULED', 'ATTENDED'];
const WALK_IN = 'WALK_IN';
// Khách đến thẳng không giữ khung giờ: chỉ lịch đặt trước mới chiếm chỗ của khách đặt online / CSKH
const occupiesSlot = { status: { [Op.notIn]: ['CANCELLED', 'NO_SHOW'] }, [Op.or]: [{ source: null }, { source: { [Op.ne]: 'WALK_IN' } }] };

// Lịch tạo trước khi model có cột patient_profile_id bị lưu null => coi là lịch của hồ sơ "Bản thân"
const isOldPatient = async (customer_id, profile) => {
  const profileMatch = profile.relationship === SELF_RELATIONSHIP
    ? { [Op.or]: [{ patient_profile_id: profile.id }, { patient_profile_id: null }] }
    : { patient_profile_id: profile.id };
  // Khách đến thẳng chỉ tính là khách cũ khi bác sĩ đã khám (đang ngồi chờ rồi bỏ về thì không tính)
  const walkInServed = { [Op.or]: [{ source: null }, { source: { [Op.ne]: WALK_IN } }, { status: { [Op.notIn]: ['CHECK_IN', 'WAITING'] } }] };
  return (await Appointment.count({ where: { customer_id, ...profileMatch, status: { [Op.in]: SERVED_STATUSES }, [Op.and]: [walkInServed] } })) > 0;
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
  await releaseCredit(ids, t); // phần cọc tư vấn đã gắn vào lịch bỏ dở được trả lại cho khách
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
    // Cọc tư vấn chuyên gia còn hạn => trừ vào phí khám (khám online trả trước nên trừ ngay; tại quầy trừ lúc chốt bill)
    const credit = old ? null : await findAvailableCredit(req.user.id);
    const consultCredit = credit ? Number(credit.deposit_amount) : 0;
    res.status(200).json({
      data: {
        isOldCustomer: old, examFee: EXAM_FEE, consultCredit,
        online: old ? 0 : Math.max(EXAM_FEE - consultCredit, 0), offline: old ? 0 : OFFLINE_DEPOSIT
      }
    });
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
  // Cọc buổi tư vấn chuyên gia đã gắn vào lịch khám này = tiền khách đã trả trước
  const consult_credit = invoice?.appointment_id ? await getCreditForAppointment(invoice.appointment_id) : 0;

  return {
    exam_fee, deposit_paid, consult_credit, items_total, scope_values, gross: exam_fee + items_total,
    // Dòng chi tiết để lưu vào hoá đơn (báo cáo doanh thu theo dịch vụ / gói)
    service_items: services.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) })),
    package_items: packages.map((p) => ({ id: p.id, name: p.name, price: Number(p.promotional_price || p.price) })),
  };
};

class WalkInError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const walkInFail = (res, error) => (error instanceof WalkInError
  ? res.status(error.status).json({ message: error.message, ...error.extra })
  : res.status(500).json({ message: 'Lỗi server', error: error.message }));

// Thứ tự vào phòng: khách đến thẳng theo giờ được chuyển vào hàng chờ. Khách đặt trước tính theo giờ hẹn, sớm hơn NEXT_BOOKED_WARNING_MINUTES phút
// nên khách hẹn sắp tới giờ đã có mặt được khám trước khách đến thẳng, còn khách hẹn đến rất sớm không chen trước người hẹn sớm hơn.
const NEXT_BOOKED_WARNING_MINUTES = 15;
const scheduledAt = (a) => dayjs(`${a.appointment_date} ${String(a.appointment_time).slice(0, 5)}`);
const queueTime = (a) => {
  if (a.source === WALK_IN) return dayjs(a.queued_at || a.arrived_at);
  const queued = a.queued_at ? dayjs(a.queued_at) : null;
  const at = scheduledAt(a);
  return (queued && queued.isAfter(at) ? queued : at).subtract(NEXT_BOOKED_WARNING_MINUTES, 'minute');
};
const byQueue = (a, b) => queueTime(a).valueOf() - queueTime(b).valueOf();
const lockDoctor = (doctorId, today, transaction) => sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `${doctorId}:${today}` }, transaction });

// [DOCTOR] PUT /appointments/:id/start-exam — bác sĩ bấm Bắt đầu khám: mỗi bác sĩ chỉ khám 1 khách tại một thời điểm
const startExam = async (req, res) => {
  try {
    await sequelize.transaction(async (t) => {
      const apt = await Appointment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!apt || apt.doctor_id !== req.user.id) throw new WalkInError('Không tìm thấy khách trong hàng chờ của bạn', 404);
      if (apt.status !== 'WAITING') throw new WalkInError('Khách này không ở hàng chờ', 409);
      await lockDoctor(req.user.id, apt.appointment_date, t);
      const busy = await Appointment.count({ where: { doctor_id: req.user.id, appointment_date: apt.appointment_date, status: 'IN_PROGRESS' }, transaction: t });
      if (busy) throw new WalkInError('Bạn đang khám một khách khác, hãy hoàn tất hoặc trả khách đó về hàng chờ trước', 409);
      await apt.update({ status: 'IN_PROGRESS', exam_started_at: new Date() }, { transaction: t });
    });
    res.status(200).json({ message: 'Đã bắt đầu khám' });
  } catch (error) { walkInFail(res, error); }
};

// [DOCTOR] PUT /appointments/:id/return-to-queue — bấm nhầm hoặc khách cần chờ thêm: trả khách về hàng chờ
const returnToQueue = async (req, res) => {
  try {
    const [count] = await Appointment.update({ status: 'WAITING', exam_started_at: null }, { where: { id: req.params.id, doctor_id: req.user.id, status: 'IN_PROGRESS' } });
    if (!count) throw new WalkInError('Khách này không ở trạng thái đang khám', 409);
    res.status(200).json({ message: 'Đã trả khách về hàng chờ' });
  } catch (error) { walkInFail(res, error); }
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

    // Đang khám ở đầu, rồi tới hàng chờ theo thứ tự vào phòng, khách đã xong ở cuối
    const rank = { IN_PROGRESS: 0, WAITING: 1 };
    enrichedAppointments.sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || byQueue(a, b));
    res.status(200).json({ data: enrichedAppointments });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Trạng thái lịch CHƯA khám: hóa đơn lúc này chỉ chứa tiền cọc (sau khi chốt bill mới thành tổng hóa đơn)
const PRE_EXAM_STATUSES = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE', 'CHECK_IN', 'WAITING'];

const getMyHistory = async (req, res) => {
  try {
    const history = await Appointment.findAll({
      where: { customer_id: req.user.id },
      include: [
        { model: Invoice, attributes: ['payment_status', 'total_amount'] },
        { model: AppointmentCancellation, attributes: ['initiator', 'reason', 'deposit_paid', 'deposit_outcome', 'refund_ref', 'refunded_at', 'createdAt'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    // Tiền cọc đã đóng của lịch chưa khám => trang khách cảnh báo trước khi tự hủy (hủy sẽ mất cọc)
    const data = history.map((apt) => {
      const { Invoice: invoice, ...rest } = apt.toJSON();
      return { ...rest, deposit_paid: PRE_EXAM_STATUSES.includes(apt.status) ? getDepositPaid(invoice) : 0 };
    });
    res.status(200).json({ data });
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
      where: { doctor_id: doctorId, appointment_date: date, ...occupiesSlot },
      attributes: ['appointment_time'], raw: true
    });

    const takenTimes = takenAppointments.map(apt => apt.appointment_time);
    res.status(200).json({ data: takenTimes });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
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

  const shifts = await WorkShift.findAll({ where: { employee_id: doctor_id, date: appointment_date, status: { [Op.in]: WORKING_SHIFT_STATUSES } }, raw: true });
  if (!shifts.some(s => (EXAM_SLOTS[s.shift_type] || []).includes(time))) {
    return { status: 400, message: 'Bác sĩ không có lịch làm việc vào giờ này, vui lòng chọn giờ khác' };
  }
  const taken = await Appointment.count({
    where: {
      doctor_id, appointment_date, appointment_time: { [Op.in]: [time, `${time}:00`] }, ...occupiesSlot,
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

    const { newAppointment, invoice, consultCredit } = await sequelize.transaction(async (t) => {
      const created = await Appointment.create({
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
      }, { transaction: t });

      // Gắn 1 khoản cọc tư vấn chuyên gia (nếu có) vào lịch khám này; khách cũ được miễn phí khám nên không cần
      let credit = 0;
      if (!deposit.isReturningCustomer) {
        const consult = await findAvailableCredit(customer_id, t);
        if (consult) {
          await consult.update({ credit_appointment_id: created.id }, { transaction: t });
          credit = Number(consult.deposit_amount);
        }
      }
      // Khám online trả trước toàn bộ phí khám => trừ cọc tư vấn ngay; khám tại quầy vẫn cọc như cũ, trừ lúc chốt bill
      const amount = isOnlineAppointment(created) ? Math.max(deposit.amount - credit, 0) : deposit.amount;
      const inv = await Invoice.create({ customer_id, appointment_id: created.id, total_amount: amount, payment_status: 'PENDING' }, { transaction: t });
      return { newAppointment: created, invoice: inv, consultCredit: credit };
    });

    // Khách cũ miễn phí cọc: chốt lịch luôn, không cần qua trang thanh toán
    if (deposit.amount === 0 && req.user.role === 'CUSTOMER') {
      await markDepositPaid(newAppointment, invoice, 'UNKNOWN', 'Khách cũ miễn phí phí khám');
    }

    res.status(201).json({
      message: 'Tạo lịch khám thành công',
      data: newAppointment,
      deposit_amount: Number(invoice.total_amount),
      consult_credit: consultCredit,
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
    const { id: externalId, transferAmount, content, transferType, transactionDate } = req.body;
    const amount = Number(transferAmount);
    if ((transferType && transferType !== 'in') || !(amount > 0)) return res.status(200).json({ success: true });
    // Mã đơn mỹ phẩm "SP xxxxxx": service-commerce xử lý và tự lưu sổ
    if (/(?<![a-z0-9])SP\s?[a-z0-9]{6}/i.test(String(content || ''))) return res.status(200).json({ success: true });
    // SePay gửi lại giao dịch đã xử lý => bỏ qua
    if (await isDuplicateTransaction(externalId)) return res.status(200).json({ success: true });

    // SePay gửi MỌI giao dịch tới cả webhook đặt lịch lẫn webhook mỹ phẩm => chỉ nhận mã đứng riêng
    let outcome = await handleConsultTransfer(content, amount); // cọc tư vấn "TV xxxxxx"
    const match = !outcome && String(content || '').match(/(?<![a-z0-9])O2O\s?([a-z0-9]{6})/i);
    if (match) {
      const orderCode = match[1].toLowerCase();
      const pendingApts = await Appointment.findAll({ where: { status: 'PENDING_PAYMENT' } });
      const candidates = pendingApts.filter(a => a.id.toLowerCase().startsWith(orderCode));
      // Mã 6 ký tự có thể trùng giữa 2 lịch => không tự đoán, để nhân viên đối soát tay
      if (candidates.length !== 1) {
        outcome = { code_type: 'APPOINTMENT', code: orderCode, status: 'UNMATCHED', reason: candidates.length ? 'Mã trùng nhiều lịch hẹn' : 'Không còn lịch chờ thanh toán (giữ chỗ đã hết hạn hoặc đã hủy)' };
      } else {
        const apt = candidates[0];
        const invoice = await Invoice.findOne({ where: { appointment_id: apt.id } });
        if (invoice && amount >= Number(invoice.total_amount)) {
          await markDepositPaid(apt, invoice, 'VIETQR', `Khách thanh toán cọc VietQR cho đơn ${orderCode.toUpperCase()}`);
          outcome = { code_type: 'APPOINTMENT', code: orderCode, status: 'MATCHED', matched_id: apt.id };
        } else {
          outcome = { code_type: 'APPOINTMENT', code: orderCode, status: 'PARTIAL', matched_id: apt.id, reason: `Chuyển thiếu: cần ${Number(invoice?.total_amount || 0).toLocaleString('vi-VN')}đ` };
        }
      }
    }
    await recordTransaction({
      externalId, amount, content, receivedAt: transactionDate,
      ...(outcome || { code_type: 'NONE', status: 'UNMATCHED', reason: 'Nội dung chuyển khoản không có mã lịch' }),
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};

const getConsultantQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    await releaseStaleWalkIns(today);
    const appointments = await Appointment.findAll({
      where: { status: { [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING_FOR_SALE', 'NEEDS_RESCHEDULE', 'CHECK_IN'] } }, raw: true
    });
    
    const invoices = await Invoice.findAll({ raw: true });
    const token = req.headers.authorization;
    let allUsers = [];
    try {
      allUsers = (await axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': token } })).data.data;
    } catch (error) {}

    const queues = { checkIn: [], walkIn: [], hotLeads: [], followUp: [], reschedule: [] };
    // Cọc tư vấn chuyên gia đã gắn vào các lịch khám đang chờ (trừ khi chốt bill)
    const credits = await Consultation.findAll({
      where: { credit_appointment_id: { [Op.in]: appointments.map(a => a.id) } }, attributes: ['credit_appointment_id', 'deposit_amount'], raw: true
    });

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
        deposit_paid,
        consult_credit: credits.filter(c => c.credit_appointment_id === apt.id).reduce((s, c) => s + Number(c.deposit_amount), 0)
      };

      if (apt.status === 'CHECK_IN' && apt.source === WALK_IN) queues.walkIn.push(enrichedApt);
      else if (apt.status === 'NEEDS_RESCHEDULE') queues.reschedule.push(enrichedApt);
      else if (apt.status === 'WAITING_FOR_SALE') queues.hotLeads.push(enrichedApt);
      else if ((apt.status === 'PENDING' || apt.status === 'CONFIRMED') && apt.appointment_date === today) queues.checkIn.push(enrichedApt);
    });
    queues.walkIn.sort((a, b) => new Date(a.arrived_at) - new Date(b.arrived_at));
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

// Ghi thông tin CSKH hỏi trước khám và chuyển khách vào hàng chờ của bác sĩ
const applyPreCheck = (apt, body, consultantId) => {
  const { budget, pre_notes, current_skincare, reason, lifestyle, pre_exam_images } = body;
  const notesArray = [];
  if (reason) notesArray.push(`Lý do khám: ${reason}`);
  if (current_skincare) notesArray.push(`Skincare: ${current_skincare}`);
  if (lifestyle) notesArray.push(`Thói quen: ${lifestyle}`);
  if (pre_notes) notesArray.push(`Ghi chú CSKH: ${pre_notes}`);

  apt.pre_notes = notesArray.join(' - ');
  apt.budget = budget || apt.budget;
  apt.consultant_id = consultantId;
  if (pre_exam_images && pre_exam_images.length > 0) {
     apt.pre_exam_images = pre_exam_images;
  }
  apt.status = 'WAITING';
  apt.queued_at = new Date();
};

const preCheckAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await Appointment.findByPk(id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    applyPreCheck(apt, req.body, req.user.id);
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
    if (apt.status !== 'IN_PROGRESS') {
      return res.status(400).json({ message: 'Cần bấm Bắt đầu khám trước khi lưu bệnh án' });
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
    // Hủy phải qua API /cancel để lưu bằng chứng và xử lý tiền cọc
    if (status === 'CANCELLED') return res.status(400).json({ message: 'Hủy lịch vui lòng dùng chức năng Hủy lịch' });
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

// ===== HỦY LỊCH & TIỀN CỌC =====
// Khách tự hủy (hoặc nhờ CSKH hủy hộ) => MẤT cọc. Phòng khám chủ động hủy => hoàn cọc: CSKH liên hệ khách,
// chuyển khoản rồi ghi nhận mã giao dịch. Mọi lần hủy đều lưu vào AppointmentCancellations làm bằng chứng.
const NO_SHOW_GRACE_MINUTES = 15;        // quá giờ hẹn 15 phút mới được ghi khách không đến
const CUSTOMER_RESCHEDULE_HOURS = 24;     // khách tự đổi lịch trước giờ khám ít nhất 24 giờ
const CUSTOMER_CANCELLABLE = ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE'];
const STAFF_CANCELLABLE = [...CUSTOMER_CANCELLABLE, 'CHECK_IN', 'WAITING'];

class CancelError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

// [STAFF] PUT /appointments/:id/no-show — khách không đến: mất cọc như khách tự hủy, trả lại cọc tư vấn đã gắn
const markNoShow = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const apt = await Appointment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!apt) throw new CancelError('Không tìm thấy lịch hẹn', 404);
    if (!['PENDING', 'CONFIRMED', 'WAITING'].includes(apt.status)) throw new CancelError('Chỉ ghi khách không đến cho lịch đang chờ khách');
    const start = dayjs(`${apt.appointment_date} ${String(apt.appointment_time).slice(0, 5)}`);
    if (dayjs().isBefore(start.add(NO_SHOW_GRACE_MINUTES, 'minute'))) throw new CancelError(`Chỉ ghi khách không đến sau giờ hẹn ${NO_SHOW_GRACE_MINUTES} phút`);
    const invoice = await Invoice.findOne({ where: { appointment_id: apt.id }, transaction: t, lock: t.LOCK.UPDATE });
    const depositPaid = getDepositPaid(invoice);
    await AppointmentCancellation.create({
      appointment_id: apt.id, cancelled_by: req.user.id, cancelled_by_role: req.user.role, initiator: 'CUSTOMER',
      reason: 'Khách không đến', previous_status: apt.status, deposit_paid: depositPaid,
      deposit_outcome: depositPaid > 0 ? 'FORFEITED' : 'NONE', forfeit_acknowledged: false,
    }, { transaction: t });
    apt.status = 'NO_SHOW';
    await apt.save({ transaction: t });
    await releaseCredit([apt.id], t);
    await t.commit();
    res.status(200).json({ message: depositPaid > 0 ? `Đã ghi khách không đến. Phòng khám giữ cọc ${depositPaid.toLocaleString('vi-VN')}đ` : 'Đã ghi khách không đến' });
  } catch (error) {
    await t.rollback();
    if (error instanceof CancelError) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [CUSTOMER] PUT /appointments/:id/customer-reschedule { appointment_date, appointment_time } — đổi lịch 1 lần, trước giờ khám >= 24 giờ
const customerRescheduleAppointment = async (req, res) => {
  try {
    const { appointment_date, appointment_time } = req.body;
    const apt = await Appointment.findByPk(req.params.id);
    if (!apt || apt.customer_id !== req.user.id) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (!['PENDING', 'CONFIRMED', 'WAITING'].includes(apt.status)) return res.status(400).json({ message: 'Chỉ đổi được lịch đã đặt và chưa diễn ra' });
    if (apt.customer_reschedule_count) return res.status(400).json({ message: 'Mỗi lịch khám chỉ được đổi 1 lần' });
    const start = dayjs(`${apt.appointment_date} ${String(apt.appointment_time).slice(0, 5)}`);
    if (dayjs().isAfter(start.subtract(CUSTOMER_RESCHEDULE_HOURS, 'hour'))) return res.status(400).json({ message: `Chỉ đổi được lịch trước giờ khám ít nhất ${CUSTOMER_RESCHEDULE_HOURS} giờ` });
    if (!appointment_date || !appointment_time) return res.status(400).json({ message: 'Chọn ngày và giờ mới' });
    if (appointment_date === apt.appointment_date && String(appointment_time).slice(0, 5) === String(apt.appointment_time).slice(0, 5)) {
      return res.status(400).json({ message: 'Giờ mới trùng với giờ đang đặt' });
    }
    const slotError = await validateAppointmentSlot({ doctor_id: apt.doctor_id, appointment_date, appointment_time, isCustomer: true, excludeId: apt.id });
    if (slotError) return res.status(slotError.status).json({ message: slotError.message });
    await apt.update({ appointment_date, appointment_time, customer_reschedule_count: 1 });
    res.status(200).json({ message: 'Đã đổi lịch khám' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [CUSTOMER] GET /appointments/:id/reschedule-slots?date= — giờ trống của bác sĩ đang phụ trách lịch này
const getRescheduleSlots = async (req, res) => {
  try {
    const apt = await Appointment.findByPk(req.params.id);
    if (!apt || apt.customer_id !== req.user.id) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    const date = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'Ngày không hợp lệ' });
    await releaseExpiredHolds();
    const [shifts, taken] = await Promise.all([
      WorkShift.findAll({ where: { employee_id: apt.doctor_id, date, status: { [Op.in]: WORKING_SHIFT_STATUSES } }, raw: true }),
      Appointment.findAll({ where: { doctor_id: apt.doctor_id, appointment_date: date, ...occupiesSlot, id: { [Op.ne]: apt.id } }, attributes: ['appointment_time'], raw: true }),
    ]);
    const takenTimes = new Set(taken.map((a) => String(a.appointment_time).slice(0, 5)));
    const data = shifts.flatMap((s) => EXAM_SLOTS[s.shift_type] || []).sort()
      .map((time) => ({ time, available: !takenTimes.has(time) && dayjs(`${date} ${time}`).isAfter(dayjs()) }));
    res.status(200).json({ data });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [CUSTOMER] GET /appointments/my-reminders — lịch khám / tư vấn trong 24 giờ tới (nhắc trên website)
const getMyReminders = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    const [apts, consults] = await Promise.all([
      Appointment.findAll({ where: { customer_id: req.user.id, appointment_date: { [Op.between]: [today, tomorrow] }, status: { [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING'] } }, attributes: ['id', 'appointment_date', 'appointment_time'], raw: true }),
      Consultation.findAll({ where: { customer_id: req.user.id, appointment_date: { [Op.between]: [today, tomorrow] }, status: 'CONFIRMED' }, attributes: ['id', 'appointment_date', 'appointment_time', 'expert_name'], raw: true }),
    ]);
    const now = dayjs();
    const within = (r) => {
      const at = dayjs(`${r.appointment_date} ${String(r.appointment_time).slice(0, 5)}`);
      return at.isAfter(now) && at.diff(now, 'hour') < 24;
    };
    const data = [
      ...apts.filter(within).map((a) => ({ id: a.id, type: 'EXAM', date: a.appointment_date, time: String(a.appointment_time).slice(0, 5) })),
      ...consults.filter(within).map((c) => ({ id: c.id, type: 'CONSULT', date: c.appointment_date, time: String(c.appointment_time).slice(0, 5), expert_name: c.expert_name })),
    ].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    res.status(200).json({ data });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

const cancelAppointment = async (req, res) => {
  const isCustomer = req.user.role === 'CUSTOMER';
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  // Khách luôn là bên yêu cầu; nhân viên phải chọn rõ bên yêu cầu hủy
  const initiator = isCustomer ? 'CUSTOMER' : req.body.initiator;
  if (!isCustomer) {
    if (!['CUSTOMER', 'CLINIC'].includes(initiator)) return res.status(400).json({ message: 'Chọn bên yêu cầu hủy: khách hàng hay phòng khám' });
    if (reason.length < 10) return res.status(400).json({ message: 'Nhập lý do hủy (ít nhất 10 ký tự) để lưu hồ sơ' });
  }

  const t = await sequelize.transaction();
  try {
    // Khóa lịch để 2 thao tác hủy / thanh toán cùng lúc không chồng nhau
    const apt = await Appointment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!apt) throw new CancelError('Không tìm thấy lịch hẹn', 404);
    if (isCustomer && apt.customer_id !== req.user.id) throw new CancelError('Bạn không có quyền hủy lịch của người khác', 403);

    // Lịch online đã trả tiền nằm ở hàng chờ bác sĩ (WAITING): khách tự hủy được nếu chưa tới giờ khám
    const start = dayjs(`${apt.appointment_date} ${String(apt.appointment_time).slice(0, 5)}`);
    const customerCanCancel = CUSTOMER_CANCELLABLE.includes(apt.status)
      || (apt.status === 'WAITING' && isOnlineAppointment(apt) && dayjs().isBefore(start));
    if (isCustomer ? !customerCanCancel : !STAFF_CANCELLABLE.includes(apt.status)) {
      throw new CancelError('Lịch hẹn đã khám, đang khám hoặc đã hủy, không thể hủy nữa');
    }

    const invoice = await Invoice.findOne({ where: { appointment_id: apt.id }, transaction: t, lock: t.LOCK.UPDATE });
    const depositPaid = getDepositPaid(invoice);
    // Khách tự hủy lịch đã đóng cọc phải xác nhận đã biết sẽ mất cọc (giao diện hỏi lại trước khi gửi)
    if (isCustomer && depositPaid > 0 && req.body.accept_forfeit !== true) {
      throw new CancelError(`Hủy lịch này bạn sẽ mất ${depositPaid.toLocaleString('vi-VN')}đ tiền cọc. Vui lòng xác nhận để tiếp tục.`, 409, { code: 'CONFIRM_FORFEIT', deposit_paid: depositPaid });
    }

    const deposit_outcome = depositPaid === 0 ? 'NONE' : initiator === 'CLINIC' ? 'REFUND_PENDING' : 'FORFEITED';
    await AppointmentCancellation.create({
      appointment_id: apt.id,
      cancelled_by: req.user.id,
      cancelled_by_role: req.user.role,
      initiator,
      reason: reason || null,
      previous_status: apt.status,
      deposit_paid: depositPaid,
      deposit_outcome,
      forfeit_acknowledged: isCustomer && deposit_outcome === 'FORFEITED',
    }, { transaction: t });

    // Hóa đơn cọc giữ nguyên "đã thu": mất cọc thì phòng khám giữ tiền; hoàn cọc thì chỉ chuyển REFUNDED khi CSKH đã chuyển khoản
    apt.status = 'CANCELLED';
    await apt.save({ transaction: t });
    await releaseCredit([apt.id], t); // cọc tư vấn chưa dùng => trả lại cho lần đặt khám sau
    await t.commit();

    const amount = `${depositPaid.toLocaleString('vi-VN')}đ`;
    const messages = {
      NONE: 'Hủy lịch thành công',
      FORFEITED: `Đã hủy lịch. Tiền cọc ${amount} không được hoàn theo chính sách.`,
      REFUND_PENDING: `Đã hủy lịch. Khách được hoàn ${amount} tiền cọc, vui lòng liên hệ khách để hoàn tiền.`,
    };
    res.status(200).json({ message: messages[deposit_outcome], deposit_outcome, deposit_paid: depositPaid });
  } catch (error) {
    await t.rollback();
    if (error instanceof CancelError) return res.status(error.status).json({ message: error.message, ...error.extra });
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Lịch hẹn này đã được hủy' });
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [STAFF] Lịch do phòng khám hủy đang chờ hoàn cọc
const getPendingDepositRefunds = async (req, res) => {
  try {
    const list = await AppointmentCancellation.findAll({
      where: { deposit_outcome: 'REFUND_PENDING' },
      include: [{ model: Appointment, attributes: ['id', 'customer_id', 'patient_profile_id', 'appointment_date', 'appointment_time', 'pre_notes'] }],
      order: [['createdAt', 'ASC']]
    });
    res.status(200).json({ data: list });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] Ghi nhận đã chuyển khoản hoàn cọc: lưu mã giao dịch, hóa đơn chuyển REFUNDED và ghi giao dịch hoàn tiền
const confirmDepositRefund = async (req, res) => {
  const refund_ref = String(req.body.refund_ref || '').trim();
  if (refund_ref.length < 4 || refund_ref.length > 50) {
    return res.status(400).json({ message: 'Nhập mã giao dịch chuyển khoản hoàn cọc (4 - 50 ký tự)' });
  }
  const t = await sequelize.transaction();
  try {
    const cancellation = await AppointmentCancellation.findOne({ where: { appointment_id: req.params.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!cancellation || cancellation.deposit_outcome !== 'REFUND_PENDING') throw new CancelError('Lịch này không có khoản cọc chờ hoàn');

    const invoice = await Invoice.findOne({ where: { appointment_id: req.params.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (invoice) {
      invoice.payment_status = 'REFUNDED';
      await invoice.save({ transaction: t });
      await Transaction.create({
        invoice_id: invoice.id,
        amount: -Number(cancellation.deposit_paid),
        transaction_type: 'REFUND',
        note: `Phòng khám hủy lịch - Hoàn cọc ${req.params.id.slice(0, 6).toUpperCase()} - GD ${refund_ref}`
      }, { transaction: t });
    }
    Object.assign(cancellation, {
      deposit_outcome: 'REFUNDED', refund_ref, refund_note: String(req.body.note || '').trim().slice(0, 500) || null,
      refunded_by: req.user.id, refunded_at: new Date()
    });
    await cancellation.save({ transaction: t });
    await t.commit();
    res.status(200).json({ message: 'Đã ghi nhận hoàn cọc cho khách' });
  } catch (error) {
    await t.rollback();
    if (error instanceof CancelError) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getAvailableDoctors = async (req, res) => {
  try {
    const { date } = req.query;
    const shifts = await WorkShift.findAll({ where: { date, status: { [Op.in]: WORKING_SHIFT_STATUSES } }, raw: true });
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
    const shifts = await WorkShift.findAll({ where: { date, employee_id: doctorId, status: { [Op.in]: WORKING_SHIFT_STATUSES } }, raw: true });
    const allSlots = shifts.flatMap((shift) => EXAM_SLOTS[shift.shift_type] || []);
    const takenAppointments = await Appointment.findAll({
      where: { appointment_date: date, doctor_id: doctorId, ...occupiesSlot }, raw: true
    });
    const takenTimes = takenAppointments.map(a => String(a.appointment_time).slice(0, 5));
    const availableSlots = allSlots.filter(slot => !takenTimes.includes(slot));
    res.status(200).json({ data: availableSlots });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// ===== KHÁCH ĐẾN THẲNG PHÒNG KHÁM =====
// Không đặt trước, không cọc, không chọn giờ: khách vào danh sách chờ (CHECK_IN), CSKH xem tình trạng bác sĩ rồi mời vào phòng.
// Phí khám thu sau khi khám ở bước chốt bill: hóa đơn ghi sẵn phí khám chưa thu, khách cũ hóa đơn 0đ = miễn phí.
const SHIFT_ENDING_WARNING_MINUTES = 30;

const fetchDoctors = async (req) => {
  const r = await axios.get('http://localhost:4000/api/identity/users/doctors', { headers: { Authorization: req.headers.authorization } }).catch(() => null);
  if (!r) throw new WalkInError('Không lấy được danh sách bác sĩ, vui lòng thử lại', 503);
  return r.data?.data || [];
};

// Tình trạng các bác sĩ còn ca hôm nay. warnings: những điều CSKH cần biết trước khi mời khách vào phòng
const doctorBoard = async (req, today, transaction) => {
  const doctors = await fetchDoctors(req);
  const ids = doctors.map((d) => d.id);
  const [shifts, apts, customers] = await Promise.all([
    WorkShift.findAll({ where: { employee_id: { [Op.in]: ids }, date: today, status: { [Op.in]: WORKING_SHIFT_STATUSES } }, raw: true, transaction }),
    Appointment.findAll({ where: { doctor_id: { [Op.in]: ids }, appointment_date: today, status: { [Op.in]: ['PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS'] } }, raw: true, transaction }),
    axios.get('http://localhost:4000/api/identity/users/customers', { headers: { Authorization: req.headers.authorization } }).then((r) => r.data?.data || []).catch(() => []),
  ]);
  const nameOf = (a) => {
    const customer = customers.find((u) => u.id === a.customer_id);
    return customer?.PatientProfiles?.find((p) => p.id === a.patient_profile_id)?.full_name || customer?.Profile?.full_name || 'Khách hàng';
  };
  const now = dayjs();
  return doctors.map((d) => {
    const hours = shifts.filter((s) => s.employee_id === d.id).map((s) => EXAM_SHIFT_HOURS[s.shift_type]).filter(Boolean)
      .map(([from, to]) => ({ from: dayjs(`${today} ${from}`), to: dayjs(`${today} ${to}`) }))
      .filter((h) => h.to.isAfter(now)).sort((a, b) => a.from - b.from);
    if (!hours.length) return null; // đã hết ca hoặc hôm nay không làm

    const mine = apts.filter((a) => a.doctor_id === d.id);
    const current = mine.find((a) => a.status === 'IN_PROGRESS');
    const waiting = mine.filter((a) => a.status === 'WAITING').sort(byQueue);
    const next = mine.filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status) && !scheduledAt(a).isBefore(now)).sort((a, b) => scheduledAt(a) - scheduledAt(b))[0];
    const onShift = !hours[0].from.isAfter(now);

    const warnings = [];
    if (current) warnings.push(`Bác sĩ đang khám ${nameOf(current)}`);
    if (waiting.length) warnings.push(`Đã có ${waiting.length} khách đang chờ bác sĩ này`);
    if (next && scheduledAt(next).diff(now, 'minute') < NEXT_BOOKED_WARNING_MINUTES) warnings.push(`Khách hẹn ${String(next.appointment_time).slice(0, 5)} (${nameOf(next)}) sắp tới giờ`);
    if (!onShift) warnings.push(`Bác sĩ chưa vào ca, ca bắt đầu lúc ${hours[0].from.format('HH:mm')}`);
    else if (hours[0].to.diff(now, 'minute') < SHIFT_ENDING_WARNING_MINUTES) warnings.push(`Ca của bác sĩ kết thúc lúc ${hours[0].to.format('HH:mm')}`);

    return {
      doctor_id: d.id, doctor_name: d.Profile?.full_name || d.full_name || 'Bác sĩ',
      state: current ? 'BUSY' : waiting.length ? 'QUEUED' : onShift ? 'FREE' : 'OFF_SHIFT',
      current: current ? { name: nameOf(current), started_at: current.exam_started_at } : null,
      waiting: waiting.map(nameOf),
      next_booked: next ? { time: String(next.appointment_time).slice(0, 5), name: nameOf(next) } : null,
      warnings,
    };
  }).filter(Boolean);
};

// Khách đến thẳng còn ngồi chờ từ các ngày trước (CSKH quên ghi rời đi) => hủy, trả lại cọc tư vấn đã gắn
const releaseStaleWalkIns = async (today) => {
  const stale = await Appointment.findAll({ where: { source: WALK_IN, status: 'CHECK_IN', appointment_date: { [Op.lt]: today } }, attributes: ['id'], raw: true });
  if (!stale.length) return;
  const ids = stale.map((a) => a.id);
  await sequelize.transaction(async (t) => {
    await Appointment.update({ status: 'CANCELLED' }, { where: { id: { [Op.in]: ids } }, transaction: t });
    await releaseCredit(ids, t);
  });
};

// [CSKH] GET /appointments/walk-in/doctor-board — tình trạng bác sĩ để chọn phòng mời khách
const getDoctorBoard = async (req, res) => {
  try {
    res.status(200).json({ data: await doctorBoard(req, dayjs().format('YYYY-MM-DD')) });
  } catch (error) { walkInFail(res, error); }
};

// [CSKH] POST /appointments/walk-in { customer_id, patient_profile_id, reason } — đưa khách vào danh sách chờ
const createWalkIn = async (req, res) => {
  try {
    const { customer_id, patient_profile_id } = req.body;
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!customer_id || !patient_profile_id) throw new WalkInError('Chọn hồ sơ người khám');
    let profile;
    try { profile = await findPatientProfile(req, customer_id, patient_profile_id); }
    catch (err) { throw new WalkInError('Không kiểm tra được hồ sơ người khám, vui lòng thử lại', 503); }
    if (!profile) throw new WalkInError('Hồ sơ người khám không hợp lệ');

    const today = dayjs().format('YYYY-MM-DD');
    const open = await Appointment.findOne({
      where: { patient_profile_id, appointment_date: today, status: { [Op.in]: ['PENDING', 'CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS'] } }, raw: true,
    });
    if (open) {
      throw new WalkInError(open.status === 'CHECK_IN' ? 'Khách đã có trong danh sách chờ' : `Khách đã có lịch hôm nay lúc ${String(open.appointment_time).slice(0, 5)}, vui lòng tiếp nhận ở mục Khách đặt hôm nay`, 409);
    }
    const board = await doctorBoard(req, today);
    if (!board.length) throw new WalkInError('Hôm nay đã hết giờ khám, vui lòng hẹn khách ngày khác');

    const returning = await isOldPatient(customer_id, profile);
    const examFee = returning ? 0 : EXAM_FEE;
    const { appointment, consultCredit } = await sequelize.transaction(async (t) => {
      const appointment = await Appointment.create({
        customer_id, patient_profile_id, consultant_id: req.user.id, type: 'NEW_EXAM', appointment_date: today,
        appointment_time: dayjs().format('HH:mm:ss'), symptoms: reason, status: 'CHECK_IN', source: WALK_IN, arrived_at: new Date(),
      }, { transaction: t });
      let credit = 0;
      if (!returning) {
        const consult = await findAvailableCredit(customer_id, t);
        if (consult) {
          await consult.update({ credit_appointment_id: appointment.id }, { transaction: t });
          credit = Number(consult.deposit_amount);
        }
      }
      await Invoice.create({ customer_id, appointment_id: appointment.id, total_amount: examFee, payment_status: 'PENDING' }, { transaction: t });
      return { appointment, consultCredit: credit };
    });
    res.status(201).json({
      message: 'Đã đưa khách vào danh sách chờ', data: appointment, exam_fee: examFee, consult_credit: consultCredit,
      is_returning_customer: returning, has_free_doctor: board.some((d) => d.state === 'FREE'),
    });
  } catch (error) { walkInFail(res, error); }
};

// [CSKH] PUT /appointments/:id/invite { doctor_id, confirm_warnings, ...thông tin hỏi trước khám } — mời khách vào phòng bác sĩ.
// Có cảnh báo thì trả 409 để CSKH xác nhận; đã xác nhận thì vẫn cho mời vì CSKH thấy thực tế tại quầy
const inviteWalkIn = async (req, res) => {
  try {
    const { doctor_id } = req.body;
    if (!doctor_id) throw new WalkInError('Chọn bác sĩ');
    const today = dayjs().format('YYYY-MM-DD');
    await sequelize.transaction(async (t) => {
      const apt = await Appointment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!apt || apt.source !== WALK_IN) throw new WalkInError('Không tìm thấy khách trong danh sách chờ', 404);
      if (apt.status !== 'CHECK_IN') throw new WalkInError('Khách này đã được mời hoặc đã rời đi', 409);
      // Khóa theo bác sĩ: 2 CSKH mời cùng lúc thì người sau thấy cảnh báo đã có khách chờ
      await lockDoctor(doctor_id, today, t);
      const doctor = (await doctorBoard(req, today, t)).find((d) => d.doctor_id === doctor_id);
      if (!doctor) throw new WalkInError('Bác sĩ này không còn ca hôm nay');
      if (doctor.warnings.length && req.body.confirm_warnings !== true) {
        throw new WalkInError('Cần xác nhận trước khi mời', 409, { code: 'NEEDS_CONFIRM', warnings: doctor.warnings });
      }
      applyPreCheck(apt, { ...req.body, reason: req.body.reason || apt.symptoms }, req.user.id);
      apt.doctor_id = doctor_id;
      apt.appointment_time = dayjs().format('HH:mm:ss');
      await apt.save({ transaction: t });
    });
    res.status(200).json({ message: 'Đã mời khách vào phòng khám' });
  } catch (error) { walkInFail(res, error); }
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
    // Tiền cọc đã thu chính là phí khám → chỉ trừ 1 lần; cọc tư vấn chuyên gia cũng là tiền đã trả trước
    const amountDueNow = Math.max(0, totalBill - bill.deposit_paid - bill.consult_credit);

    // Mỹ phẩm mua tại quầy: ghi thành đơn hàng của khách bên commerce (trừ kho trong cùng giao dịch),
    // để khách xem lại trong "Đơn hàng Mỹ phẩm" và đánh giá được sản phẩm
    if (selected_medicines.length > 0) {
      const headers = { Authorization: req.headers.authorization };
      const customersRes = await axios.get('http://localhost:4000/api/identity/users/customers', { headers }).catch(() => null);
      const customer = (customersRes?.data?.data || []).find(u => u.id === apt.customer_id);
      // Đơn ghi theo hồ sơ người được khám (có thể là người thân), không theo chủ tài khoản
      const patientProfile = customer?.PatientProfiles?.find(p => p.id === apt.patient_profile_id);
      try {
        await axios.post('http://localhost:4000/api/commerce/orders/counter', {
          customer_id: apt.customer_id,
          appointment_id: apt.id,
          items: selected_medicines,
          recipient_name: patientProfile?.full_name || customer?.Profile?.full_name,
          shipping_phone: patientProfile?.phone || customer?.Profile?.phone,
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
            invoice.breakdown = {
              exam_fee: bill.exam_fee, services: bill.scope_values.SPA_SERVICE, packages: bill.scope_values.TREATMENT_PACKAGE,
              products: bill.scope_values.PRODUCT, discount: discountAmount, consult_credit: bill.consult_credit, total: totalBill,
              service_items: bill.service_items, package_items: bill.package_items, checked_out_at: new Date(),
            };
            await invoice.save({ transaction: t });

            if (amountDueNow > 0) {
               await Transaction.create({
                  invoice_id: invoice.id,
                  amount: amountDueNow,
                  transaction_type: 'INCOME',
                  note: `Thu phần còn lại. Phí khám: ${bill.exam_fee}, Dịch vụ/SP: ${bill.items_total}, Giảm giá: ${discountAmount}, Đã cọc: ${bill.deposit_paid}, Cọc tư vấn: ${bill.consult_credit}`
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
  startExam,
  returnToQueue,
  getDoctorBoard,
  createWalkIn,
  inviteWalkIn,
  markNoShow,
  getRescheduleSlots,
  customerRescheduleAppointment,
  getMyReminders, 
  getMyTodayAppointments, getMyHistory, getTakenSlots, getDepositQuote, createAppointment, checkPaymentStatus, confirmPayment, sepayWebhook,
  getConsultantQueues, rescheduleAppointment, preCheckAppointment, finishExam, getAllAppointments, updateAppointment, cancelAppointment,
  getAvailableDoctors, getAvailableSlots, checkoutAppointment, getAppointmentsByPatient,
  abandonUnpaidAppointment, releaseExpiredHolds, getPendingDepositRefunds, confirmDepositRefund
};