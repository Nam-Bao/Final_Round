// Chạy từ service-booking. Test quy tắc "khách cũ" (miễn cọc + miễn phí khám): chỉ tính lịch bác sĩ ĐÃ KHÁM XONG.
// Phần 1-4 gọi API thật qua gateway. Phần 5 (khách đến thẳng) gọi thẳng controller với đồng hồ giả lập 9:00 sáng mai
// vì API khách đến thẳng chỉ nhận khi còn bác sĩ trong ca. Dữ liệu tạm, dọn ở finally.
process.loadEnvFile();
const RealDate = Date;
let offset = 0;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
  static now() { return RealDate.now() + offset; }
}
const crypto = require('crypto');
const fs = require('fs');
const RB = require('module').createRequire(`${process.cwd()}/index.js`);
const RI = require('module').createRequire(`${process.cwd()}/../service-identity/index.js`);
const jwt = RB('jsonwebtoken'), dayjs = RB('dayjs');
const B = RB('./models'); B.sequelize.options.logging = false;
const I = RI('./models'); I.sequelize.options.logging = false;

const G = 'http://localhost:4000/api';
const out = [];
const section = (t) => out.push(`\n## ${t}`);
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + x : ''}`);
const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
const call = async (method, url, token, body) => {
  const r = await fetch(G + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json().catch(() => ({}))];
};
const d = (n) => dayjs().add(n, 'day').format('YYYY-MM-DD');
const phone = () => `09${String(crypto.randomInt(10000000, 99999999))}`;
const sepayKey = fs.readFileSync('.env', 'utf8').match(/^\s*SEPAY_API_KEY\s*=\s*(.*)$/m)[1].trim();
const made = { users: [], shifts: [], ext: [] };

(async () => {
  const cskh = await I.User.findOne({ where: { email: 'cskh.test@test.local' } });
  const docA = (await I.User.findAll({ where: { role: 'DOCTOR' }, order: [['createdAt', 'ASC']] }))[0].id;
  const tCs = sign(cskh.id, 'CONSULTANT');
  for (const [date, type] of [[d(4), 'MORNING'], [d(1), 'MORNING']]) {
    const [sh, created] = await B.WorkShift.findOrCreate({ where: { employee_id: docA, date, shift_type: type }, defaults: { status: 'SCHEDULED' } });
    if (created) made.shifts.push(sh.id);
  }
  const cust = async (name) => {
    const [s, b] = await call('POST', '/identity/users/walk-in', tCs, { full_name: name, phone: phone() });
    if (s !== 201) throw new Error(JSON.stringify(b));
    made.users.push(b.data.userId);
    return { id: b.data.userId, pp: b.data.patientProfileId, token: sign(b.data.userId, 'CUSTOMER') };
  };
  // Lịch có sẵn ở 1 trạng thái (ngày quá khứ nếu đã khám, tương lai nếu chưa)
  const seed = (k, status, extra = {}) => B.Appointment.create({
    customer_id: k.id, patient_profile_id: k.pp, doctor_id: docA, appointment_time: '15:00:00', type: 'NEW_EXAM', status,
    appointment_date: ['COMPLETED', 'WAITING_FOR_SALE', 'NO_SHOW'].includes(status) ? d(-10) : d(10), ...extra,
  });
  const quote = async (k, pp = k.pp) => (await call('GET', `/booking/appointments/deposit-quote?patient_profile_id=${pp}`, k.token))[1].data;
  const book = (k, time, extra = {}) => call('POST', '/booking/appointments', k.token, { patient_profile_id: k.pp, doctor_id: docA, appointment_date: d(4), appointment_time: time, type: 'NEW_EXAM', pre_notes: '[OFFLINE] Khám da', ...extra });
  const isNew = (q) => q && q.isOldCustomer === false && q.offline === 50000 && q.online === 100000;
  const isOld = (q) => q && q.isOldCustomer === true && q.offline === 0 && q.online === 0;
  let s, b;

  section('1. Trạng thái lịch nào được tính là khách cũ (báo giá cọc)');
  const k0 = await cust('Test KC Moi');
  check('Khách mới, chưa có lịch: cọc 50.000đ / online 100.000đ', isNew(await quote(k0)), JSON.stringify(await quote(k0)));
  const cases = [
    ['PENDING_PAYMENT', false, 'Giữ chỗ chưa trả tiền'],
    ['PENDING', false, 'CSKH tạo, chưa xác nhận'],
    ['CONFIRMED', false, 'Đã cọc, chưa khám (lỗ hổng cũ)'],
    ['NEEDS_RESCHEDULE', false, 'Phòng khám cần đổi lịch'],
    ['CHECK_IN', false, 'Đã đến quầy, chưa vào khám'],
    ['WAITING', false, 'Đang chờ bác sĩ'],
    ['IN_PROGRESS', false, 'Bác sĩ đang khám'],
    ['CANCELLED', false, 'Đã huỷ'],
    ['NO_SHOW', false, 'Không đến'],
    ['WAITING_FOR_SALE', true, 'Khám xong, chờ thu tiền'],
    ['COMPLETED', true, 'Đã hoàn thành'],
  ];
  for (const [status, expectOld, label] of cases) {
    const k = await cust(`Test KC ${status}`);
    await seed(k, status);
    const q = await quote(k);
    check(`${label} (${status}): ${expectOld ? 'là khách cũ, miễn cọc' : 'vẫn là khách mới, phải cọc'}`, expectOld ? isOld(q) : isNew(q), JSON.stringify({ old: q?.isOldCustomer, offline: q?.offline }));
  }
  const kOnline = await cust('Test KC Online');
  await seed(kOnline, 'WAITING', { pre_notes: '[ONLINE] Khám online', appointment_date: d(10) });
  check('Lịch khám online đã trả tiền, chưa khám (WAITING): vẫn là khách mới', isNew(await quote(kOnline)));

  section('2. Lỗ hổng cũ: cọc 1 lịch rồi đặt lịch thứ 2');
  const k1 = await cust('Test KC Lo Hong');
  [s, b] = await book(k1, '08:00');
  const a1 = b.data.id;
  check('Lịch 1: khách mới, cọc 50.000đ', s === 201 && b.deposit_amount === 50000, `${s} cọc=${b.deposit_amount}`);
  const ext = `T${Date.now()}`; made.ext.push(ext);
  await fetch(`${G}/booking/appointments/sepay-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${sepayKey}` }, body: JSON.stringify({ id: ext, content: `O2O ${a1.slice(0, 6).toUpperCase()}`, transferType: 'in', transferAmount: 50000, transactionDate: dayjs().format('YYYY-MM-DD HH:mm:ss') }) });
  check('Lịch 1 đã chuyển khoản cọc: đã xác nhận', (await B.Appointment.findByPk(a1)).status === 'CONFIRMED');
  [s, b] = await book(k1, '08:30');
  const a2 = b.data?.id;
  check('Lịch 2 (lịch 1 chưa khám): PHẢI cọc 50.000đ, không còn miễn phí', s === 201 && b.deposit_amount === 50000 && b.is_returning_customer === false && (await B.Appointment.findByPk(a2)).status === 'PENDING_PAYMENT', `${s} cọc=${b.deposit_amount} trạng thái=${(await B.Appointment.findByPk(a2))?.status}`);
  const inv2 = await B.Invoice.findOne({ where: { appointment_id: a2 } });
  check('Hoá đơn cọc lịch 2: 50.000đ, chưa thu', Number(inv2.total_amount) === 50000 && inv2.payment_status === 'PENDING');
  [s, b] = await call('PUT', `/booking/appointments/${a1}/cancel`, k1.token, {});
  check('Huỷ lịch 1 (trước 24 giờ): cọc thành điểm như quy tắc mới', s === 200 && b.deposit_outcome === 'POINTS', `${s} ${b.deposit_outcome}`);
  check('Sau khi huỷ lịch 1: báo giá vẫn là khách mới', isNew(await quote(k1)));

  section('3. Sau khi khám xong thì được miễn phí');
  await B.Appointment.update({ status: 'WAITING_FOR_SALE', appointment_date: d(-1) }, { where: { id: a2 } });
  check('Lịch 2 bác sĩ khám xong (chờ thu tiền): báo giá thành khách cũ', isOld(await quote(k1)));
  [s, b] = await book(k1, '09:00');
  const a3 = b.data?.id;
  check('Lịch 3: miễn cọc, xác nhận ngay không qua thanh toán', s === 201 && b.deposit_amount === 0 && b.is_returning_customer === true && (await B.Appointment.findByPk(a3)).status === 'CONFIRMED', `${s} cọc=${b.deposit_amount} ${(await B.Appointment.findByPk(a3))?.status}`);
  const inv3 = await B.Invoice.findOne({ where: { appointment_id: a3 } });
  check('Hoá đơn lịch 3: 0đ (miễn phí khám khi chốt hoá đơn)', Number(inv3.total_amount) === 0, inv3.total_amount);

  section('4. Xét theo hồ sơ người khám, không theo tài khoản');
  const [ps, pb] = await call('POST', '/identity/profile/patients', k1.token, { full_name: 'Con Test KC', relationship: 'Con', gender: 'FEMALE', dob: '2015-01-01' });
  const child = pb.data?.id;
  check('Thêm hồ sơ người thân', ps === 201 || ps === 200, `${ps} ${pb.message}`);
  check('Người thân lần đầu khám (chủ tài khoản đã khám xong): vẫn phải cọc', isNew(await quote(k1, child)), JSON.stringify(await quote(k1, child)));
  [s, b] = await call('POST', '/booking/appointments', k1.token, { patient_profile_id: child, doctor_id: docA, appointment_date: d(4), appointment_time: '09:30', type: 'NEW_EXAM', pre_notes: '[OFFLINE] Khám da' });
  check('Đặt lịch cho người thân: cọc 50.000đ', s === 201 && b.deposit_amount === 50000, `${s} cọc=${b.deposit_amount}`);
  const kLegacy = await cust('Test KC Du Lieu Cu');
  await seed(kLegacy, 'COMPLETED', { patient_profile_id: null });
  check('Lịch cũ chưa ghi hồ sơ (null), đã khám xong: hồ sơ "Bản thân" tính là khách cũ', isOld(await quote(kLegacy)));
  const kStaff = await cust('Test KC CSKH Tao');
  await seed(kStaff, 'CONFIRMED');
  [s, b] = await call('POST', '/booking/appointments', tCs, { customer_id: kStaff.id, patient_profile_id: kStaff.pp, doctor_id: docA, appointment_date: d(4), appointment_time: '10:00', type: 'NEW_EXAM', pre_notes: '[OFFLINE] CSKH tạo' });
  check('CSKH tạo lịch cho khách có lịch đã cọc chưa khám: vẫn ghi cọc 50.000đ', s === 201 && b.deposit_amount === 50000 && b.is_returning_customer === false, `${s} cọc=${b.deposit_amount}`);

  section('5. Khách đến thẳng tại quầy (đồng hồ giả lập 9:00 sáng mai)');
  const kWNew = await cust('Test KC Quay Moi');
  const kWConf = await cust('Test KC Quay Da Coc');
  await seed(kWConf, 'CONFIRMED', { appointment_date: d(10) });
  const kWDone = await cust('Test KC Quay Da Kham');
  await seed(kWDone, 'COMPLETED');
  const tomorrow9 = new RealDate(`${d(1)}T09:00:00+07:00`);
  offset = tomorrow9.getTime() - RealDate.now();
  globalThis.Date = FakeDate;
  const A = RB('./controllers/appointment.controller');
  const walkIn = async (k) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; } };
    const req = { user: { id: cskh.id, role: 'CONSULTANT' }, body: { customer_id: k.id, patient_profile_id: k.pp, reason: 'Nổi mụn vùng má' }, params: {}, query: {}, headers: { authorization: `Bearer ${tCs}` }, header: () => `Bearer ${tCs}` };
    await A.createWalkIn(req, res);
    return [res.code, res.body || {}];
  };
  [s, b] = await walkIn(kWNew);
  check('Khách đến thẳng lần đầu: phí khám 100.000đ', s === 201 && b.exam_fee === 100000, `${s} ${b.message} phí=${b.exam_fee}`);
  [s, b] = await walkIn(kWConf);
  check('Khách đến thẳng, có lịch đã cọc nhưng chưa khám: vẫn phí 100.000đ', s === 201 && b.exam_fee === 100000, `${s} ${b.message} phí=${b.exam_fee}`);
  [s, b] = await walkIn(kWDone);
  check('Khách đến thẳng, đã từng khám xong: phí khám 0đ', s === 201 && b.exam_fee === 0, `${s} ${b.message} phí=${b.exam_fee}`);
  globalThis.Date = RealDate; offset = 0;
  const walkRow = await B.Appointment.findOne({ where: { customer_id: kWNew.id, source: 'WALK_IN' } });
  await walkRow.update({ status: 'CANCELLED' });
  const kWLeft = { ...kWNew };
  check('Khách đến thẳng ngồi chờ rồi bỏ về (huỷ): vẫn là khách mới', isNew(await quote(kWLeft)));
})().catch((e) => out.push(`FAIL  LỖI SCRIPT: ${e.stack}`)).finally(async () => {
  globalThis.Date = RealDate;
  try {
    const apts = await B.Appointment.findAll({ where: { customer_id: made.users }, attributes: ['id'], raw: true });
    const ids = apts.map((a) => a.id);
    const inv = await B.Invoice.findAll({ where: { appointment_id: ids }, attributes: ['id'], raw: true });
    await B.Transaction.destroy({ where: { invoice_id: inv.map((i) => i.id) } });
    await B.AppointmentCancellation.destroy({ where: { appointment_id: ids } });
    await B.Invoice.destroy({ where: { appointment_id: ids } });
    await B.Appointment.destroy({ where: { id: ids } });
    await B.PointTransaction.destroy({ where: { customer_id: made.users } });
    await B.BankTransaction.destroy({ where: { external_id: made.ext } });
    await B.WorkShift.destroy({ where: { id: made.shifts } });
    const pps = await I.PatientProfile.findAll({ where: { user_id: made.users }, attributes: ['id'], raw: true });
    await B.PatientSafety.destroy({ where: { patient_profile_id: pps.map((p) => p.id) } });
    for (const m of ['WalkInClaim', 'PatientProfile', 'Profile']) await I[m].destroy({ where: { user_id: made.users } });
    await I.User.destroy({ where: { id: made.users } });
    out.push('\n--- đã dọn dữ liệu tạm');
  } catch (e) { out.push(`CLEANUP LỖI: ${e.message}`); }
  console.log(out.join('\n'));
  console.log(`\nKẾT QUẢ: ${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('FAIL')).length} FAIL`);
  process.exit(0);
});
