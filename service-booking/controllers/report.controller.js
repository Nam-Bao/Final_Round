const { Op } = require('sequelize');
const dayjs = require('dayjs');
const { Appointment, Invoice, Transaction, AppointmentCancellation, Consultation, SpaService, TreatmentPackage } = require('../models');

// ==========================================
// BÁO CÁO DOANH THU PHÒNG KHÁM (ghi nhận khi dịch vụ đã thực hiện, không đếm trùng):
// - Hoá đơn khám đã chốt: phí khám + dịch vụ lẻ + gói + mỹ phẩm kê tại quầy, giảm giá chia theo tỉ lệ từng phần.
//   Cọc tư vấn chuyên gia được trừ vào phí khám đã tính ở nguồn "Tư vấn chuyên gia" => trừ ra khỏi hoá đơn.
// - Cọc khám khách tự huỷ (mất cọc) => doanh thu tại ngày huỷ.
// - Tư vấn chuyên gia: buổi đã diễn ra hoặc khách vắng mặt (giữ cọc).
// Mỹ phẩm bán online / NVBH tính ở service-commerce (/reports/sales); đơn tại quầy sau khám nằm trong hoá đơn khám.
// ==========================================
const EXAM_FEE = 100000;
const SOURCES = ['exam', 'services', 'packages', 'clinic_products', 'consultation', 'forfeited'];

const parseRange = (q) => {
  const to = q.to ? dayjs(q.to) : dayjs();
  const from = q.from ? dayjs(q.from) : to.subtract(29, 'day');
  if (!from.isValid() || !to.isValid() || from.isAfter(to)) throw Object.assign(new Error('Khoảng ngày không hợp lệ'), { status: 400 });
  if (to.diff(from, 'day') > 400) throw Object.assign(new Error('Tối đa 400 ngày mỗi lần xem'), { status: 400 });
  return { from: from.startOf('day'), to: to.endOf('day') };
};

// Hoá đơn cũ (trước khi có breakdown): dựng lại từ dịch vụ / gói đã kê + ghi chú giao dịch chốt bill
const deriveBreakdown = (inv, apt, txNote, svcMap, pkgMap) => {
  const total = Number(inv.total_amount);
  const services = (apt.prescribed_services || []).map((id) => svcMap[id]).filter(Boolean);
  const packages = (apt.prescribed_packages || []).map((id) => pkgMap[id]).filter(Boolean);
  const exam = total > 0 ? EXAM_FEE : 0;
  const svc = services.reduce((s, x) => s + x.price, 0);
  const pkg = packages.reduce((s, x) => s + x.price, 0);
  const noteNum = (label) => Number((String(txNote || '').match(new RegExp(`${label}: (\\d+)`)) || [])[1] || 0);
  const discount = noteNum('Giảm giá');
  const consult = noteNum('Cọc tư vấn');
  const products = (apt.prescribed_medicines || []).length ? Math.max(0, total + discount - exam - svc - pkg) : 0;
  return {
    exam_fee: exam, services: svc, packages: pkg, products, discount, consult_credit: consult, total,
    service_items: services, package_items: packages, derived: true,
  };
};

// Chia giảm giá theo tỉ lệ từng phần; cọc tư vấn trừ vào phí khám (phần dư trừ tiếp theo tỉ lệ)
const netComponents = (b) => {
  const parts = { exam: Number(b.exam_fee || 0), services: Number(b.services || 0), packages: Number(b.packages || 0), clinic_products: Number(b.products || 0) };
  const gross = Object.values(parts).reduce((s, x) => s + x, 0);
  const discount = Math.min(Number(b.discount || 0), gross);
  if (gross > 0 && discount > 0) Object.keys(parts).forEach((k) => { parts[k] -= (discount * parts[k]) / gross; });
  let credit = Number(b.consult_credit || 0);
  const fromExam = Math.min(credit, parts.exam);
  parts.exam -= fromExam;
  credit -= fromExam;
  const rest = parts.services + parts.packages + parts.clinic_products;
  if (credit > 0 && rest > 0) ['services', 'packages', 'clinic_products'].forEach((k) => { parts[k] -= (Math.min(credit, rest) * parts[k]) / rest; });
  Object.keys(parts).forEach((k) => { parts[k] = Math.round(parts[k]); });
  return parts;
};

