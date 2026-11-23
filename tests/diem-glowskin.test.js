// Chạy từ service-identity. Test Điểm GlowSkin đợt 1 qua API, dữ liệu tạm, dọn ở finally.
process.loadEnvFile();
const crypto = require('crypto');
const fs = require('fs');
const mk = (d) => require('module').createRequire(`${process.cwd()}/../${d}/index.js`);
const RI = mk('service-identity'), RB = mk('service-booking');
const jwt = RI('jsonwebtoken'), dayjs = RB('dayjs'), { Op } = RB('sequelize');
const I = RI('./models'), B = RB('./models');
for (const m of [I, B]) m.sequelize.options.logging = false;

const G = 'http://localhost:4000/api';
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + x : ''}`);
const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
const call = async (method, url, token, body) => {
  const r = await fetch(G + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json().catch(() => ({}))];
};
const d = (n) => dayjs().add(n, 'day').format('YYYY-MM-DD');
const phone = () => `09${String(crypto.randomInt(10000000, 99999999))}`;
const sepayKey = fs.readFileSync('../service-booking/.env', 'utf8').match(/^\s*SEPAY_API_KEY\s*=\s*(.*)$/m)[1].trim();
const made = { users: [], shifts: [], eshifts: [], ext: [] };
const hook = async (content, amount) => {
  const id = `T${Date.now()}${crypto.randomInt(1000)}`; made.ext.push(id);
  await fetch(`${G}/booking/appointments/sepay-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${sepayKey}` }, body: JSON.stringify({ id, content, transferType: 'in', transferAmount: amount, transactionDate: dayjs().format('YYYY-MM-DD HH:mm:ss') }) });
};

(async () => {
  const cskh = await I.User.findOne({ where: { email: 'cskh.test@test.local' } });
  const manager = await I.User.findOne({ where: { role: 'GEN_MANAGER' } });
  const expert = await I.User.findOne({ where: { email: 'tuvan.dalieu@glowskin.example' } });
  const docA = (await I.User.findAll({ where: { role: 'DOCTOR' }, order: [['createdAt', 'ASC']] }))[0].id;
  const tCs = sign(cskh.id, 'CONSULTANT'), tMgr = sign(manager.id, 'GEN_MANAGER');
  const [sh] = await B.WorkShift.findOrCreate({ where: { employee_id: docA, date: d(4), shift_type: 'MORNING' }, defaults: { status: 'SCHEDULED' } }); made.shifts.push(sh.id);
  const cust = async (name) => {
    const [s, b] = await call('POST', '/identity/users/walk-in', tCs, { full_name: name, phone: phone() });
    if (s !== 201) throw new Error(JSON.stringify(b));
    made.users.push(b.data.userId);
    return { ...b.data, token: sign(b.data.userId, 'CUSTOMER') };
  };
  const k = await cust('Test Diem Mot');
  const book = (time, extra = {}) => call('POST', '/booking/appointments', k.token, { patient_profile_id: k.patientProfileId, doctor_id: docA, appointment_date: d(4), appointment_time: time, type: 'NEW_EXAM', pre_notes: 'Khám da', ...extra });
  const bal = async () => (await call('GET', '/booking/points/me', k.token))[1].data?.balance;
  let s, b;

  // 1. Huỷ trước >= 24 giờ: cọc thành điểm
  [s, b] = await call('GET', `/booking/appointments/deposit-quote?patient_profile_id=${k.patientProfileId}`, k.token);
  check('Báo giá cọc có số điểm cần (500 điểm cho cọc 50.000đ)', b.data?.points?.offline === 500 && b.data.points.balance === 0, JSON.stringify(b.data?.points));
  [s, b] = await book('08:00');
  const a1 = b.data.id;
  await hook(`O2O ${a1.slice(0, 6).toUpperCase()}`, 50000);
  check('Đặt lịch, chuyển khoản cọc 50.000đ: đã xác nhận', (await B.Appointment.findByPk(a1)).status === 'CONFIRMED');
  [s, b] = await call('PUT', `/booking/appointments/${a1}/cancel`, k.token, {});
  check('Khách huỷ trước 24 giờ: không phải xác nhận mất cọc, cọc đổi thành 500 điểm', s === 200 && b.deposit_outcome === 'POINTS' && b.points_added === 500, `${s} ${b.message}`);
  check('Số dư 500 điểm', (await bal()) === 500, await bal());
  [s, b] = await call('PUT', `/booking/appointments/${a1}/cancel`, k.token, {});
  check('Huỷ lại lần 2: bị chặn, không cộng điểm thêm', s >= 400 && (await bal()) === 500, `${s} ${b.message}`);

  // 2. Dùng điểm trả cọc
  [s, b] = await book('08:30', { use_points: true });
  const a2 = b.data?.id;
  const inv2 = a2 && await B.Invoice.findOne({ where: { appointment_id: a2 } });
  check('Đặt lịch bằng điểm: xác nhận ngay, không cần QR', s === 201 && b.paid === true && b.points_used === 500 && (await B.Appointment.findByPk(a2)).status === 'CONFIRMED', `${s} ${b.message}`);
  check('Hoá đơn cọc: đã thu, phương thức điểm', inv2?.payment_status === 'PAID' && inv2.payment_method === 'POINTS' && Number(inv2.total_amount) === 50000);
  check('Không ghi giao dịch tiền vào khi trả bằng điểm', (await B.Transaction.count({ where: { invoice_id: inv2.id } })) === 0);
  check('Số dư còn 0 điểm', (await bal()) === 0, await bal());
  const k0 = await cust('Test Diem Khong');
  [s, b] = await call('POST', '/booking/appointments', k0.token, { patient_profile_id: k0.patientProfileId, doctor_id: docA, appointment_date: d(4), appointment_time: '09:00', type: 'NEW_EXAM', pre_notes: 'Khám da', use_points: true });
  check('Không đủ điểm: báo thiếu, không tạo lịch', s === 409 && b.code === 'NOT_ENOUGH_POINTS' && !(await B.Appointment.findOne({ where: { customer_id: k0.userId } })), `${s} ${b.message}`);

  // 3. Lịch trả bằng điểm, huỷ đúng hạn: điểm được trả lại
  [s, b] = await call('PUT', `/booking/appointments/${a2}/cancel`, k.token, {});
  check('Huỷ lịch đã trả bằng điểm (trước 24 giờ): hoàn lại 500 điểm', s === 200 && b.deposit_outcome === 'POINTS' && (await bal()) === 500, `${s} ${b.message}`);

  // 4. Huỷ trong vòng 24 giờ: mất cọc
  const soon = await B.Appointment.create({ customer_id: k.userId, patient_profile_id: k.patientProfileId, doctor_id: docA, appointment_date: dayjs().add(3, 'hour').format('YYYY-MM-DD'), appointment_time: dayjs().add(3, 'hour').format('HH:mm:00'), status: 'CONFIRMED', type: 'NEW_EXAM' });
  await B.Invoice.create({ customer_id: k.userId, appointment_id: soon.id, total_amount: 50000, payment_status: 'PAID' });
  [s, b] = await call('PUT', `/booking/appointments/${soon.id}/cancel`, k.token, {});
  check('Huỷ trong 24 giờ: phải xác nhận mất cọc', s === 409 && b.code === 'CONFIRM_FORFEIT', `${s} ${b.message}`);
  [s, b] = await call('PUT', `/booking/appointments/${soon.id}/cancel`, k.token, { accept_forfeit: true });
  check('Huỷ trong 24 giờ: mất cọc, không cộng điểm', s === 200 && b.deposit_outcome === 'FORFEITED' && (await bal()) === 500, `${s} ${b.message}`);

  // 5. CSKH huỷ hộ (bên yêu cầu là khách, trước 24 giờ): cũng đổi thành điểm
  [s, b] = await book('09:30');
  const a5 = b.data.id;
  await hook(`O2O ${a5.slice(0, 6).toUpperCase()}`, 50000);
  [s, b] = await call('PUT', `/booking/appointments/${a5}/cancel`, tCs, { initiator: 'CUSTOMER', reason: 'Khách gọi điện xin huỷ lịch' });
  check('CSKH huỷ hộ khách trước 24 giờ: đổi thành điểm', s === 200 && b.deposit_outcome === 'POINTS' && (await bal()) === 1000, `${s} ${b.message}`);

  // 6. Phòng khám huỷ: CSKH hoàn bằng điểm (+10%)
  [s, b] = await book('10:00');
  const a6 = b.data.id;
  await hook(`O2O ${a6.slice(0, 6).toUpperCase()}`, 50000);
  [s, b] = await call('PUT', `/booking/appointments/${a6}/cancel`, tCs, { initiator: 'CLINIC', reason: 'Bác sĩ nghỉ đột xuất' });
  check('Phòng khám huỷ: chờ hoàn cọc', s === 200 && b.deposit_outcome === 'REFUND_PENDING', `${s} ${b.message}`);
  [s, b] = await call('PUT', `/booking/appointments/${a6}/refund-deposit`, tCs, { method: 'POINTS' });
  check('CSKH hoàn bằng điểm: 500 + 10% = 550 điểm', s === 200 && b.points_added === 550 && (await bal()) === 1550, `${s} ${b.message}`);
  check('Trạng thái hoàn: đã đổi thành điểm', (await B.AppointmentCancellation.findOne({ where: { appointment_id: a6 } })).deposit_outcome === 'POINTS');
  [s, b] = await call('PUT', `/booking/appointments/${a6}/refund-deposit`, tCs, { method: 'POINTS' });
  check('Không hoàn điểm 2 lần', s === 400 && (await bal()) === 1550, `${s} ${b.message}`);

  // 7. Tư vấn: trả bằng điểm, huỷ đúng hạn
  const [es] = await B.ExpertShift.findOrCreate({ where: { expert_id: expert.id, date: d(5), shift_type: 'MORNING' } }); made.eshifts.push(es.id);
  const fee = Number((await call('GET', '/booking/config/timing', null))[1].data?.consultFee || 300000);
  const need = Math.ceil(fee / 100);
  [s, b] = await call('POST', '/booking/consultations', k.token, { expert_id: expert.id, appointment_date: d(5), appointment_time: '08:00', question: 'Da tôi bị mụn ẩn vùng trán lâu ngày', use_points: true });
  check(`Tư vấn: không đủ ${need} điểm thì báo thiếu, không giữ chỗ`, s === 409 && b.code === 'NOT_ENOUGH_POINTS' && !(await B.Consultation.findOne({ where: { customer_id: k.userId } })), `${s} ${b.message}`);
  await B.PointTransaction.create({ customer_id: k.userId, delta: need, type: 'ADJUST', note: 'Test cộng điểm' });
  const before = await bal();
  [s, b] = await call('POST', '/booking/consultations', k.token, { expert_id: expert.id, appointment_date: d(5), appointment_time: '08:00', question: 'Da tôi bị mụn ẩn vùng trán lâu ngày', use_points: true });
  const c1 = b.data?.id;
  check('Tư vấn trả bằng điểm: xác nhận ngay', s === 201 && b.data.paid === true && (await B.Consultation.findByPk(c1)).status === 'CONFIRMED' && (await bal()) === before - need, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/booking/consultations/${c1}/cancel`, k.token, {});
  check('Huỷ tư vấn trước 24 giờ: phí đổi thành điểm', s === 200 && b.deposit_outcome === 'POINTS' && (await bal()) === before, `${s} ${b.message}`);

  // 8. Hai lần trả bằng điểm cùng lúc chỉ đủ cho 1: chỉ 1 lần được
  const k2 = await cust('Test Diem Hai');
  await B.PointTransaction.create({ customer_id: k2.userId, delta: 500, type: 'ADJUST', note: 'Test cộng điểm' });
  const book2 = (time) => call('POST', '/booking/appointments', k2.token, { patient_profile_id: k2.patientProfileId, doctor_id: docA, appointment_date: d(4), appointment_time: time, type: 'NEW_EXAM', pre_notes: 'Khám da', use_points: true });
  const rs = await Promise.all([book2('10:30'), book2('11:00')]);
  const okN = rs.filter(([x]) => x === 201).length;
  const bal2 = (await call('GET', '/booking/points/me', k2.token))[1].data.balance;
  check('2 lần trả bằng điểm cùng lúc, chỉ đủ 1: chỉ 1 lần thành công, số dư không âm', okN === 1 && bal2 === 0, `${rs.map(([x]) => x).join(',')} dư=${bal2}`);

  // 8b. Chốt hoá đơn sau khám cho lịch trả cọc bằng điểm: vẫn trừ đúng tiền cọc
  const won = rs.find(([x]) => x === 201)[1].data.id;
  await B.Appointment.update({ status: 'WAITING_FOR_SALE' }, { where: { id: won } });
  [s, b] = await call('PUT', `/booking/appointments/${won}/checkout`, tCs, { payment_method: 'CASH' });
  const invW = await B.Invoice.findOne({ where: { appointment_id: won } });
  const income = await B.Transaction.findAll({ where: { invoice_id: invW.id, transaction_type: 'INCOME' }, raw: true });
  check('Chốt hoá đơn lịch trả cọc bằng điểm: phí khám 100.000đ trừ cọc 50.000đ, thu thêm 50.000đ', s === 200 && income.length === 1 && Number(income[0].amount) === 50000, `${s} ${b.message} thu=${income.map((x) => x.amount).join(',')}`);

  // 9. Xem điểm, phân quyền
  [s, b] = await call('GET', '/booking/points/me', k.token);
  check('Khách xem số dư và lịch sử điểm', s === 200 && b.data.history.length >= 6 && b.data.history[0].type_label, `${b.data?.history?.length} dòng`);
  [s, b] = await call('GET', `/booking/points/customers/${k.userId}`, tCs);
  check('CSKH xem điểm của khách', s === 200 && b.data.balance === before, `${s} ${b.data?.balance}`);
  [s] = await call('GET', `/booking/points/customers/${k.userId}`, k.token);
  check('Khách không xem điểm người khác qua API nhân viên', s === 403, s);
  [s] = await call('GET', '/booking/points/me', null);
  check('Chưa đăng nhập: bị chặn', s === 401, s);
  const sum = Number(await B.PointTransaction.sum('delta', { where: { customer_id: k.userId } }));
  check('Số dư = tổng sổ điểm', sum === (await bal()), `${sum}`);
})().catch((e) => out.push(`FAIL  LỖI SCRIPT: ${e.stack}`)).finally(async () => {
  try {
    const apts = await B.Appointment.findAll({ where: { customer_id: made.users }, attributes: ['id'], raw: true });
    const ids = apts.map((a) => a.id);
    const inv = await B.Invoice.findAll({ where: { appointment_id: ids }, attributes: ['id'], raw: true });
    await B.Transaction.destroy({ where: { invoice_id: inv.map((i) => i.id) } });
    await B.AppointmentCancellation.destroy({ where: { appointment_id: ids } });
    await B.Invoice.destroy({ where: { appointment_id: ids } });
    await B.Appointment.destroy({ where: { id: ids } });
    await B.Consultation.destroy({ where: { customer_id: made.users } });
    await B.PointTransaction.destroy({ where: { customer_id: made.users } });
    await B.BankTransaction.destroy({ where: { external_id: made.ext } });
    if (B.RefundClaim) await B.RefundClaim.destroy({ where: { customer_id: made.users } }).catch(() => {});
    await B.WorkShift.destroy({ where: { id: made.shifts } });
    await B.ExpertShift.destroy({ where: { id: made.eshifts } });
    const pps = await I.PatientProfile.findAll({ where: { user_id: made.users }, attributes: ['id'], raw: true });
    await B.PatientSafety.destroy({ where: { patient_profile_id: pps.map((p) => p.id) } });
    for (const m of ['WalkInClaim', 'PatientProfile', 'Profile']) await I[m].destroy({ where: { user_id: made.users } });
    await I.User.destroy({ where: { id: made.users } });
    out.push('--- đã dọn dữ liệu tạm');
  } catch (e) { out.push(`CLEANUP LỖI: ${e.message}`); }
  console.log(out.join('\n'));
  console.log(`\nKẾT QUẢ: ${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('FAIL')).length} FAIL`);
  process.exit(0);
});
