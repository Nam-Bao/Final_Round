const { Op } = require('sequelize');
const {
  sequelize, AttendanceKiosk, SalaryRate, Payroll, PayrollItem, PayrollAdjustment, DisciplinaryAction,
} = require('../models');
const { STAFF_ROLES, RULES, vnToday } = require('../utils/attendanceRules');
const { summarizeViolations } = require('../utils/attendanceViolations');
const { shiftView, shiftsWithAttendance, monthRange, parseMonth, httpError } = require('./attendance.controller');

// Lương tháng = Σ lương các ca có đi làm (mức lương ca riêng từng người, theo ngày áp dụng)
//             + thưởng chuyên cần + khoản cộng - khoản trừ, làm tròn 1.000đ.
// Vắng: không có lương ca đó. Vi phạm chỉ ảnh hưởng thưởng chuyên cần và đề xuất kỷ luật (không trừ tiền vào lương).

const text = (v) => String(v ?? '').trim();
const round1000 = (n) => Math.round(n / 1000) * 1000;
const ADJUSTMENT_CATEGORIES = {
  PLUS: { BONUS: 'Thưởng', ALLOWANCE: 'Phụ cấp', OTHER: 'Khác' },
  MINUS: { ADVANCE: 'Tạm ứng', COMPENSATION: 'Bồi thường thiệt hại', OTHER: 'Khác' },
};
const DISCIPLINE_ACTIONS = { REMINDER: 'Nhắc nhở', REPRIMAND: 'Khiển trách', SALARY_RAISE_DELAY: 'Kéo dài thời hạn nâng lương' };

// Danh sách nhân viên (tên, vai trò) từ service-identity, dùng token của quản lý đang gọi
const fetchEmployees = async (req) => {
  const base = (process.env.IDENTITY_SERVICE_URL || 'http://localhost:4001').replace(/\/+$/, '');
  const res = await fetch(`${base}/users/employees`, { headers: { Authorization: req.header('Authorization') }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw httpError(502, 'Không lấy được danh sách nhân viên từ service-identity');
  const { data } = await res.json();
  return Object.fromEntries((data || []).filter((u) => STAFF_ROLES.includes(u.role))
    .map((u) => [u.id, { id: u.id, name: u.Profile?.full_name || u.email, email: u.email, role: u.role, status: u.status }]));
};

// Mức lương áp dụng cho 1 ngày: dòng có effective_from <= ngày, mới nhất
const rateOn = (rates, date) => rates.find((r) => r.effective_from <= date) || null;
const loadRates = async (employeeIds) => {
  const rows = await SalaryRate.findAll({ where: employeeIds ? { employee_id: employeeIds } : {}, order: [['effective_from', 'DESC'], ['createdAt', 'DESC']], raw: true });
  const byEmployee = {};
  for (const r of rows) (byEmployee[r.employee_id] ||= []).push(r);
  return byEmployee;
};

const lastDayOf = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
const latestLockedMonth = async () => (await Payroll.findOne({ where: { status: 'LOCKED' }, order: [['month', 'DESC']] }))?.month || null;

// ---------- Mức lương ca ----------

// [MANAGER] GET /payroll/rates — nhân viên + mức đang áp dụng + mức sắp áp dụng + lịch sử
const listRates = async (req, res) => {
  const employees = await fetchEmployees(req);
  const rates = await loadRates();
  const today = vnToday();
  const data = Object.values(employees).map((e) => {
    const history = rates[e.id] || [];
    return {
      ...e,
      current: rateOn(history, today),
      upcoming: history.filter((r) => r.effective_from > today).sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
      history,
    };
  });
  res.json({ data, locked_until: await latestLockedMonth() });
};

// [MANAGER] POST /payroll/rates { employee_id, rate_per_shift, effective_from, note }
const createRate = async (req, res) => {
  const employees = await fetchEmployees(req);
  const employee = employees[req.body.employee_id];
  if (!employee) return res.status(400).json({ message: 'Nhân viên không hợp lệ (chỉ bác sĩ, CSKH, NVBH, KTV)' });
  const rate = Number(req.body.rate_per_shift);
  if (!Number.isInteger(rate) || rate < 10000 || rate > 100000000) return res.status(400).json({ message: 'Mức lương / ca từ 10.000đ đến 100.000.000đ' });
  if (rate % 1000 !== 0) return res.status(400).json({ message: 'Mức lương / ca phải tròn nghìn đồng' });
  const from = text(req.body.effective_from);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ message: 'Ngày áp dụng không hợp lệ' });
  const locked = await latestLockedMonth();
  if (locked && from <= lastDayOf(locked)) return res.status(400).json({ message: `Bảng lương đến tháng ${locked.slice(5)}/${locked.slice(0, 4)} đã khóa, ngày áp dụng phải sau ${lastDayOf(locked).split('-').reverse().join('/')}` });
  const note = text(req.body.note);
  if (note.length > 300) return res.status(400).json({ message: 'Ghi chú tối đa 300 ký tự' });
  const row = await SalaryRate.create({ employee_id: employee.id, role: employee.role, rate_per_shift: rate, effective_from: from, note: note || null, created_by: req.user.id });
  res.status(201).json({ message: `Đã lưu mức ${rate.toLocaleString('vi-VN')}đ/ca cho ${employee.name}, áp dụng từ ${from.split('-').reverse().join('/')}`, data: row });
};

