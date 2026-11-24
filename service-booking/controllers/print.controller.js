// Chứng từ in cho khách (khổ A5): phiếu thanh toán sau khám, đơn thuốc / chỉ định điều trị.
// Gom đủ dữ liệu ở server để trang in chỉ gọi 1 API. Thông tin phụ (phòng khám, tên người) lỗi thì vẫn in phần còn lại.
const axios = require('axios');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');
const { Appointment, Invoice, Transaction, SpaService, TreatmentPackage } = require('../models');

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:4000';
const EXAM_FEE = 100000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANAGERS = ['GEN_MANAGER', 'ADMIN'];

// Số chứng từ dễ đọc: HD-20261117-3F9A2C (ngày + 6 ký tự đầu của mã), không cần thêm cột
const docNo = (prefix, date, id) => `${prefix}-${dayjs(date).format('YYYYMMDD')}-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
const sysToken = () => jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '1m' });
const clinicInfo = () => axios.get(`${GATEWAY}/api/media/pages/clinic-info`, { timeout: 5000 }).then((r) => r.data.data || {}).catch(() => ({}));
const peopleInfo = (body) => axios.post(`${GATEWAY}/api/identity/users/print-info`, body, { headers: { Authorization: `Bearer ${sysToken()}` }, timeout: 5000 })
  .then((r) => r.data).catch(() => ({ users: {}, patients: {}, medical_record: null }));
// Tên, dung tích, hướng dẫn sử dụng, thuốc kê đơn (gọi bằng token của người đang in, commerce tự phân quyền)
const productInfo = (ids, authorization) => (ids.length
  ? axios.get(`${GATEWAY}/api/commerce/products/print-info`, { params: { ids: ids.join(',') }, headers: { Authorization: authorization }, timeout: 5000 })
    .then((r) => Object.fromEntries((r.data.data || []).map((p) => [p.id, p]))).catch(() => ({}))
  : Promise.resolve({}));
const medicineList = (list) => (Array.isArray(list) ? list : []).map((m) => (typeof m === 'string' ? { product_id: m, quantity: 1 } : m)).filter((m) => m?.product_id);

const person = (u) => (u ? { name: u.full_name, phone: u.phone } : null);
// Tên trong hồ sơ có thể đã kèm "BS." => bỏ đi khi in kèm học vị, tránh "BS BS. Nguyễn Văn A"
const doctorName = (d) => (d?.title ? String(d.full_name || '').replace(/^(BS\.?|Bác sĩ)\s*/i, '') : d?.full_name);
const patientOf = (p, account) => (p ? { name: p.full_name, phone: p.phone || account?.phone || null, dob: p.dob, gender: p.gender, relationship: p.relationship } : account ? { name: account.full_name, phone: account.phone, dob: account.dob, gender: account.gender } : null);

const loadAppointment = async (req, res) => {
  if (!UUID_RE.test(req.params.id)) { res.status(404).json({ message: 'Không tìm thấy lịch hẹn' }); return null; }
  const apt = await Appointment.findByPk(req.params.id);
  if (!apt) { res.status(404).json({ message: 'Không tìm thấy lịch hẹn' }); return null; }
  return apt;
};

// Hóa đơn chốt trước khi có breakdown: dựng lại từ dịch vụ / gói đã mua + ghi chú giao dịch (giống báo cáo doanh thu)
const legacyBreakdown = async (invoice, apt, checkoutTx) => {
  const [services, packages] = await Promise.all([
    (apt.prescribed_services || []).length ? SpaService.findAll({ where: { id: apt.prescribed_services }, raw: true }) : [],
    (apt.prescribed_packages || []).length ? TreatmentPackage.findAll({ where: { id: apt.prescribed_packages }, raw: true }) : [],
  ]);
  const noteNum = (label) => Number((String(checkoutTx?.note || '').match(new RegExp(`${label}: (\\d+)`)) || [])[1] || 0);
  const total = Number(invoice.total_amount);
  const exam = total > 0 ? EXAM_FEE : 0;
  const service_items = services.map((s) => ({ name: s.name, price: Number(s.price) }));
  const package_items = packages.map((p) => ({ name: p.name, price: Number(p.promotional_price || p.price), sessions: p.total_sessions }));
  const discount = noteNum('Giảm giá');
  const sum = (a) => a.reduce((s, x) => s + x.price, 0);
  return {
    exam_fee: exam, services: sum(service_items), packages: sum(package_items), discount, consult_credit: noteNum('Cọc tư vấn'), total,
    products: Math.max(0, total + discount - exam - sum(service_items) - sum(package_items)), service_items, package_items,
    deposit_paid: noteNum('Đã cọc'), derived: true,
  };
};

class PrintError extends Error { constructor(status, message) { super(message); this.status = status; } }

// Dữ liệu phiếu thanh toán sau khám: dùng chung cho phiếu in A5 (nhân viên) và file PDF khách tải về.
// viewerId: người in / tải (ghi ở chân phiếu); authorization: token để hỏi thông tin mỹ phẩm của hóa đơn cũ
const buildInvoiceData = async (apt, { viewerId, authorization }) => {
    const invoice = await Invoice.findOne({ where: { appointment_id: apt.id }, include: [{ model: Transaction }], order: [[Transaction, 'createdAt', 'ASC']] });
    if (apt.status !== 'COMPLETED' || !invoice) throw new PrintError(409, 'Lịch khám chưa chốt bill nên chưa có phiếu thanh toán');
    const txs = invoice.Transactions || [];
    const checkoutTx = txs.find((t) => t.transaction_type === 'INCOME' && String(t.note || '').startsWith('Thu phần còn lại'));
    const b = invoice.breakdown || await legacyBreakdown(invoice, apt, checkoutTx);

    const medicines = medicineList(apt.prescribed_medicines);
    const [clinic, people, products] = await Promise.all([
      clinicInfo(),
      peopleInfo({ user_ids: [apt.customer_id, apt.doctor_id, b.cashier_id, viewerId].filter(Boolean), patient_ids: [apt.patient_profile_id].filter(Boolean) }),
      b.product_items ? {} : productInfo(medicines.map((m) => m.product_id), authorization),
    ]);
    const u = people.users || {};
    // Hóa đơn cũ không lưu đơn giá mỹ phẩm: in tên + số lượng, tiền mỹ phẩm in theo tổng nhóm
    const productItems = b.product_items
      ? b.product_items.map((p) => ({ name: p.name, quantity: p.quantity, price: p.price, amount: p.price * p.quantity }))
      : medicines.map((m) => ({ name: products[m.product_id]?.name || 'Mỹ phẩm', quantity: m.quantity, price: null, amount: null }));
    const gross = Number(b.exam_fee || 0) + Number(b.services || 0) + Number(b.packages || 0) + Number(b.products || 0);
    const label = (t, i) => {
      if (t.transaction_type === 'REFUND') return 'Hoàn tiền';
      if (t === checkoutTx) return 'Thu khi thanh toán';
      return i === 0 ? 'Đặt cọc / phí khám khi đặt lịch' : 'Đã thu';
    };
    const payments = txs.map((t, i) => ({ label: label(t, i), amount: Number(t.amount), at: t.createdAt }));
    const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
    return {
        doc_no: docNo('HD', b.checked_out_at || invoice.updatedAt, invoice.id),
        clinic,
        checked_out_at: b.checked_out_at || invoice.updatedAt,
        status: invoice.payment_status, // REFUNDED => in dấu "ĐÃ HOÀN TIỀN"
        payment_method: invoice.payment_method === 'VIETQR' ? 'Chuyển khoản (VietQR)' : invoice.payment_method === 'CASH' ? 'Tiền mặt' : 'Không rõ',
        appointment: { id: apt.id, date: apt.appointment_date, time: String(apt.appointment_time).slice(0, 5), type: apt.type, source: apt.source },
        patient: patientOf(people.patients?.[apt.patient_profile_id], u[apt.customer_id]),
        account: person(u[apt.customer_id]),
        doctor: u[apt.doctor_id] ? { name: doctorName(u[apt.doctor_id]), title: u[apt.doctor_id].title } : null,
        cashier: u[b.cashier_id]?.full_name || null,
        groups: [
          { key: 'exam', label: 'Phí khám', items: Number(b.exam_fee) > 0 ? [{ name: 'Phí khám bác sĩ', quantity: 1, price: Number(b.exam_fee), amount: Number(b.exam_fee) }] : [] },
          { key: 'services', label: 'Dịch vụ', items: (b.service_items || []).map((s) => ({ name: s.name, quantity: 1, price: s.price, amount: s.price })) },
          { key: 'packages', label: 'Gói liệu trình', items: (b.package_items || []).map((p) => ({ name: p.sessions ? `${p.name} (${p.sessions} buổi)` : p.name, quantity: 1, price: p.price, amount: p.price })) },
          { key: 'products', label: 'Mỹ phẩm', items: productItems, total: Number(b.products || 0) },
        ].filter((g) => g.items.length),
        totals: {
          gross, discount: Number(b.discount || 0), voucher_code: b.voucher_code || null, consult_credit: Number(b.consult_credit || 0), total: Number(b.total ?? invoice.total_amount),
          deposit_paid: b.deposit_paid ?? null, amount_due_now: b.amount_due_now ?? (checkoutTx ? Number(checkoutTx.amount) : null), paid_total: paidTotal,
        },
        payments,
        legacy: !!b.derived,
        printed_by: u[viewerId]?.full_name || null,
        printed_at: new Date(),
    };
};

const sendPrintError = (res, error) => (error instanceof PrintError
  ? res.status(error.status).json({ message: error.message })
  : res.status(500).json({ message: 'Lỗi server', error: error.message }));

// [CSKH/MANAGER] GET /appointments/:id/print/invoice — phiếu thanh toán sau khám
const printInvoice = async (req, res) => {
  try {
    const apt = await loadAppointment(req, res);
    if (!apt) return;
    res.json({ data: await buildInvoiceData(apt, { viewerId: req.user.id, authorization: req.headers.authorization }) });
  } catch (error) { sendPrintError(res, error); }
};

// [CUSTOMER] GET /appointments/:id/receipt.pdf — khách tải phiếu thanh toán (PDF) của lịch khám của mình
const { renderReceiptPdf } = require('../utils/receiptPdf');
const receiptPdf = async (req, res) => {
  try {
    const apt = await loadAppointment(req, res);
    if (!apt) return;
    // Lịch của người khác => trả 404 như không có, không để lộ lịch đó tồn tại
    if (apt.customer_id !== req.user.id) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    const data = await buildInvoiceData(apt, { viewerId: null, authorization: req.headers.authorization });
    const pdf = await renderReceiptPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="phieu-thanh-toan-${data.doc_no}.pdf"`,
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    });
    res.send(pdf);
  } catch (error) { sendPrintError(res, error); }
};