// [ADMIN/GEN_MANAGER] GET /reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.getClinicRevenue = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query);
    const days = {};
    const add = (date, source, amount) => {
      if (!amount) return;
      const key = dayjs(date).format('YYYY-MM-DD');
      days[key] = days[key] || Object.fromEntries(SOURCES.map((s) => [s, 0]));
      days[key][source] += amount;
    };

    // 1. Hoá đơn khám đã chốt (lịch COMPLETED). Ngày ghi nhận = lúc chốt bill
    const invoices = await Invoice.findAll({
      where: { payment_status: 'PAID', appointment_id: { [Op.ne]: null }, updatedAt: { [Op.gte]: from.toDate() } }, raw: true,
    });
    const apts = invoices.length ? await Appointment.findAll({ where: { id: invoices.map((i) => i.appointment_id), status: 'COMPLETED' }, raw: true }) : [];
    const aptMap = Object.fromEntries(apts.map((a) => [a.id, a]));
    const needDerive = invoices.filter((i) => aptMap[i.appointment_id] && !i.breakdown);
    let svcMap = {}; let pkgMap = {}; let notes = {};
    if (needDerive.length) {
      const [svcs, pkgs, txs] = await Promise.all([
        SpaService.findAll({ attributes: ['id', 'name', 'price'], raw: true }),
        TreatmentPackage.findAll({ attributes: ['id', 'name', 'price', 'promotional_price'], raw: true }),
        Transaction.findAll({ where: { invoice_id: needDerive.map((i) => i.id), transaction_type: 'INCOME', note: { [Op.like]: 'Thu phần còn lại%' } }, raw: true }),
      ]);
      svcMap = Object.fromEntries(svcs.map((s) => [s.id, { id: s.id, name: s.name, price: Number(s.price) }]));
      pkgMap = Object.fromEntries(pkgs.map((p) => [p.id, { id: p.id, name: p.name, price: Number(p.promotional_price || p.price) }]));
      notes = Object.fromEntries(txs.map((t) => [t.invoice_id, t.note]));
    }

    const topServices = {};
    const topPackages = {};
    let invoiceCount = 0;
    for (const inv of invoices) {
      const apt = aptMap[inv.appointment_id];
      if (!apt) continue;
      const b = inv.breakdown || deriveBreakdown(inv, apt, notes[inv.id], svcMap, pkgMap);
      const when = dayjs(b.checked_out_at || inv.updatedAt);
      if (when.isBefore(from) || when.isAfter(to)) continue;
      invoiceCount += 1;
      const parts = netComponents(b);
      Object.entries(parts).forEach(([k, v]) => add(when, k, v));
      (b.service_items || []).forEach((s) => { const t = topServices[s.id] || (topServices[s.id] = { id: s.id, name: s.name, count: 0, revenue: 0 }); t.count += 1; t.revenue += s.price; });
      (b.package_items || []).forEach((p) => { const t = topPackages[p.id] || (topPackages[p.id] = { id: p.id, name: p.name, count: 0, revenue: 0 }); t.count += 1; t.revenue += p.price; });
    }

    // 2. Cọc khám khách tự huỷ => phòng khám giữ cọc
    const forfeits = await AppointmentCancellation.findAll({
      where: { deposit_outcome: 'FORFEITED', createdAt: { [Op.between]: [from.toDate(), to.toDate()] } }, raw: true,
    });
    forfeits.forEach((c) => add(c.createdAt, 'forfeited', Number(c.deposit_paid || 0)));

    // 3. Tư vấn chuyên gia: đã tư vấn hoặc khách vắng (giữ cọc); chuyên gia vắng / huỷ được hoàn => không tính
    const consults = await Consultation.findAll({
      where: { status: { [Op.in]: ['COMPLETED', 'NO_SHOW'] }, deposit_outcome: { [Op.ne]: 'REFUNDED' } }, raw: true,
    });
    let consultCount = 0;
    consults.forEach((c) => {
      const when = dayjs(c.completed_at || `${c.appointment_date}T${c.appointment_time || '00:00'}`);
      if (when.isBefore(from) || when.isAfter(to)) return;
      consultCount += 1;
      add(when, 'consultation', Number(c.deposit_amount || 0));
    });

    const series = Object.entries(days).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
    const totals = Object.fromEntries(SOURCES.map((s) => [s, series.reduce((sum, d) => sum + d[s], 0)]));
    res.status(200).json({
      from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD'), series, totals,
      counts: { invoices: invoiceCount, consultations: consultCount, forfeited: forfeits.length },
      top_services: Object.values(topServices).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      top_packages: Object.values(topPackages).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });
  }
};

// [ADMIN/GEN_MANAGER] GET /reports/today: số liệu nhanh cho trang Tổng quan
exports.getTodayOverview = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const [appointmentsToday, waitingCheckout, pendingRefunds] = await Promise.all([
      Appointment.count({ where: { appointment_date: today, status: { [Op.notIn]: ['CANCELLED', 'PENDING_PAYMENT'] } } }),
      Appointment.count({ where: { status: 'WAITING_FOR_SALE' } }),
      AppointmentCancellation.count({ where: { deposit_outcome: 'REFUND_PENDING' } }),
    ]);
    res.status(200).json({ data: { appointments_today: appointmentsToday, waiting_checkout: waitingCheckout, pending_deposit_refunds: pendingRefunds } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};