// ---------- Bảng lương ----------

// Ngày bắt đầu chấm công = ngày kích hoạt máy chấm công đầu tiên; ca trước ngày này không có dữ liệu nên không tính lương
const attendanceStartDate = async () => {
  const first = await AttendanceKiosk.findOne({ order: [['createdAt', 'ASC']] });
  return first ? vnToday(first.createdAt) : null;
};

// Tính bảng lương của tháng từ chấm công; trả về { problems, items, start_date }
const computePayroll = async (month, employees) => {
  const startDate = await attendanceStartDate();
  if (!startDate) return { problems: [{ type: 'NO_KIOSK', category: 'SYSTEM', reason: 'Chưa kích hoạt máy chấm công nào nên chưa có dữ liệu chấm công' }], items: [], start_date: null };
  const views = (await shiftsWithAttendance({ date: monthRange(month) })).map((s) => shiftView(s)).filter((v) => v.date >= startDate);
  const byEmployee = {};
  for (const v of views) if (employees[v.employee_id]) (byEmployee[v.employee_id] ||= []).push(v);
  const rates = await loadRates(Object.keys(byEmployee));
  const problems = [];
  const items = [];
  for (const [employeeId, list] of Object.entries(byEmployee)) {
    const emp = employees[employeeId];
    list.sort((a, b) => new Date(a.start) - new Date(b.start));
    // Phân loại để quản lý biết việc nào cần làm: ca chưa diễn ra / chờ quản lý duyệt / chờ nhân viên chấm hoặc giải trình
    for (const v of list) {
      if (!v.unsettled) continue;
      const now = new Date();
      const category = now < new Date(v.end) ? 'UPCOMING'
        : (v.explanation?.status === 'PENDING' || v.checkout_request?.status === 'PENDING') ? 'MANAGER' : 'EMPLOYEE';
      problems.push({
        type: 'UNSETTLED', category, employee_id: employeeId, employee_name: emp.name, date: v.date, shift_type: v.shift_type,
        reason: category === 'UPCOMING' ? 'Ca chưa kết thúc' : v.unsettled, deadline: category === 'EMPLOYEE' ? v.explain_until : null,
      });
    }
    const history = rates[employeeId] || [];
    const missingRate = list.filter((v) => !rateOn(history, v.date));
    if (missingRate.length) problems.push({ type: 'NO_RATE', category: 'RATE', employee_id: employeeId, employee_name: emp.name, date: missingRate[0].date, reason: `Chưa có mức lương ca áp dụng cho ngày ${missingRate[0].date.split('-').reverse().join('/')}` });

    const summary = summarizeViolations(list);
    const details = list.map((v) => {
      const rate = rateOn(history, v.date)?.rate_per_shift || 0;
      const worked = !!v.record && v.record.status !== 'ABSENT';
      return {
        shift_id: v.id, date: v.date, shift_type: v.shift_type, rate, paid: worked ? rate : 0, worked,
        check_in_at: v.record?.check_in_at || null, check_out_at: v.record?.check_out_at || null,
        status: v.record?.status || null, checkout_status: v.record?.checkout_status || null,
        minutes_late: v.record?.minutes_late || 0, minutes_early: v.record?.minutes_early || 0,
        violations: v.violations,
      };
    });
    items.push({
      employee_id: employeeId, employee_name: emp.name, role: emp.role,
      scheduled_shifts: list.length,
      worked_shifts: details.filter((d) => d.worked).length,
      absent_shifts: details.filter((d) => !d.worked).length,
      shift_pay: details.reduce((s, d) => s + d.paid, 0),
      normal_violations: summary.normal_count,
      serious_violations: summary.serious_count,
      attendance_bonus: summary.bonus,
      details,
    });
  }
  return { problems, items, start_date: startDate };
};