// [DOCTOR (lịch của mình)/CSKH/MANAGER] GET /appointments/:id/print/prescription — đơn thuốc / chỉ định điều trị
const printPrescription = async (req, res) => {
  try {
    const apt = await loadAppointment(req, res);
    if (!apt) return;
    if (req.user.role === 'DOCTOR' && apt.doctor_id !== req.user.id) return res.status(403).json({ message: 'Lịch khám này không phải của bạn' });
    if (!['WAITING_FOR_SALE', 'COMPLETED'].includes(apt.status)) return res.status(409).json({ message: 'Bác sĩ chưa kết thúc khám nên chưa có đơn' });
    // Đơn bác sĩ kê lúc kết thúc khám. Lịch cũ (trước khi lưu đơn riêng): dùng dữ liệu kê còn lại trên lịch hẹn
    const rx = apt.doctor_prescription || { medicines: apt.prescribed_medicines, services: apt.prescribed_services, packages: apt.prescribed_packages, legacy: true };
    const medicines = medicineList(rx.medicines);
    const [clinic, people, products, services, packages] = await Promise.all([
      clinicInfo(),
      peopleInfo({ user_ids: [apt.customer_id, apt.doctor_id, req.user.id].filter(Boolean), patient_ids: [apt.patient_profile_id].filter(Boolean), appointment_id: apt.id }),
      productInfo(medicines.map((m) => m.product_id), req.headers.authorization),
      (rx.services || []).length ? SpaService.findAll({ where: { id: rx.services }, attributes: ['name'], raw: true }) : [],
      (rx.packages || []).length ? TreatmentPackage.findAll({ where: { id: rx.packages }, attributes: ['name', 'total_sessions'], raw: true }) : [],
    ]);
    const u = people.users || {};
    const record = people.medical_record || {};
    const doctor = u[apt.doctor_id];
    const items = medicines.map((m) => {
      const p = products[m.product_id] || {};
      return { name: p.name || 'Sản phẩm', capacity: p.capacity, quantity: m.quantity, is_prescription: !!p.is_prescription, usage: m.usage || p.usage || 'Theo hướng dẫn trên bao bì', usage_from_label: !m.usage };
    });
    const at = rx.at || record.exam_date || apt.updatedAt;
    res.json({
      data: {
        doc_no: docNo('DT', at, apt.id),
        clinic,
        has_rx: items.some((i) => i.is_prescription),
        prescribed_at: at,
        patient: patientOf(people.patients?.[apt.patient_profile_id], u[apt.customer_id]),
        appointment: { id: apt.id, date: apt.appointment_date },
        exam: {
          symptoms: apt.symptoms || record.symptoms || apt.pre_notes || null,
          diagnosis: apt.diagnosis || record.diagnosis || null,
          notes: apt.doctor_notes || record.doctor_notes || null,
          follow_up_date: apt.follow_up_date || record.follow_up_date || null,
        },
        items,
        services: services.map((s) => s.name),
        packages: packages.map((p) => (p.total_sessions ? `${p.name} (${p.total_sessions} buổi)` : p.name)),
        doctor: doctor ? { name: doctorName(doctor), title: doctor.title, license_number: doctor.license_number, specialty: doctor.specialty } : null,
        legacy: !!rx.legacy,
        printed_by: u[req.user.id]?.full_name || null,
        printed_at: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { printInvoice, printPrescription, receiptPdf, buildInvoiceData, docNo };
