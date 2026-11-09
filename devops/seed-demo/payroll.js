// Tạo bảng lương các tháng đã qua bằng chính API của hệ thống, rồi ghi lại mốc thời gian đúng thực tế (đầu tháng sau).
// Chạy trong service-booking: node -r dotenv/config ../devops/seed-demo/payroll.js <e2e|real> <gateway>
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const [target, gateway] = process.argv.slice(2);
if (!['e2e', 'real'].includes(target) || !gateway) throw new Error('Dùng: payroll.js <e2e|real> <http://localhost:5000>');
const { plan, today } = JSON.parse(fs.readFileSync(path.join(__dirname, 'output', `plan-${target}.json`), 'utf8'));
const manager = plan.booking.SalaryRates[0].created_by;
const token = `Bearer ${jwt.sign({ id: manager, role: 'GEN_MANAGER' }, process.env.JWT_SECRET, { expiresIn: '30m' })}`;
const call = async (method, url, body) => {
  const r = await fetch(`${gateway}/api/booking${url}`, { method, headers: { 'Content-Type': 'application/json', Authorization: token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const nextMonth = (m) => { const [y, mm] = m.split('-').map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; };

(async () => {
  const models = require(path.join(process.cwd(), 'models'));
  models.sequelize.options.logging = false;
  const { Payroll } = models;
  const first = plan.booking.SalaryRates[0].effective_from.slice(0, 7);
  const current = today.slice(0, 7);
  const result = [];
  const generated = [];
  for (let month = first; month < current; month = nextMonth(month)) {
    const gen = await call('POST', '/payroll/generate', { month });
    if (gen.status !== 200) {
      result.push(`${month}: chưa tạo được (${gen.message})`);
      (gen.problems || []).slice(0, 5).forEach((p) => result.push(`    - ${p.employee_name || ''} ${p.date || ''} ${p.reason}`));
      continue;
    }
    const payroll = await Payroll.findOne({ where: { month } });
    generated.push(payroll.id);
    const isLast = nextMonth(month) === current;
    await call('POST', `/payroll/${payroll.id}/lock`);
    if (!isLast) await call('POST', `/payroll/${payroll.id}/paid`, { paid_ref: `LUONG${month.replace('-', '')}` });
    // Mốc thời gian: tạo ngày 2, duyệt ngày 3, chi trả ngày 5 của tháng sau; tháng gần nhất đã duyệt, chờ chi trả
    const n = nextMonth(month);
    const at = (day, hh) => new Date(`${n}-${day}T${hh}:00+07:00`);
    const p = await Payroll.findByPk(payroll.id);
    const marks = { GENERATE: at('02', '09:30'), LOCK: at('03', '16:00'), PAID: at('05', '10:15') };
    await p.update({
      generated_at: marks.GENERATE, locked_at: marks.LOCK, paid_at: isLast ? null : marks.PAID,
      history: (p.history || []).map((h) => ({ ...h, at: marks[h.action] || h.at })),
    }, { silent: true });
    await models.sequelize.query('update "Payrolls" set "createdAt" = :c, "updatedAt" = :u where id = :id', { replacements: { c: marks.GENERATE, u: isLast ? marks.LOCK : marks.PAID, id: p.id } });
    await models.sequelize.query('update "PayrollItems" set "createdAt" = :c, "updatedAt" = :c where payroll_id = :id', { replacements: { c: marks.GENERATE, id: p.id } });
    result.push(`${month}: ${isLast ? 'đã duyệt, chờ chi trả' : 'đã chi trả'}`);
  }
  // Ghi id bảng lương vào danh sách dữ liệu demo để xóa được
  const ledgerFile = path.join(__dirname, 'output', `created-${target}.json`);
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  ledger.booking.Payrolls = { pk: 'id', ids: [...new Set([...(ledger.booking.Payrolls?.ids || []), ...generated])] };
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
  result.forEach((r) => console.log(r));
  await models.sequelize.close();
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