// Cộng khoản khác và làm tròn tổng
const applyAdjustments = (item, adjustments) => {
  const mine = adjustments.filter((a) => a.employee_id === item.employee_id);
  const plus = mine.filter((a) => a.type === 'PLUS').reduce((s, a) => s + Number(a.amount), 0);
  const minus = mine.filter((a) => a.type === 'MINUS').reduce((s, a) => s + Number(a.amount), 0);
  return { adjustments_plus: plus, adjustments_minus: minus, total: round1000(Number(item.shift_pay) + Number(item.attendance_bonus) + plus - minus) };
};

const loadPayroll = async (month) => {
  const payroll = await Payroll.findOne({ where: { month } });
  if (!payroll) return null;
  const [items, adjustments] = await Promise.all([
    PayrollItem.findAll({ where: { payroll_id: payroll.id }, order: [['role', 'ASC'], ['employee_name', 'ASC']] }),
    PayrollAdjustment.findAll({ where: { payroll_id: payroll.id }, order: [['createdAt', 'ASC']] }),
  ]);
  return { ...payroll.toJSON(), items, adjustments };
};

// [MANAGER] GET /payroll?month=YYYY-MM — bảng lương (nếu đã tạo) + kiểm tra điều kiện chốt công
const getPayroll = async (req, res) => {
  const month = parseMonth(req.query.month);
  const employees = await fetchEmployees(req);
  const payroll = await loadPayroll(month);
  const { problems, items: previewItems, start_date: startDate } = await computePayroll(month, employees);
  // Chưa tạo bảng lương => trả bảng tạm tính để theo dõi trong tháng (chưa có khoản khác, chưa chốt)
  const preview = payroll ? null : previewItems.map((item) => ({ ...item, adjustments_plus: 0, adjustments_minus: 0, total: round1000(item.shift_pay + item.attendance_bonus) }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.employee_name.localeCompare(b.employee_name, 'vi'));
  const discipline = await DisciplinaryAction.findAll({ where: { month }, order: [['createdAt', 'DESC']] });
  res.json({
    data: payroll, preview, month, problems, discipline, start_date: startDate,
    categories: ADJUSTMENT_CATEGORIES, discipline_actions: DISCIPLINE_ACTIONS,
    bonus_rule: { amount: RULES.ATTENDANCE_BONUS, max_violations: RULES.MAX_VIOLATIONS_FOR_BONUS },
  });
};

// [MANAGER] POST /payroll/generate { month } — tạo / tạo lại bảng lương nháp (giữ khoản khác đã nhập)
const generatePayroll = async (req, res) => {
  const month = parseMonth(req.body.month);
  if (month > vnToday().slice(0, 7)) return res.status(400).json({ message: 'Chưa tới tháng này' });
  const employees = await fetchEmployees(req);
  const { problems, items } = await computePayroll(month, employees);
  if (problems.length) return res.status(400).json({ message: `Chưa chốt được công: còn ${problems.length} vấn đề cần xử lý`, problems });
  if (!items.length) return res.status(400).json({ message: 'Tháng này không có ca làm nào' });

  const t = await sequelize.transaction();
  try {
    let payroll = await Payroll.findOne({ where: { month }, transaction: t, lock: t.LOCK.UPDATE });
    if (payroll?.status === 'LOCKED') throw httpError(400, 'Bảng lương đã khóa, mở khóa trước khi tạo lại');
    const entry = { action: payroll ? 'REGENERATE' : 'GENERATE', by: req.user.id, at: new Date() };
    if (payroll) await payroll.update({ generated_at: new Date(), generated_by: req.user.id, history: [...payroll.history, entry] }, { transaction: t });
    else payroll = await Payroll.create({ month, status: 'DRAFT', generated_at: new Date(), generated_by: req.user.id, history: [entry] }, { transaction: t });

    const adjustments = await PayrollAdjustment.findAll({ where: { payroll_id: payroll.id }, transaction: t, raw: true });
    await PayrollItem.destroy({ where: { payroll_id: payroll.id }, transaction: t });
    await PayrollItem.bulkCreate(items.map((item) => ({ ...item, payroll_id: payroll.id, ...applyAdjustments(item, adjustments) })), { transaction: t });
    await t.commit();
    res.json({ message: entry.action === 'GENERATE' ? 'Đã tạo bảng lương nháp' : 'Đã tạo lại bảng lương nháp (giữ nguyên khoản khác)' });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

const draftPayroll = async (id, t) => {
  const payroll = await Payroll.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!payroll) throw httpError(404, 'Không tìm thấy bảng lương');
  if (payroll.status !== 'DRAFT') throw httpError(400, 'Bảng lương đã khóa, mở khóa trước khi sửa');
  return payroll;
};

// Tính lại tổng của 1 nhân viên sau khi đổi khoản khác
const refreshItem = async (payrollId, employeeId, t) => {
  const item = await PayrollItem.findOne({ where: { payroll_id: payrollId, employee_id: employeeId }, transaction: t });
  if (!item) throw httpError(400, 'Nhân viên không có trong bảng lương tháng này');
  const adjustments = await PayrollAdjustment.findAll({ where: { payroll_id: payrollId, employee_id: employeeId }, transaction: t, raw: true });
  await item.update(applyAdjustments(item, adjustments), { transaction: t });
};

// [MANAGER] POST /payroll/:id/adjustments { employee_id, type, category, amount, reason }
const addAdjustment = async (req, res) => {
  const type = req.body.type === 'MINUS' ? 'MINUS' : 'PLUS';
  const category = text(req.body.category);
  if (!ADJUSTMENT_CATEGORIES[type][category]) return res.status(400).json({ message: 'Loại khoản không hợp lệ' });
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount < 1000 || amount > 1000000000) return res.status(400).json({ message: 'Số tiền từ 1.000đ trở lên, là số nguyên' });
  const reason = text(req.body.reason);
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: 'Lý do từ 5 đến 500 ký tự' });
  const t = await sequelize.transaction();
  try {
    const payroll = await draftPayroll(req.params.id, t);
    const item = await PayrollItem.findOne({ where: { payroll_id: payroll.id, employee_id: req.body.employee_id }, transaction: t });
    if (!item) throw httpError(400, 'Nhân viên không có trong bảng lương tháng này');
    await PayrollAdjustment.create({ payroll_id: payroll.id, employee_id: item.employee_id, type, category, amount, reason, created_by: req.user.id }, { transaction: t });
    await refreshItem(payroll.id, item.employee_id, t);
    await t.commit();
    res.status(201).json({ message: 'Đã thêm khoản khác' });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [MANAGER] DELETE /payroll/:id/adjustments/:adjustmentId
const removeAdjustment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payroll = await draftPayroll(req.params.id, t);
    const adj = await PayrollAdjustment.findOne({ where: { id: req.params.adjustmentId, payroll_id: payroll.id }, transaction: t });
    if (!adj) throw httpError(404, 'Không tìm thấy khoản này');
    await adj.destroy({ transaction: t });
    await refreshItem(payroll.id, adj.employee_id, t);
    await t.commit();
    res.json({ message: 'Đã xóa khoản khác' });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [MANAGER] POST /payroll/:id/lock — duyệt & khóa (khóa luôn công của tháng)
const lockPayroll = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const payroll = await draftPayroll(req.params.id, t);
    await payroll.update({ status: 'LOCKED', locked_at: new Date(), locked_by: req.user.id, history: [...payroll.history, { action: 'LOCK', by: req.user.id, at: new Date() }] }, { transaction: t });
    await t.commit();
    res.json({ message: 'Đã duyệt và khóa bảng lương. Nhân viên đã xem được phiếu lương' });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [MANAGER] POST /payroll/:id/unlock { reason }
const unlockPayroll = async (req, res) => {
  const reason = text(req.body.reason);
  if (reason.length < 10) return res.status(400).json({ message: 'Mở khóa phải ghi rõ lý do (ít nhất 10 ký tự)' });
  const payroll = await Payroll.findByPk(req.params.id);
  if (!payroll) return res.status(404).json({ message: 'Không tìm thấy bảng lương' });
  if (payroll.status !== 'LOCKED') return res.status(400).json({ message: 'Bảng lương chưa khóa' });
  const newer = await Payroll.findOne({ where: { status: 'LOCKED', month: { [Op.gt]: payroll.month } } });
  if (newer) return res.status(400).json({ message: `Phải mở khóa tháng ${newer.month.slice(5)}/${newer.month.slice(0, 4)} trước` });
  await payroll.update({ status: 'DRAFT', history: [...payroll.history, { action: 'UNLOCK', by: req.user.id, at: new Date(), reason }] });
  res.json({ message: 'Đã mở khóa bảng lương' });
};

// [MANAGER] POST /payroll/discipline { employee_id, month, action, reason, decided_at, delay_months }
const createDiscipline = async (req, res) => {
  const action = text(req.body.action);
  if (!DISCIPLINE_ACTIONS[action]) return res.status(400).json({ message: 'Hình thức kỷ luật không hợp lệ' });
  const month = parseMonth(req.body.month);
  const reason = text(req.body.reason);
  if (reason.length < 10 || reason.length > 2000) return res.status(400).json({ message: 'Lý do từ 10 đến 2.000 ký tự' });
  const decidedAt = text(req.body.decided_at) || vnToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decidedAt)) return res.status(400).json({ message: 'Ngày quyết định không hợp lệ' });
  let delay = null;
  if (action === 'SALARY_RAISE_DELAY') {
    delay = Number(req.body.delay_months);
    if (!Number.isInteger(delay) || delay < 1 || delay > 6) return res.status(400).json({ message: 'Kéo dài thời hạn nâng lương từ 1 đến 6 tháng' });
  }
  const employees = await fetchEmployees(req);
  if (!employees[req.body.employee_id]) return res.status(400).json({ message: 'Nhân viên không hợp lệ' });
  const row = await DisciplinaryAction.create({ employee_id: req.body.employee_id, month, action, reason, decided_at: decidedAt, delay_months: delay, created_by: req.user.id });
  res.status(201).json({ message: `Đã ghi nhận quyết định ${DISCIPLINE_ACTIONS[action].toLowerCase()}`, data: row });
};

// [STAFF] GET /payroll/me?month= — phiếu lương của mình (chỉ bảng lương đã khóa)
const myPayslip = async (req, res) => {
  const locked = await Payroll.findAll({ where: { status: 'LOCKED' }, attributes: ['id', 'month'], order: [['month', 'DESC']], raw: true });
  const mineMonths = (await PayrollItem.findAll({ where: { employee_id: req.user.id, payroll_id: locked.map((p) => p.id) }, attributes: ['payroll_id'], raw: true })).map((i) => i.payroll_id);
  const months = locked.filter((p) => mineMonths.includes(p.id)).map((p) => p.month);
  const month = req.query.month && months.includes(req.query.month) ? req.query.month : months[0];
  if (!month) return res.json({ data: null, months });
  const payroll = locked.find((p) => p.month === month);
  const [item, adjustments, discipline] = await Promise.all([
    PayrollItem.findOne({ where: { payroll_id: payroll.id, employee_id: req.user.id } }),
    PayrollAdjustment.findAll({ where: { payroll_id: payroll.id, employee_id: req.user.id }, attributes: ['type', 'category', 'amount', 'reason', 'createdAt'] }),
    DisciplinaryAction.findAll({ where: { employee_id: req.user.id, month }, attributes: ['action', 'reason', 'decided_at', 'delay_months'] }),
  ]);
  res.json({ data: { month, item, adjustments, discipline }, months, categories: ADJUSTMENT_CATEGORIES, discipline_actions: DISCIPLINE_ACTIONS });
};

module.exports = {
  listRates, createRate, getPayroll, generatePayroll, addAdjustment, removeAdjustment, lockPayroll, unlockPayroll, createDiscipline, myPayslip,
};
