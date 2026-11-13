// Lập kế hoạch dữ liệu demo 3 tháng: mô phỏng nghiệp vụ theo từng ngày, xuất plan-<target>.json cho các bộ ghi.
// Chạy: node plan.js e2e | real   (chỉ ĐỌC database)
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const D = require('./data');

const TARGET = process.argv[2];
if (!['e2e', 'real'].includes(TARGET)) throw new Error('Dùng: node plan.js e2e|real');
const q = (svc, sql) => L.query(svc, TARGET, sql);

const TODAY = L.vnToday();
const START = L.addDays(TODAY, -91);
const END = L.addDays(TODAY, 13);
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();
const P = { identity: {}, booking: {}, commerce: {}, media: {} };
const add = (svc, table, row) => { (P[svc][table] ||= []).push(row); return row; };
// Mọi mốc thời gian không được vượt quá lúc chạy script (sự việc chưa xảy ra thì chưa có bản ghi)
const NOW = new Date(Date.now() - 2 * 60000);
const past = (d) => { const x = new Date(d); return x > NOW ? NOW : x; };
const stamp = (row, created, updated) => { const c = past(created); const u = past(updated || created); return { ...row, createdAt: iso(c), updatedAt: iso(u < c ? c : u) }; };

// ===================== Dữ liệu đang có =====================
if (q('identity', `select id from "Users" where email like '%@${D.EMAIL_DOMAIN}'`).length) throw new Error('Database đã có dữ liệu demo, dừng lại để không tạo trùng');
const staffRows = q('identity', `select u.id, u.email, u.role, p.full_name from "Users" u join "Profiles" p on p.user_id = u.id where u.role <> 'CUSTOMER'`);
const OLD = { MG: 'quanly@gmail.com', AD: 'abc@gmail.com', D1: 'bacsi1@gmail.com', D2: 'bacsi2@gmail.com', C1: 'tuvan1@gmail.com', C2: 'tuvan2@gmail.com', K1: 'ktv1@gmail.com', S1: 'banhang1@gmail.com', E1: 'chuyengia1@gmail.com' };
const S = {};
for (const [k, email] of Object.entries(OLD)) {
  const row = staffRows.find((r) => r.email === email);
  if (!row) throw new Error(`Thiếu tài khoản ${email}`);
  S[k] = { id: row.id, name: row.full_name, role: row.role };
}
const e1Fee = Number(q('identity', `select session_fee from "DoctorProfiles" where user_id = '${S.E1.id}'`)[0]?.session_fee || 200000);
const maxCode = q('identity', `select max(employee_code) as m from "EmployeeRecords"`)[0]?.m || 'NV0000';
const oldServices = q('booking', `select id, name, price, duration_minutes from "SpaServices"`);
const oldProducts = q('commerce', `select p.id, p.name, p.price, p.weight, p.type, d.slug, d.is_prescription from "Products" p left join "ProductDetails" d on d.product_id = p.id`);
const categories = q('commerce', `select id, name from "Categories"`);
const existingShifts = q('booking', `select employee_id, date, shift_type from "WorkShifts"`);
const existingApts = q('booking', `select doctor_id, appointment_date, appointment_time from "Appointments" where status not in ('CANCELLED','NO_SHOW') and (source is null or source <> 'WALK_IN')`);
const existingExpertShifts = q('booking', `select expert_id, date, shift_type from "ExpertShifts"`);
const existingConsults = q('booking', `select expert_id, appointment_date, appointment_time from "Consultations" where status not in ('CANCELLED')`);
const oldRates = q('booking', `select employee_id, rate_per_shift from "SalaryRates"`);

const productKey = { CETAPHIL: 'Cetaphil', MEGADUO: 'Megaduo', B5: 'Cicaplast Baume B5', VICHY: 'Vichy', ANESSA: 'Anessa', LRP: 'Effaclar Purifying Foaming Gel' };
const PROD = {};
for (const [k, needle] of Object.entries(productKey)) {
  const p = oldProducts.find((x) => x.type === 'PRODUCT' && x.name.includes(needle));
  if (p) PROD[k] = { id: p.id, name: p.name, price: Number(p.price), weight: p.weight || 200, slug: p.slug, prescription: !!p.is_prescription };
}
const catId = (name) => categories.find((c) => c.name === name)?.id || null;

// ===================== Nhân viên mới =====================
const createdStaffAt = new Date(`${L.addDays(START, -40)}T09:00:00+07:00`);
let codeNo = Number(maxCode.slice(2));
for (const st of D.NEW_STAFF) {
  const id = L.uuid();
  S[st.key] = { id, name: st.name, role: st.role };
  add('identity', 'Users', stamp({ id, email: `${st.email}@${D.EMAIL_DOMAIN}`, role: st.role, status: 'ACTIVE' }, createdStaffAt));
  add('identity', 'Profiles', stamp({ user_id: id, full_name: st.name, phone: st.phone, dob: st.dob, gender: st.gender }, createdStaffAt));
  if (st.doctor) add('identity', 'DoctorProfiles', stamp({ id: L.uuid(), user_id: id, consult_field: null, session_fee: null, ...st.doctor, updated_by: S.MG.id }, createdStaffAt));
  codeNo += 1;
  add('identity', 'EmployeeRecords', stamp({
    id: L.uuid(), user_id: id, employee_code: `NV${String(codeNo).padStart(4, '0')}`, national_id: `0791${L.int(10000000, 99999999)}`,
    national_id_issue_date: '2021-07-10', national_id_issue_place: 'Cục Cảnh sát QLHC về TTXH', permanent_address: `${L.int(10, 300)} ${L.pick(D.STREETS)[0]}, TP. Hồ Chí Minh`,
    nationality: 'Việt Nam', ethnicity: 'Kinh', marital_status: L.pick(['SINGLE', 'MARRIED']), education_level: st.education_level,
    emergency_contact_name: 'Người thân', emergency_contact_relation: 'Gia đình', emergency_contact_phone: `09${L.int(10000000, 99999999)}`,
    position: st.position, employment_type: 'FULL_TIME', employment_status: 'WORKING', start_date: L.addDays(START, -35),
    contract_type: 'FIXED_TERM', contract_no: `2026/HĐLĐ-${String(codeNo).padStart(3, '0')}`, contract_start: L.addDays(START, -35), contract_end: L.addDays(START, 330),
    tax_code: `83${L.int(10000000, 99999999)}`, social_insurance_no: `79${L.int(10000000, 99999999)}`, bank_name: 'Vietcombank',
    bank_account_no: `10${L.int(10000000, 99999999)}`, bank_account_name: st.name.toUpperCase(), health_check_date: L.addDays(START, -60),
    role_data: {}, documents: [], notes: 'Hồ sơ tạo kèm dữ liệu demo', created_by: S.MG.id, updated_by: S.MG.id,
  }, createdStaffAt));
}
const fee = { E1: e1Fee, E2: D.NEW_STAFF.find((s) => s.key === 'E2').doctor.session_fee };

// ===================== Danh mục mới =====================
const SVC = {};
for (const s of oldServices) SVC[s.name] = { id: s.id, name: s.name, price: Number(s.price), duration: s.duration_minutes };
const catalogAt = new Date(`${L.addDays(START, -20)}T10:00:00+07:00`);
for (const s of D.NEW_SERVICES) {
  const id = L.uuid();
  SVC[s.name] = { id, name: s.name, price: s.price, duration: s.duration_minutes };
  const { key, ...row } = s;
  add('booking', 'SpaServices', stamp({ id, ...row, image_url: null, status: 'ACTIVE' }, catalogAt));
}
const PKG = {};
for (const p of D.NEW_PACKAGES) {
  const id = L.uuid();
  PKG[p.key] = { id, ...p };
  const { key, ...row } = p;
  add('booking', 'TreatmentPackages', stamp({ id, ...row, thumbnail_url: null, status: 'ACTIVE' }, catalogAt));
}
for (const p of D.NEW_PRODUCTS) {
  const id = L.uuid();
  PROD[p.key] = { id, name: p.name, price: p.price, weight: p.weight, prescription: !!p.prescription };
  add('commerce', 'Products', stamp({ id, name: p.name, type: 'PRODUCT', price: p.price, weight: p.weight, stock_quantity: p.stock, category_id: catId(p.category), start_date: iso(catalogAt), end_date: iso('2030-12-31T00:00:00+07:00'), image_url: [] }, catalogAt));
  add('commerce', 'ProductDetails', stamp({
    id: L.uuid(), product_id: id, slug: p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80),
    is_published: true, is_prescription: !!p.prescription, published_at: iso(catalogAt), brand: p.brand, origin: p.origin, capacity: p.capacity, skin_types: p.skin_types, concerns: p.concerns || [],
    short_description: p.short, description: p.short, ingredients: p.ingredients, usage: p.usage, storage: 'Bảo quản nơi khô ráo, tránh ánh nắng trực tiếp.', warnings: p.warnings, updated_by: S.MG.id,
  }, catalogAt));
}
const onlineProducts = Object.entries(PROD).filter(([, p]) => !p.prescription);

// Vật tư: mã, quy cách, lô hàng
const MAT = {};
for (const m of D.NEW_MATERIALS) {
  const id = L.uuid();
  MAT[m.key] = { id, ...m, lots: [] };
  add('commerce', 'Products', stamp({ id, name: m.name, type: 'MATERIAL', price: m.price, weight: 0, stock_quantity: 0, category_id: catId('Vật Tư Tiêu Hao') || catId('Vật tư tiêu hao (Nội bộ)'), start_date: iso(catalogAt), end_date: iso('2030-12-31T00:00:00+07:00'), image_url: [] }, catalogAt));
  add('commerce', 'MaterialSpecs', stamp({ id: L.uuid(), product_id: id, unit: m.unit, pack_size: m.pack_size, pack_label: m.pack_label, origin: m.origin, manufacturer: m.manufacturer, supplier: m.supplier, registration_no: null, source_url: null, min_stock: m.min_stock }, catalogAt));
}
for (const [target, norms] of Object.entries(D.NORMS)) {
  const svc = SVC[target];
  const pkg = Object.values(PKG).find((p) => p.name === target);
  if (!svc && !pkg) continue;
  for (const [mk, qty] of Object.entries(norms)) {
    add('commerce', 'MaterialNorms', stamp({ id: L.uuid(), target_type: svc ? 'SERVICE' : 'PACKAGE', target_id: (svc || pkg).id, target_name: target, product_id: MAT[mk].id, quantity: qty }, catalogAt));
  }
}
const purchase = (items, created, { status = 'APPROVED', received = true, ordered = true, reason, lotTag }) => {
  const id = L.uuid();
  const decided = L.addMin(created, 180);
  const orderedAt = L.addMin(created, 60 * 26);
  const receivedAt = L.addMin(created, 60 * 24 * 4);
  const rows = items.map(([mk, packs]) => {
    const m = MAT[mk];
    const quantity = packs * m.pack_size;
    const it = { product_id: m.id, name: m.name, unit: m.unit, stock: 0, min_stock: m.min_stock, pack_label: m.pack_label, pack_size: m.pack_size, packs, quantity };
    if (received) {
      const lot = { id: L.uuid(), lot_no: `${lotTag}-${mk.slice(0, 3)}`, expiry_date: L.addDays(TODAY, L.int(200, 700)), left: quantity, at: receivedAt };
      m.lots.push(lot);
      Object.assign(it, { received_quantity: quantity, unit_cost: m.price, lot_no: lot.lot_no, expiry_date: lot.expiry_date });
      add('commerce', 'MaterialLots', { id: lot.id, product_id: m.id, lot_no: lot.lot_no, expiry_date: lot.expiry_date, quantity_received: quantity, quantity_left: quantity, unit_cost: m.price, purchase_request_id: id, createdAt: iso(receivedAt), updatedAt: iso(receivedAt) });
    }
    return it;
  });
  add('commerce', 'InventoryRequests', stamp({
    id, requester_id: S.MG.id, type: 'PURCHASE_ORDER', items: rows, reason, status,
    approver_id: status === 'PENDING' ? null : S.MG.id, decided_at: status === 'PENDING' ? null : iso(decided), decision_note: status === 'PENDING' ? null : 'Đồng ý nhập theo đề xuất',
    ordered_at: ordered && status !== 'PENDING' ? iso(orderedAt) : null, ordered_by: ordered && status !== 'PENDING' ? S.MG.id : null,
    supplier: ordered && status !== 'PENDING' ? MAT[items[0][0]].supplier : null, expected_date: ordered && status !== 'PENDING' ? L.addDays(created.toISOString().slice(0, 10), 5) : null,
    received_at: received ? iso(receivedAt) : null, received_by: received ? S.MG.id : null, receive_note: null,
  }, created, received ? receivedAt : created));
};
purchase([['MASK', 30], ['NITRILE', 10], ['COTTON', 20], ['NEEDLE', 6], ['NUMBING', 12], ['PEEL', 6]], new Date(`${L.addDays(START, -6)}T09:30:00+07:00`), { reason: 'Nhập vật tư đầu kỳ cho các dịch vụ mới', lotTag: 'L2608' });
purchase([['MASK', 25], ['COTTON', 15], ['NITRILE', 6], ['NUMBING', 8]], new Date(`${L.addDays(START, 45)}T10:00:00+07:00`), { reason: 'Bổ sung vật tư tiêu hao theo cảnh báo tồn kho', lotTag: 'L2609' });

// ===================== Ca làm việc & chấm công =====================
const ROSTER = { // thứ: 0 = CN ... 6 = T7
  D1: { MORNING: [1, 2, 3, 4, 5, 6], AFTERNOON: [1, 3, 5] },
  D2: { MORNING: [2, 4, 6], AFTERNOON: [1, 2, 3, 4, 5, 6] },
  D3: { MORNING: [0, 2, 4], AFTERNOON: [0, 6] },
  C1: { MORNING: [1, 2, 3, 4, 5], AFTERNOON: [1, 2, 3, 4, 5] },
  C2: { MORNING: [0, 3, 4, 5, 6], AFTERNOON: [0, 3, 4, 5, 6] },
  K1: { MORNING: [1, 2, 3, 4, 5, 6], AFTERNOON: [1, 2, 3, 4, 5, 6] },
  K2: { MORNING: [0, 2, 4, 6], AFTERNOON: [0, 2, 4, 6] },
  S1: { MORNING: [1, 2, 3, 4, 5, 6], AFTERNOON: [1, 2, 3, 4, 5, 6] },
};
const oldShiftKey = new Set(existingShifts.map((s) => `${s.employee_id}|${s.date}`));
const shiftsByDate = {};
const kioskId = L.uuid();
add('booking', 'AttendanceKiosks', stamp({ id: kioskId, name: 'Máy chấm công quầy lễ tân (máy cũ)', token_hash: require('crypto').createHash('sha256').update(L.uuid()).digest('hex'), is_active: false, created_by: S.MG.id, last_seen_at: iso(`${L.addDays(TODAY, -2)}T17:05:00+07:00`) }, new Date(`${L.addDays(START, -1)}T08:00:00+07:00`)));
// Đơn xin nghỉ đã duyệt: ca đó không còn trong lịch
const LEAVES = [{ k: 'C2', date: L.addDays(START, 33), type: 'MORNING', reason: 'Xin nghỉ đưa mẹ đi khám bệnh' }, { k: 'K1', date: L.addDays(START, 61), type: 'AFTERNOON', reason: 'Xin nghỉ việc gia đình' }];
for (const lv of LEAVES) add('booking', 'ShiftRequests', stamp({ id: L.uuid(), employee_id: S[lv.k].id, reason: `${lv.reason} (ca ${lv.type === 'MORNING' ? 'sáng' : 'chiều'} ${lv.date})`, status: 'APPROVED', approved_by: S.MG.id, from_shift_id: null }, new Date(`${L.addDays(lv.date, -4)}T15:00:00+07:00`), new Date(`${L.addDays(lv.date, -3)}T09:00:00+07:00`)));
const isLeave = (k, date, type) => LEAVES.some((l) => l.k === k && l.date === date && l.type === type);

const attendanceOf = [];
for (let date = START; date <= END; date = L.addDays(date, 1)) {
  shiftsByDate[date] = [];
  for (const [k, plan] of Object.entries(ROSTER)) {
    const emp = S[k];
    for (const type of ['MORNING', 'AFTERNOON']) {
      if (!plan[type].includes(L.weekday(date)) || isLeave(k, date, type)) continue;
      if (oldShiftKey.has(`${emp.id}|${date}`)) continue; // ngày đã có lịch cũ: giữ nguyên lịch cũ
      const id = L.uuid();
      const past = date < TODAY;
      const shift = { id, employee_id: emp.id, date, shift_type: type, status: past ? 'ATTENDED' : 'SCHEDULED', k };
      shiftsByDate[date].push(shift);
      if (past) attendanceOf.push(shift);
    }
  }
  // Ca cũ cũng phục vụ khám/làm dịch vụ
  for (const s of existingShifts.filter((x) => x.date === date)) {
    const k = Object.keys(S).find((key) => S[key].id === s.employee_id);
    if (k) shiftsByDate[date].push({ id: null, employee_id: s.employee_id, date, shift_type: s.shift_type, k, old: true });
  }
}
// Kết quả chấm công
const ABSENT_PICK = attendanceOf.filter((s) => s.k === 'S1')[30];
const EXPLAIN_PICKS = new Set([attendanceOf.filter((s) => s.k === 'C1')[12], attendanceOf.filter((s) => s.k === 'K2')[8]].filter(Boolean));
const EARLY_PICK = attendanceOf.filter((s) => s.k === 'D2')[20];
for (const shift of attendanceOf) {
  const { start, end } = { start: L.at(shift.date, shift.shift_type === 'MORNING' ? '08:00' : '13:00'), end: L.at(shift.date, shift.shift_type === 'MORNING' ? '12:00' : '17:00') };
  const created = L.addMin(start, -L.int(3, 14));
  if (shift === ABSENT_PICK) {
    shift.status = 'ABSENT';
    add('booking', 'AttendanceRecords', stamp({ id: L.uuid(), shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, status: 'ABSENT', method: 'AUTO', minutes_late: 0, note: 'Không chấm công và không giải trình trong hạn' }, L.addMin(end, 60 * 25)));
    continue;
  }
  if (EXPLAIN_PICKS.has(shift)) {
    const arrival = L.addMin(start, L.int(15, 35));
    const exId = L.uuid();
    add('booking', 'AttendanceExplanations', stamp({ id: exId, shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, reason_type: 'TRAFFIC', arrival_time: iso(arrival), description: 'Kẹt xe kéo dài trên đường Cộng Hòa do va chạm giao thông, đến phòng khám trễ.', evidence_urls: [], witness_name: null, committed: true, status: 'APPROVED', reviewed_by: S.MG.id, reviewed_at: iso(L.addMin(end, 120)), review_note: 'Đồng ý, lần đầu trong tháng' }, L.addMin(arrival, 10), L.addMin(end, 120)));
    add('booking', 'AttendanceRecords', stamp({ id: L.uuid(), shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, status: 'EXPLAINED', check_in_at: iso(arrival), minutes_late: Math.round((arrival - start) / 60000), method: 'EXPLANATION', explanation_id: exId, kiosk_id: null, check_out_at: iso(L.addMin(end, L.int(1, 8))), checkout_status: 'ON_TIME', checkout_method: 'QR', minutes_early: 0 }, L.addMin(end, 120)));
    continue;
  }
  const late = L.chance(0.05) ? L.int(1, 9) : 0;
  const checkIn = late ? L.addMin(start, late) : created;
  if (shift === EARLY_PICK) {
    const leave = L.addMin(end, -60);
    add('booking', 'AttendanceCheckoutRequests', stamp({ id: L.uuid(), shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, kind: 'EARLY_LEAVE', reason_type: 'HEALTH', leave_time: iso(leave), is_early: true, description: 'Sốt nhẹ, xin về sớm 1 tiếng để đi khám.', witness_name: null, evidence_urls: [], committed: true, status: 'APPROVED', reviewed_by: S.MG.id, reviewed_at: iso(L.addMin(leave, -20)), review_note: 'Đồng ý' }, L.addMin(leave, -40), L.addMin(leave, -20)));
    add('booking', 'AttendanceRecords', stamp({ id: L.uuid(), shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, status: 'ON_TIME', check_in_at: iso(checkIn), minutes_late: 0, method: 'QR', face_count: 1, kiosk_id: kioskId, check_out_at: iso(leave), checkout_status: 'EARLY', checkout_method: 'REQUEST', minutes_early: 60 }, checkIn, leave));
    continue;
  }
  const checkOut = L.addMin(end, L.int(1, 12));
  add('booking', 'AttendanceRecords', stamp({ id: L.uuid(), shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type, status: late ? 'LATE' : 'ON_TIME', check_in_at: iso(checkIn), minutes_late: late, method: 'QR', face_count: 1, kiosk_id: kioskId, check_out_at: iso(checkOut), checkout_status: 'ON_TIME', checkout_method: 'QR', checkout_face_count: 1, minutes_early: 0 }, checkIn, checkOut));
}
for (const list of Object.values(shiftsByDate)) for (const s of list) if (!s.old) add('booking', 'WorkShifts', stamp({ id: s.id, employee_id: s.employee_id, date: s.date, shift_type: s.shift_type, status: s.status }, new Date(`${L.addDays(s.date, -14)}T10:00:00+07:00`)));
// Mức lương ca: áp dụng từ đầu tháng đầu tiên có dữ liệu
const rateStart = `${START.slice(0, 7)}-01`;
const defaultRate = { DOCTOR: 350000, CONSULTANT: 200000, TECHNICIAN: 250000, SALES: 180000 };
for (const k of Object.keys(ROSTER)) {
  const emp = S[k];
  const rate = Number(oldRates.find((r) => r.employee_id === emp.id)?.rate_per_shift || defaultRate[emp.role]);
  add('booking', 'SalaryRates', stamp({ id: L.uuid(), employee_id: emp.id, role: emp.role, rate_per_shift: rate, effective_from: rateStart, note: 'Mức lương theo hợp đồng', created_by: S.MG.id }, new Date(`${rateStart}T08:00:00+07:00`)));
}

// ===================== Công cụ xếp lịch =====================
const EXAM_SLOTS = { MORNING: L.slots('08:00', '12:00', 30), AFTERNOON: L.slots('13:00', '17:00', 30) };
const CONSULT_SLOTS = { MORNING: L.slots('08:00', '12:00', 45), AFTERNOON: L.slots('13:00', '17:00', 45), EVENING: L.slots('18:00', '21:00', 45) };
const taken = new Set(existingApts.map((a) => `${a.doctor_id}|${a.appointment_date}|${String(a.appointment_time).slice(0, 5)}`));
const onShift = (date, keys) => (shiftsByDate[date] || []).filter((s) => keys.includes(s.k));
const findExam = (date, preferK) => {
  const shifts = L.shuffle(onShift(date, ['D1', 'D2', 'D3']));
  shifts.sort((a, b) => (a.k === preferK ? -1 : 0) - (b.k === preferK ? -1 : 0));
  for (const s of shifts) {
    const free = (EXAM_SLOTS[s.shift_type] || []).filter((t) => !taken.has(`${s.employee_id}|${date}|${t}`));
    if (free.length) { const time = L.pick(free); taken.add(`${s.employee_id}|${date}|${time}`); return { doctorK: s.k, doctor: S[s.k], time }; }
  }
  return null;
};
const staffOn = (date, keys, fallback) => { const s = onShift(date, keys); return s.length ? S[L.pick(s).k] : S[fallback]; };
const ktvLoad = {};
const ktvOn = (date) => {
  const s = onShift(date, ['K1', 'K2']);
  if (!s.length) return null;
  const k = s.map((x) => x.k).sort((a, b) => (ktvLoad[`${a}|${date}`] || 0) - (ktvLoad[`${b}|${date}`] || 0))[0];
  ktvLoad[`${k}|${date}`] = (ktvLoad[`${k}|${date}`] || 0) + 1;
  return S[k];
};
const nextWorkDay = (date, keys) => { for (let d = date, i = 0; i < 10; d = L.addDays(d, 1), i += 1) if (onShift(d, keys).length) return d; return null; };
const bankId = () => String(L.int(40000000, 99999999));
const bank = (row, at) => add('booking', 'BankTransactions', stamp({ id: L.uuid(), external_id: bankId(), received_at: iso(at), ...row }, at));
// Nhân viên chuyển hoàn tiền với nội dung "HOAN <mã>" rồi ghi nhận; ngân hàng báo tiền ra => khoản hoàn đã xác minh.
// Cuối kế hoạch: khoản hoàn gần nhất để "chưa thấy tiền ra" cho demo quản lý đối chiếu sao kê. Trả về mã GD ghi vào bảng gốc
const BANKS = ['Vietcombank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'BIDV'];
const unaccent = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D');
const accountOf = (name) => `${L.pick(BANKS)} - ${L.int(1000000000, 9999999999)} - ${unaccent(name)}`;
const refundPaid = ({ source, sourceId, customerId, amount, at, staffId, account }) => {
  const ref = `FT${L.int(10000000, 99999999)}`;
  const code = sourceId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const claimId = L.uuid();
  const outAt = L.addMin(at, -L.int(2, 15));
  const outId = L.uuid();
  add('booking', 'BankTransactions', stamp({ id: outId, external_id: bankId(), received_at: iso(outAt), amount, content: `GLOWSKIN HOAN ${code}`, code_type: 'REFUND_OUT', code, matched_id: claimId, status: 'MATCHED', reference_code: ref }, outAt));
  add('booking', 'RefundClaims', stamp({
    id: claimId, source, source_id: sourceId, transfer_code: code, customer_id: customerId, amount, bank_ref: ref, account, claimed_by: staffId, claimed_at: iso(past(at)),
    status: 'VERIFIED', verified_method: 'BANK', verified_at: iso(past(at)), bank_tx_id: outId,
  }, at));
  return ref;
};

// ===================== Khách hàng =====================
const usedPhones = new Set();
const phone = () => { let p; do p = `${L.pick(['090', '093', '097', '098', '091', '035', '038', '070', '079'])}${L.int(1000000, 9999999)}`; while (usedPhones.has(p)); usedPhones.add(p); return p; };
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z ]/g, '').trim().split(/\s+/);
const customers = [];
[...D.CUSTOMERS, ...D.extraCustomers(44, L.pick, L.int)].forEach(([name, gender, year], i) => {
  const parts = slug(name);
  const c = {
    id: L.uuid(), name, gender, phone: phone(), dob: `${year}-${String(L.int(1, 12)).padStart(2, '0')}-${String(L.int(1, 28)).padStart(2, '0')}`,
    email: `${parts.slice(-1)[0]}.${parts.slice(0, -1).map((x) => x[0]).join('')}${i + 1}@${D.EMAIL_DOMAIN}`, profiles: [],
    street: L.pick(D.STREETS), houseNo: L.int(5, 420),
  };
  c.createdAt = new Date(`${L.addDays(START, L.int(-60, 0))}T${String(L.int(8, 22)).padStart(2, '0')}:${String(L.int(0, 59)).padStart(2, '0')}:00+07:00`);
  c.self = { id: L.uuid(), user_id: c.id, full_name: name, relationship: 'Bản thân', phone: c.phone, dob: c.dob, gender };
  c.profiles.push(c.self);
  customers.push(c);
});
D.RELATIVES.forEach(([relationship, name, gender, year], i) => {
  const c = customers[i * 5 + 2];
  c.profiles.push({ id: L.uuid(), user_id: c.id, full_name: name, relationship, phone: relationship === 'Con' ? c.phone : phone(), dob: `${year}-0${L.int(1, 9)}-1${L.int(0, 9)}`, gender });
});
for (const c of customers) {
  add('identity', 'Users', stamp({ id: c.id, email: c.email, role: 'CUSTOMER', status: 'ACTIVE' }, c.createdAt));
  add('identity', 'Profiles', stamp({ user_id: c.id, full_name: c.name, phone: c.phone, dob: c.dob, gender: c.gender }, c.createdAt));
  for (const p of c.profiles) add('identity', 'PatientProfiles', stamp(p, c.createdAt));
}
// Sàng lọc an toàn trước điều trị cho vài hồ sơ
const safetyProfiles = [[customers[7].self, ['BREASTFEEDING'], 'Không'], [customers[19].self, ['PLANNING_PREGNANCY'], 'Dị ứng nhẹ với nước hoa'], [customers[4].self, [], 'Dị ứng penicillin']];
for (const [p, flags, allergies] of safetyProfiles) add('booking', 'PatientSafeties', stamp({ patient_profile_id: p.id, flags, allergies, screened_at: iso(`${START}T09:00:00+07:00`), screened_by: S.C1.id }, new Date(`${START}T09:00:00+07:00`)));
const flagsOf = (p) => (safetyProfiles.find(([x]) => x.id === p.id)?.[1]) || [];

// ===================== Khám, chốt hóa đơn, liệu trình =====================
const served = new Set(); // hồ sơ đã từng được khám => khách cũ miễn cọc, miễn phí khám
const examsDone = [];
const followUps = []; // { record, profile, customer, date, doctorK }
const consultCredits = []; // cọc tư vấn chờ trừ vào lần khám
const matUsage = (sessionRef, refType, targetName, ktv, at) => {
  const norms = D.NORMS[targetName];
  if (!norms) return;
  const items = Object.entries(norms).map(([mk, qty]) => {
    const m = MAT[mk];
    const lots = [];
    let rest = qty;
    for (const lot of m.lots.filter((x) => x.at <= at).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))) {
      if (rest <= 0) break;
      const n = Math.min(rest, lot.left);
      if (!n) continue;
      lot.left -= n; rest -= n;
      lots.push({ lot_id: lot.id, lot_no: lot.lot_no, expiry_date: lot.expiry_date, quantity: n });
    }
    const deducted = qty - rest;
    m.stock = (m.stock ?? null);
    return { product_id: m.id, name: m.name, unit: m.unit, quantity: qty, deducted, shortage: rest, norm: qty, over_norm: false, under_norm: false, stock_after: null, lots };
  });
  add('commerce', 'InventoryRequests', stamp({ id: L.uuid(), requester_id: ktv.id, type: 'MATERIAL_USAGE', status: 'APPROVED', items, reason: `Buổi: ${targetName}`, reference_type: refType, reference_id: sessionRef, decision_note: null }, at));
};
const KTV_NOTES = ['Da đáp ứng tốt, không kích ứng sau buổi.', 'Lấy nhân mụn vùng trán và mũi, da hơi đỏ nhẹ, đã đắp mặt nạ làm dịu.', 'Khách chịu đau tốt, dặn chống nắng kỹ.', 'Da giảm đỏ so với buổi trước.'];

const completeSession = (table, row, targetName, refType, date) => {
  const ktv = ktvOn(date);
  if (!ktv) return null;
  const startAt = L.at(date, L.pick(['09:30', '10:30', '14:00', '15:00', '16:00']));
  const done = L.addMin(startAt, 60);
  add('booking', table, stamp({ ...row, technician_id: ktv.id, technician_note: L.pick(KTV_NOTES), post_treatment_images: [], status: 'COMPLETED' }, L.addMin(startAt, -60 * 24), done));
  matUsage(row.id, refType, targetName, ktv, done);
  return { ktv, done };
};

const reviewDoctor = (apt, c, profile, doctor, at) => {
  const rating = L.weighted([[5, 6], [4, 3], [3, 1]]);
  add('booking', 'AppointmentReviews', stamp({ id: L.uuid(), appointment_id: apt.id, customer_id: c.id, doctor_id: doctor.id, customer_name: c.name, doctor_name: doctor.name, rating, comment: L.pick(D.REVIEW_COMMENTS[rating]), status: 'VISIBLE' }, at));
};

// Một lượt khám. outcome: COMPLETED | CANCELLED_CUSTOMER | CANCELLED_CLINIC | NO_SHOW | UPCOMING | TODAY_* | WALK_IN_*
const exam = (c, profile, date, cond, opt = {}) => {
  const isWalkIn = (opt.outcome || '').startsWith('WALK_IN');
  const slot = isWalkIn ? { doctorK: null, doctor: null, time: L.pick(['09:10', '10:20', '14:35', '15:40']) } : findExam(date, opt.preferDoctor);
  if (!slot) return null;
  const online = !!opt.online && !isWalkIn;
  const old = served.has(profile.id);
  const outcome = opt.outcome || (date < TODAY ? 'COMPLETED' : 'UPCOMING');
  const id = L.uuid();
  const C = staffOn(date, ['C1', 'C2'], 'C1');
  let bookedAt = isWalkIn ? L.at(date, slot.time) : new Date(`${L.addDays(date, -L.int(1, 6))}T${String(L.int(8, 22)).padStart(2, '0')}:${String(L.int(0, 59)).padStart(2, '0')}:00+07:00`);
  let t0 = L.at(date, slot.time);
  // Khách đến thẳng hôm nay: giờ đến phải trước hiện tại
  if (isWalkIn && t0 > NOW) t0 = L.addMin(NOW, -L.int(15, 40));
  if (bookedAt > NOW) bookedAt = isWalkIn ? t0 : L.addMin(NOW, -L.int(30, 60 * 30));
  const condData = D.CONDITIONS[cond];
  const pre = online ? `[ONLINE] ${L.pick(condData.reasons)}` : `Lý do khám: ${L.pick(condData.reasons)} - Skincare: ${L.pick(condData.skincare)} - Ghi chú CSKH: Khách ${opt.type === 'FOLLOW_UP' ? 'tái khám theo hẹn' : 'khám lần đầu'}`;
  const apt = {
    id, customer_id: c.id, patient_profile_id: profile.id, doctor_id: slot.doctor?.id || null, consultant_id: online ? null : C.id,
    appointment_date: date, appointment_time: `${slot.time}:00`, budget: online ? null : L.pick([null, 'MEDIUM', 'HIGH', 'LOW']), pre_notes: pre,
    customer_reschedule_count: opt.rescheduled ? 1 : 0, source: isWalkIn ? 'WALK_IN' : null, arrived_at: isWalkIn ? iso(t0) : null,
    queued_at: null, exam_started_at: null, status: 'CONFIRMED', type: opt.type || 'NEW_EXAM', symptoms: L.pick(condData.symptoms),
    pre_exam_images: [], diagnosis: null, doctor_notes: null, prescribed_services: [], prescribed_packages: [], prescribed_medicines: [],
  };
  // Cọc: online trả trước phí khám, tại phòng khám cọc 50k, khách cũ và khách đến thẳng không cọc
  const deposit = isWalkIn || old ? 0 : online ? 100000 : 50000;
  const invoice = { id: L.uuid(), customer_id: c.id, appointment_id: id, total_amount: isWalkIn && !old ? 100000 : deposit, payment_status: isWalkIn ? 'PENDING' : 'PAID', payment_method: deposit ? 'VIETQR' : 'UNKNOWN', breakdown: null };
  const paidAt = L.addMin(bookedAt, L.int(2, 9));
  const tx = [];
  if (deposit) {
    tx.push({ id: L.uuid(), invoice_id: invoice.id, amount: deposit, transaction_type: 'INCOME', note: `Khách thanh toán cọc VietQR cho đơn ${L.code6(id)}`, createdAt: iso(paidAt), updatedAt: iso(paidAt) });
    bank({ amount: deposit, content: `${c.name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D')} chuyen tien O2O ${id.slice(0, 6)}`, code_type: 'APPOINTMENT', code: id.slice(0, 6), matched_id: id, status: 'MATCHED' }, paidAt);
  }
  // Khách đi khám sau buổi tư vấn chuyên gia khuyên khám: CSKH xem lịch sử tư vấn, áp voucher nội bộ SAUTUVAN (kèm ảnh xác thực)
  const afterConsult = !old && !online && !isWalkIn ? consultCredits.find((cr) => cr.customer === c && !cr.used && cr.at < bookedAt) : null;
  if (afterConsult) afterConsult.used = true;
  let updated = paidAt;

  const finish = () => {
    // Đến khám: CSKH hỏi trước khám, bác sĩ khám, chốt hóa đơn
    const queued = L.addMin(t0, isWalkIn ? 8 : -L.int(5, 15));
    const started = L.addMin(queued, L.int(5, 20));
    const ended = L.addMin(started, L.int(15, 25));
    const checkout = L.addMin(ended, L.int(8, 25));
    Object.assign(apt, { queued_at: iso(queued), exam_started_at: iso(started), diagnosis: L.pick(condData.diagnoses), doctor_notes: L.pick(condData.notes) });
    if (isWalkIn) { apt.doctor_id = staffOn(date, ['D1', 'D2', 'D3'], 'D1').id; }
    const doctor = Object.values(S).find((s) => s.id === apt.doctor_id);
    const flags = flagsOf(profile);
    const avoidRetinoid = flags.some((f) => ['PREGNANT', 'PLANNING_PREGNANCY', 'BREASTFEEDING'].includes(f));
    // Bác sĩ kê: gói liệu trình hoặc dịch vụ lẻ + sản phẩm
    const buysPackage = !online && opt.type !== 'FOLLOW_UP' && L.chance(opt.packageChance ?? 0.6);
    const pkg = buysPackage ? PKG[condData.pkg] : null;
    const service = !online && !pkg && L.chance(0.45) ? SVC[L.pick(condData.services)] : null;
    let meds = condData.products.filter((k) => PROD[k] && !(avoidRetinoid && ['KLENZIT', 'MEGADUO'].includes(k)));
    meds = L.shuffle(meds).slice(0, L.int(online ? 1 : 0, 2)).map((k) => ({ product_id: PROD[k].id, quantity: 1, key: k }));
    const exam_fee = invoice.total_amount === 0 ? 0 : 100000;
    const svcValue = service ? service.price : 0;
    const pkgValue = pkg ? pkg.promotional_price : 0;
    const prodValue = online ? 0 : meds.reduce((s, m) => s + PROD[m.key].price * m.quantity, 0);
    const gross = exam_fee + svcValue + pkgValue + prodValue;
    const discount = afterConsult ? Math.min(Math.round(gross * AFTER_CONSULT.discount_value / 100), AFTER_CONSULT.max_discount) : 0;
    const total = gross - discount;
    const due = Math.max(0, total - deposit);
    if (afterConsult) {
      AFTER_CONSULT.used_count += 1;
      add('commerce', 'PromotionUsages', stamp({
        id: L.uuid(), customer_id: c.id, promotion_id: AFTER_CONSULT.id, proof_url: proofImage(afterConsult.consult), applied_by: C.id, applied_role: 'CONSULTANT',
        channel: 'CLINIC', reference_id: id, discount_amount: discount,
      }, checkout));
    }
    Object.assign(apt, { status: 'COMPLETED', prescribed_services: service ? [service.id] : [], prescribed_packages: pkg ? [pkg.id] : [], prescribed_medicines: meds.map(({ product_id, quantity }) => ({ product_id, quantity })) });
    Object.assign(invoice, {
      total_amount: total, payment_status: 'PAID', payment_method: 'CASH',
      breakdown: { exam_fee, services: svcValue, packages: pkgValue, products: prodValue, discount, consult_credit: 0, total, service_items: service ? [{ id: service.id, name: service.name, price: service.price }] : [], package_items: pkg ? [{ id: pkg.id, name: pkg.name, price: pkg.promotional_price }] : [], checked_out_at: iso(checkout) },
    });
    if (due > 0) tx.push({ id: L.uuid(), invoice_id: invoice.id, amount: due, transaction_type: 'INCOME', note: `Thu phần còn lại. Phí khám: ${exam_fee}, Dịch vụ/SP: ${svcValue + pkgValue + prodValue}, Giảm giá: ${discount}, Đã cọc: ${deposit}, Cọc tư vấn: 0`, createdAt: iso(checkout), updatedAt: iso(checkout) });
    updated = checkout;
    served.add(profile.id);
    // Đơn mỹ phẩm mua tại quầy
    if (!online && meds.length) {
      const orderId = L.uuid();
      add('commerce', 'Orders', stamp({ id: orderId, customer_id: c.id, appointment_id: id, consultant_id: C.id, recipient_name: profile.full_name, shipping_phone: profile.phone || c.phone, shipping_address: 'Nhận tại quầy phòng khám GlowSkin', note: 'Mua tại quầy theo đơn bác sĩ kê sau buổi khám', total_amount: prodValue, discount_amount: 0, shipping_fee: 0, status: 'COMPLETED', payment_method: 'COD' }, checkout));
      for (const m of meds) add('commerce', 'OrderDetails', stamp({ id: L.uuid(), order_id: orderId, product_id: m.product_id, quantity: m.quantity, price: PROD[m.key].price, weight: PROD[m.key].weight }, checkout));
    }
    // Bệnh án và hẹn tái khám
    const followDays = cond === 'MELASMA' ? 42 : 28;
    const record = { id: L.uuid(), appointment_id: id, patient_profile_id: profile.id, doctor_id: apt.doctor_id, exam_date: iso(ended), symptoms: apt.symptoms, diagnosis: apt.diagnosis, doctor_notes: apt.doctor_notes, follow_up_date: opt.type === 'FOLLOW_UP' && L.chance(0.6) ? null : L.addDays(date, followDays), pre_exam_images: [], post_exam_images: [] };
    add('identity', 'MedicalRecords', stamp(record, ended));
    if (record.follow_up_date) followUps.push({ record, profile, customer: c, cond, doctorK: Object.keys(S).find((k) => S[k].id === apt.doctor_id), date: record.follow_up_date });
    // Liệu trình mua tại quầy: buổi 1 làm ngay, các buổi sau khách tự đặt theo khoảng cách của gói
    if (pkg) {
      const cpId = L.uuid();
      let done = 0;
      const sessions = [];
      let sDate = date;
      for (let n = 1; n <= pkg.total_sessions; n += 1) {
        if (n > 1) sDate = nextWorkDay(L.addDays(sDate, pkg.interval_days + L.int(0, 3)), ['K1', 'K2']);
        if (!sDate) break;
        const row = { id: L.uuid(), customer_package_id: cpId, patient_profile_id: profile.id, session_number: n, session_date: sDate };
        if (sDate < TODAY) { if (completeSession('TreatmentSessions', row, pkg.name, 'TREATMENT_SESSION', sDate)) { done += 1; sessions.push(row); } }
        else { add('booking', 'TreatmentSessions', stamp({ ...row, technician_id: null, technician_note: null, post_treatment_images: [], status: 'SCHEDULED' }, L.at(L.addDays(sDate, -6), '20:00'))); break; }
      }
      add('booking', 'CustomerPackages', stamp({ id: cpId, customer_id: c.id, package_id: pkg.id, total_sessions: pkg.total_sessions, remaining_sessions: pkg.total_sessions - done, status: done === pkg.total_sessions ? 'COMPLETED' : 'ACTIVE' }, checkout, sessions.length ? L.at(sessions[sessions.length - 1].session_date, '17:00') : checkout));
      if (sessions.length && L.chance(0.4)) add('booking', 'ServiceReviews', stamp({ id: L.uuid(), customer_id: c.id, session_type: 'PACKAGE', session_id: sessions[0].id, service_id: pkg.id, service_name: pkg.name, customer_name: c.name, rating: L.weighted([[5, 6], [4, 3]]), comment: L.pick(['KTV làm nhẹ tay, giải thích kỹ từng bước.', 'Da cải thiện sau vài buổi, sẽ đi tiếp liệu trình.', 'Phòng làm dịch vụ sạch sẽ, thoải mái.']), status: 'VISIBLE' }, L.at(L.addDays(sessions[0].session_date, 1), '21:00')));
    }
    if (service) {
      const row = { id: L.uuid(), customer_id: c.id, patient_profile_id: profile.id, spa_service_id: service.id, session_date: date };
      if (completeSession('ServiceSessions', row, service.name, 'SERVICE_SESSION', date) && L.chance(0.35)) {
        add('booking', 'ServiceReviews', stamp({ id: L.uuid(), customer_id: c.id, session_type: 'SINGLE', session_id: row.id, service_id: service.id, service_name: service.name, customer_name: c.name, rating: L.weighted([[5, 5], [4, 3], [3, 1]]), comment: L.pick(['Làm cẩn thận, da sạch hẳn.', 'Hơi đau một chút nhưng hiệu quả.', 'Nhân viên thân thiện.']), status: 'VISIBLE' }, L.at(L.addDays(date, 1), '20:30')));
      }
    }
    if (L.chance(0.55)) reviewDoctor(apt, c, profile, doctor, L.addMin(checkout, 60 * L.int(3, 40)));
    examsDone.push({ apt, c, profile, online, meds, date });
  };

  if (outcome === 'COMPLETED' || outcome === 'WALK_IN_DONE') finish();
  else if (outcome === 'CANCELLED_CUSTOMER' || outcome === 'CANCELLED_CLINIC') {
    const clinic = outcome === 'CANCELLED_CLINIC';
    const cancelAt = clinic ? L.at(L.addDays(date, -1), '16:30') : L.addMin(paidAt, 60 * L.int(20, 70));
    apt.status = 'CANCELLED';
    const refunded = clinic && date < L.addDays(TODAY, -2);
    add('booking', 'AppointmentCancellations', stamp({ id: L.uuid(), appointment_id: id, cancelled_by: clinic ? C.id : c.id, cancelled_by_role: clinic ? 'CONSULTANT' : 'CUSTOMER', initiator: clinic ? 'CLINIC' : 'CUSTOMER', reason: clinic ? 'Bác sĩ có lịch hội chẩn đột xuất, phòng khám xin hủy và hoàn cọc' : L.pick(['Bận việc đột xuất không sắp xếp được', 'Đi công tác xa']), previous_status: 'CONFIRMED', deposit_paid: deposit, deposit_outcome: deposit === 0 ? 'NONE' : clinic ? (refunded ? 'REFUNDED' : 'REFUND_PENDING') : 'FORFEITED', forfeit_acknowledged: !clinic && deposit > 0, refund_ref: refunded ? refundPaid({ source: 'APPOINTMENT', sourceId: id, customerId: c.id, amount: deposit, at: L.addMin(cancelAt, 120), staffId: C.id, account: accountOf(c.name) }) : null, refund_note: refunded ? 'Đã chuyển khoản hoàn cọc' : null, refunded_by: refunded ? C.id : null, refunded_at: refunded ? iso(L.addMin(cancelAt, 120)) : null }, cancelAt, refunded ? L.addMin(cancelAt, 120) : cancelAt));
    if (refunded) { invoice.payment_status = 'REFUNDED'; tx.push({ id: L.uuid(), invoice_id: invoice.id, amount: deposit, transaction_type: 'REFUND', note: `Phòng khám hủy lịch - Hoàn cọc ${L.code6(id)} - GD ${L.int(100000, 999999)}`, createdAt: iso(L.addMin(cancelAt, 120)), updatedAt: iso(L.addMin(cancelAt, 120)) }); }
    updated = cancelAt;
  } else if (outcome === 'NO_SHOW') {
    apt.status = 'NO_SHOW';
    const at = L.addMin(t0, 20);
    add('booking', 'AppointmentCancellations', stamp({ id: L.uuid(), appointment_id: id, cancelled_by: C.id, cancelled_by_role: 'CONSULTANT', initiator: 'CUSTOMER', reason: 'Khách không đến, quá giờ hẹn 15 phút', previous_status: 'CONFIRMED', deposit_paid: deposit, deposit_outcome: deposit ? 'FORFEITED' : 'NONE', forfeit_acknowledged: false }, at));
    updated = at;
  } else if (outcome === 'UPCOMING') {
    apt.status = 'CONFIRMED';
  } else if (outcome === 'NEEDS_RESCHEDULE') {
    apt.status = 'NEEDS_RESCHEDULE';
  } else if (outcome === 'TODAY_WAITING') {
    Object.assign(apt, { status: 'WAITING', queued_at: iso(past(L.addMin(t0, -10))) });
  } else if (outcome === 'TODAY_SALE') {
    const queued = past(L.addMin(t0, -10)); const started = past(L.addMin(queued, 8));
    const pkg = PKG[condData.pkg];
    Object.assign(apt, { status: 'WAITING_FOR_SALE', queued_at: iso(queued), exam_started_at: iso(started), diagnosis: L.pick(condData.diagnoses), doctor_notes: L.pick(condData.notes), prescribed_packages: [pkg.id], prescribed_medicines: [{ product_id: PROD[condData.products.find((k) => PROD[k] && !PROD[k].prescription)].id, quantity: 1 }] });
    add('identity', 'MedicalRecords', stamp({ id: L.uuid(), appointment_id: id, patient_profile_id: profile.id, doctor_id: apt.doctor_id, exam_date: iso(past(L.addMin(started, 20))), symptoms: apt.symptoms, diagnosis: apt.diagnosis, doctor_notes: apt.doctor_notes, follow_up_date: L.addDays(date, 28), pre_exam_images: [], post_exam_images: [] }, L.addMin(started, 20)));
    updated = L.addMin(started, 20);
  } else if (outcome === 'WALK_IN_WAITING') {
    Object.assign(apt, { status: 'CHECK_IN', doctor_id: null });
  }
  add('booking', 'Appointments', stamp(apt, bookedAt, updated));
  add('booking', 'Invoices', stamp(invoice, bookedAt, updated));
  for (const t of tx) add('booking', 'Transactions', t);
  return apt;
};

// ===================== Tư vấn chuyên gia =====================
const CONSULT_FEE = 300000; // khớp CONSULT_FEE mặc định của service-booking
// Voucher nội bộ cho khách khám sau buổi tư vấn (không hiện trên website, chỉ CSKH áp kèm ảnh xác thực)
const AFTER_CONSULT = { id: L.uuid(), code: 'SAUTUVAN', discount_value: 10, max_discount: 200000, used_count: 0 };
// Ảnh xác thực demo: ảnh SVG ghi rõ là dữ liệu demo (dữ liệu thật là ảnh CSKH chụp lịch sử tư vấn trên điện thoại khách)
const proofImage = (consult) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f5f3ff"/><text x="16" y="40" font-family="Arial" font-size="16" fill="#5b21b6">ẢNH XÁC THỰC (DỮ LIỆU DEMO)</text><text x="16" y="80" font-family="Arial" font-size="14" fill="#333">Lịch sử tư vấn: ${consult.consult_field}</text><text x="16" y="110" font-family="Arial" font-size="14" fill="#333">Ngày ${consult.appointment_date}</text><text x="16" y="140" font-family="Arial" font-size="14" fill="#333">${consult.expert_name}</text></svg>`)}`;
const EXPERT_PLAN = { E1: { MORNING: [6], EVENING: [2, 4] }, E2: { AFTERNOON: [0], EVENING: [1, 3, 5] } };
const oldExpertShift = new Set(existingExpertShifts.map((s) => `${s.expert_id}|${s.date}|${s.shift_type}`));
const expertSlots = [];
for (let date = START; date <= END; date = L.addDays(date, 1)) {
  for (const [k, plan] of Object.entries(EXPERT_PLAN)) for (const [type, days] of Object.entries(plan)) {
    if (!days.includes(L.weekday(date)) || oldExpertShift.has(`${S[k].id}|${date}|${type}`)) continue;
    add('booking', 'ExpertShifts', stamp({ id: L.uuid(), expert_id: S[k].id, date, shift_type: type, created_by: S.MG.id }, new Date(`${L.addDays(date, -10)}T09:00:00+07:00`)));
    for (const time of CONSULT_SLOTS[type]) expertSlots.push({ k, date, time, used: existingConsults.some((x) => x.expert_id === S[k].id && x.appointment_date === date && String(x.appointment_time).slice(0, 5) === time) });
  }
}
const consultsByMonth = {};
const consult = (c, from, field, outcome) => {
  const k = field === 'NUTRITION' ? 'E1' : 'E2';
  const slot = expertSlots.find((s) => s.k === k && !s.used && s.date >= from && (outcome === 'UPCOMING' ? s.date > TODAY : s.date < TODAY));
  if (!slot) return null;
  slot.used = true;
  const id = L.uuid();
  const start = L.at(slot.date, slot.time);
  let bookedAt = L.at(L.addDays(slot.date, -L.int(1, 4)), `${L.int(8, 21)}:15`.padStart(5, '0'));
  if (bookedAt > NOW) bookedAt = L.addMin(NOW, -L.int(30, 60 * 30));
  const paidAt = L.addMin(bookedAt, L.int(2, 8));
  const row = { id, customer_id: c.id, customer_name: c.name, expert_id: S[k].id, expert_name: S[k].name, consult_field: field, appointment_date: slot.date, appointment_time: `${slot.time}:00`, question: L.pick(D.CONSULT_QUESTIONS[field]), status: 'CONFIRMED', deposit_amount: CONSULT_FEE, payment_method: 'VIETQR', paid_at: iso(paidAt), deposit_outcome: 'NONE', reschedule_count: 0, review_hidden: false, recommend_exam: false };
  bank({ amount: CONSULT_FEE, content: `${c.name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D')} TV ${id.slice(0, 6)}`, code_type: 'CONSULTATION', code: id.slice(0, 6), matched_id: id, status: 'MATCHED' }, paidAt);
  let updated = paidAt;
  if (outcome === 'COMPLETED') {
    const expertIn = L.addMin(start, -L.int(1, 4)); const customerIn = L.addMin(start, L.int(0, 3)); const doneAt = L.addMin(start, L.int(30, 42));
    const r = D.CONSULT_RESULTS[field];
    const recommend = field === 'COSMETICS' && L.chance(0.6);
    const products = field === 'COSMETICS' ? L.shuffle(onlineProducts).slice(0, 2).map(([, p]) => ({ product_id: p.id, name: p.name, slug: p.slug || null, image_url: null, price: p.price, quantity: 1, usage: 'Dùng theo hướng dẫn trên bao bì, bắt đầu cách ngày trong tuần đầu.' })) : [];
    Object.assign(row, { status: 'COMPLETED', expert_joined_at: iso(expertIn), customer_joined_at: iso(customerIn), completed_at: iso(doneAt), result: { ...r, products }, expert_note: r.advice, recommend_exam: recommend });
    if (L.chance(0.6)) Object.assign(row, { rating: L.weighted([[5, 6], [4, 3]]), review_comment: L.pick(['Chuyên gia tư vấn rất dễ hiểu.', 'Được chỉ cách đọc thành phần mỹ phẩm, rất hữu ích.', 'Buổi tư vấn đúng giờ, nhiệt tình.']), reviewed_at: iso(L.addMin(doneAt, 90)) });
    row.recommendCredit = recommend;
    updated = doneAt;
    const month = (consultsByMonth[slot.date.slice(0, 7)] ||= {});
    (month[k] ||= { completed: 0, no_show: 0 }).completed += 1;
  } else if (outcome === 'NO_SHOW') {
    Object.assign(row, { status: 'NO_SHOW', expert_joined_at: iso(L.addMin(start, -2)), deposit_outcome: 'FORFEITED' });
    updated = L.addMin(start, 20);
    const month = (consultsByMonth[slot.date.slice(0, 7)] ||= {});
    (month[k] ||= { completed: 0, no_show: 0 }).no_show += 1;
  } else if (outcome === 'EXPERT_ABSENT') {
    Object.assign(row, { status: 'EXPERT_ABSENT', customer_joined_at: iso(start), deposit_outcome: 'REFUNDED', refund_ref: refundPaid({ source: 'CONSULTATION', sourceId: id, customerId: c.id, amount: CONSULT_FEE, at: L.addMin(start, 60 * 26), staffId: S.C1.id, account: accountOf(c.name) }), refunded_by: S.C1.id, refunded_at: iso(L.addMin(start, 60 * 26)) });
    updated = L.addMin(start, 60 * 26);
  }
  const recommend = row.recommendCredit;
  delete row.recommendCredit;
  const saved = add('booking', 'Consultations', stamp(row, bookedAt, updated));
  // Chuyên gia khuyên đi khám: lần khám sau khách được áp voucher nội bộ ưu đãi sau tư vấn
  if (recommend) consultCredits.push({ customer: c, consult: saved, at: new Date(updated), used: false });
  return { row: saved, date: slot.date, start };
};

// ===================== Mua hàng online =====================
const promoId = L.uuid();
let promoUsed = 0;
const addressOf = new Map();
const addressFor = (c) => {
  if (addressOf.has(c)) return addressOf.get(c);
  const tanBinh = c.street[1].includes('Tân Bình');
  const a = { id: L.uuid(), customer_id: c.id, recipient_name: c.name, phone: c.phone, address: `${c.houseNo} ${c.street[0]}, ${c.street[1]}, TP. Hồ Chí Minh`, shipping_district_id: tanBinh ? 1455 : null, shipping_ward_code: tanBinh ? '21413' : null, is_default: true };
  add('commerce', 'UserAddresses', stamp(a, c.createdAt));
  addressOf.set(c, a);
  return a;
};
const ghnCode = () => `G${Array.from({ length: 7 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[L.int(0, 31)]).join('')}`;
const onlineOrder = (c, date, opt = {}) => {
  const items = (opt.items || L.shuffle(onlineProducts).slice(0, L.int(1, 3)).map(([key]) => ({ key, quantity: L.weighted([[1, 8], [2, 2]]) })));
  const a = addressFor(c);
  const id = L.uuid();
  let created = L.at(date, `${String(L.int(8, 22)).padStart(2, '0')}:${String(L.int(0, 59)).padStart(2, '0')}`);
  if (created > NOW) created = L.addMin(NOW, -L.int(5, 120));
  const subtotal = items.reduce((s, i) => s + PROD[i.key].price * i.quantity, 0);
  const usePromo = subtotal >= 300000 && L.chance(0.25);
  const discount = usePromo ? Math.min(Math.round(subtotal * 0.1), 50000) : 0;
  const shipping = L.pick([22000, 25000, 27000, 30500, 32000]);
  const vietqr = opt.vietqr ?? L.chance(0.4);
  const age = L.diffDays(date, TODAY);
  let status = opt.status || (age > 9 ? 'COMPLETED' : age > 4 ? L.pick(['COMPLETED', 'COMPLETED', 'SHIPPING']) : age > 1 ? L.pick(['SHIPPING', 'PROCESSING']) : age === 1 ? L.pick(['CONFIRMED', 'PROCESSING']) : (vietqr ? 'PAID' : 'UNPAID'));
  if (status === 'CONFIRMED' && !a.shipping_district_id) status = 'PROCESSING';
  const row = { id, customer_id: c.id, recipient_name: c.name, shipping_phone: c.phone, shipping_address: a.address, shipping_district_id: a.shipping_district_id, shipping_ward_code: a.shipping_ward_code, shipping_fee: shipping, note: L.pick(['', '', 'Giao giờ hành chính', 'Gọi trước khi giao']), total_amount: subtotal, discount_amount: discount, promotion_id: usePromo ? promoId : null, status, payment_method: vietqr ? 'VIETQR_SEPAY' : 'COD', tracking_code: ['PROCESSING', 'SHIPPING', 'COMPLETED'].includes(status) ? ghnCode() : null };
  let updated = created;
  if (vietqr && status !== 'UNPAID') {
    const paidAt = L.addMin(created, L.int(1, 8));
    bank({ amount: subtotal - discount + shipping, content: `${c.name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/Đ/g, 'D')} SP ${id.slice(0, 6)}`, code_type: 'ORDER', code: id.slice(0, 6), matched_id: id, customer_id: c.id, status: 'MATCHED' }, paidAt);
    updated = paidAt;
  }
  if (opt.cancel) {
    const at = L.addMin(created, 60 * L.int(2, 20));
    Object.assign(row, { status: 'CANCELLED', tracking_code: null, cancel_initiator: opt.cancel, cancel_reason: opt.cancel === 'CLINIC' ? 'Sản phẩm tạm hết hàng tại kho, phòng khám xin hủy đơn và hoàn tiền' : 'Đặt nhầm sản phẩm, muốn đặt lại đơn khác', cancelled_by: opt.cancel === 'CLINIC' ? S.S1.id : c.id, cancelled_at: iso(at) });
    if (opt.cancel === 'CLINIC' && vietqr) Object.assign(row, { refund_status: 'REFUNDED', refund_amount: subtotal - discount + shipping, refund_ref: refundPaid({ source: 'ORDER', sourceId: id, customerId: c.id, amount: subtotal - discount + shipping, at: L.addMin(at, 180), staffId: S.S1.id, account: accountOf(c.name) }), refunded_at: iso(L.addMin(at, 180)), refunded_by: S.S1.id });
    updated = at;
  } else if (status === 'COMPLETED') updated = L.addMin(created, 60 * 24 * L.int(2, 4));
  if (usePromo && row.status !== 'CANCELLED') { promoUsed += 1; add('commerce', 'PromotionUsages', stamp({ id: L.uuid(), customer_id: c.id, promotion_id: promoId }, created)); }
  add('commerce', 'Orders', stamp(row, created, updated));
  const details = items.map((i) => add('commerce', 'OrderDetails', stamp({ id: L.uuid(), order_id: id, product_id: PROD[i.key].id, quantity: i.quantity, price: PROD[i.key].price, weight: PROD[i.key].weight }, created)));
  if (row.status === 'COMPLETED' && L.chance(0.45)) {
    const it = items[0];
    add('commerce', 'Reviews', stamp({ id: L.uuid(), customer_id: c.id, order_id: id, product_id: PROD[it.key].id, customer_name: c.name, rating: L.weighted([[5, 6], [4, 3], [3, 1]]), comment: L.pick(D.PRODUCT_COMMENTS), images: [], status: 'VISIBLE' }, L.addMin(new Date(updated), 60 * 30)));
  }
  return { row, details, items, created, updated };
};
const returnFor = (o, status, c) => {
  const detail = o.details[0];
  const it = o.items[0];
  const goods = PROD[it.key].price * it.quantity;
  const isFull = o.items.length === 1;
  const share = o.row.total_amount ? Math.round(o.row.discount_amount * goods / o.row.total_amount) : 0;
  const refund = goods - share + (isFull ? o.row.shipping_fee : 0);
  const reqAt = L.addMin(new Date(o.updated), 60 * 24 * 2);
  const row = { id: L.uuid(), order_id: o.row.id, customer_id: c.id, items: [{ name: PROD[it.key].name, price: PROD[it.key].price, weight: PROD[it.key].weight, quantity: it.quantity, product_id: PROD[it.key].id, order_detail_id: detail.id }], reason: status === 'REJECTED' ? 'DEFECTIVE' : 'DAMAGED', description: status === 'REJECTED' ? 'Dùng thử 1 tuần thấy không hợp, muốn trả lại sản phẩm.' : 'Hộp bị móp, nắp chai bị nứt và chảy sản phẩm ra ngoài khi nhận hàng.', images: [], bank_name: 'Vietcombank', bank_account: `10${L.int(10000000, 99999999)}`, bank_holder: c.name.toUpperCase(), refund_amount: refund, status, handled_by: status === 'PENDING' ? null : S.S1.id };
  let updated = reqAt;
  if (status === 'REFUNDED') {
    const approved = L.addMin(reqAt, 180); const received = L.addMin(reqAt, 60 * 24 * 3); const refunded = L.addMin(received, 120);
    Object.assign(row, { tracking_code: ghnCode(), ghn_status: 'delivered', approved_at: iso(approved), received_at: iso(received), refunded_at: iso(refunded), refund_ref: refundPaid({ source: 'RETURN', sourceId: row.id, customerId: c.id, amount: row.refund_amount, at: refunded, staffId: S.S1.id, account: `${row.bank_name} - ${row.bank_account} - ${row.bank_holder}` }), restocked: false });
    updated = refunded;
  } else if (status === 'REJECTED') { row.reject_reason = 'Sản phẩm đã qua sử dụng, không thuộc trường hợp lỗi do nhà sản xuất hoặc vận chuyển theo chính sách đổi trả.'; updated = L.addMin(reqAt, 240); }
  add('commerce', 'OrderReturns', stamp(row, reqAt, updated));
};

// ===================== Mô phỏng hành trình khách =====================
const SCENARIOS = ['ACNE', 'ACNE', 'MELASMA', 'BARRIER', 'ONLINE', 'CONSULT', 'SHOPPER', 'ACNE', 'MELASMA', 'ONLINE', 'BARRIER', 'CONSULT'];
customers.forEach((c, i) => {
  const scenario = SCENARIOS[i % SCENARIOS.length];
  const firstDay = L.addDays(START, L.int(2, 70));
  if (scenario === 'SHOPPER') {
    for (let d = firstDay; d < TODAY; d = L.addDays(d, L.int(12, 30))) onlineOrder(c, d);
    if (L.chance(0.5)) consult(c, L.addDays(firstDay, 5), L.pick(['COSMETICS', 'NUTRITION']), 'COMPLETED');
    return;
  }
  if (scenario === 'CONSULT') {
    const r = consult(c, firstDay, 'COSMETICS', 'COMPLETED');
    const examDay = r ? L.addDays(r.date, L.int(2, 9)) : firstDay;
    if (examDay < TODAY) exam(c, c.self, examDay, 'ACNE');
    if (L.chance(0.5)) onlineOrder(c, L.addDays(examDay, L.int(10, 25)) < TODAY ? L.addDays(examDay, L.int(10, 25)) : L.addDays(TODAY, -1));
    return;
  }
  if (scenario === 'ONLINE') {
    const cond = L.pick(['ACNE', 'BARRIER', 'MELASMA']);
    exam(c, c.self, firstDay, cond, { online: true });
    const items = D.CONDITIONS[cond].products.filter((k) => PROD[k] && !PROD[k].prescription).slice(0, 2).map((key) => ({ key, quantity: 1 }));
    onlineOrder(c, L.addDays(firstDay, 1), { items, vietqr: true });
    if (L.chance(0.5)) onlineOrder(c, L.addDays(firstDay, L.int(30, 50)) < TODAY ? L.addDays(firstDay, L.int(30, 50)) : L.addDays(TODAY, -2));
    return;
  }
  exam(c, c.self, firstDay, scenario, { packageChance: 0.5 });
  if (L.chance(0.35)) onlineOrder(c, L.addDays(firstDay, L.int(14, 40)) < TODAY ? L.addDays(firstDay, L.int(14, 40)) : L.addDays(TODAY, -3));
  // Người thân được đặt lịch hộ
  for (const rel of c.profiles.filter((p) => p !== c.self)) exam(c, rel, L.addDays(firstDay, L.int(3, 15)) < TODAY ? L.addDays(firstDay, L.int(3, 15)) : L.addDays(TODAY, -1), rel.relationship === 'Mẹ' ? 'MELASMA' : 'ACNE', { packageChance: 0.3 });
});

// Tái khám theo hẹn: đã qua thì đã khám, sắp tới thì đã đặt hoặc chờ CSKH gọi
for (const f of [...followUps]) {
  if (f.date < TODAY) { if (L.chance(0.8)) exam(f.customer, f.profile, f.date, f.cond, { type: 'FOLLOW_UP', preferDoctor: f.doctorK, packageChance: 0 }); }
  else if (f.date > L.addDays(TODAY, 3) && L.chance(0.6)) exam(f.customer, f.profile, f.date, f.cond, { type: 'FOLLOW_UP', preferDoctor: f.doctorK, outcome: 'UPCOMING' });
}

// Tình huống phát sinh trong quá khứ
const pastDay = (a, b) => L.addDays(TODAY, -L.int(a, b));
// Hủy / không đến chỉ có ý nghĩa với khách mới (đã đặt cọc): chọn khách chưa từng khám
const fresh = customers.filter((c) => !served.has(c.self.id));
const freshAt = (n) => fresh[n % fresh.length];
exam(freshAt(0), freshAt(0).self, pastDay(20, 40), 'ACNE', { outcome: 'CANCELLED_CUSTOMER' });
exam(freshAt(1), freshAt(1).self, pastDay(8, 25), 'MELASMA', { outcome: 'NO_SHOW' });
exam(freshAt(2), freshAt(2).self, pastDay(30, 60), 'ACNE', { outcome: 'CANCELLED_CLINIC' });
exam(freshAt(3), freshAt(3).self, pastDay(1, 2), 'BARRIER', { outcome: 'CANCELLED_CLINIC' }); // còn chờ hoàn cọc
exam(freshAt(4), freshAt(4).self, pastDay(10, 30), 'ACNE', { outcome: 'NO_SHOW' });
exam(customers[12], customers[12].self, pastDay(5, 15), 'ACNE', { outcome: 'COMPLETED', rescheduled: true });
for (const idx of [5, 17]) exam(customers[idx], customers[idx].self, pastDay(3, 30), 'ACNE', { outcome: 'WALK_IN_DONE' }); // khách đến thẳng, không đặt trước

// Hôm nay
const todayCustomers = L.shuffle(customers.filter((c) => !served.has(c.self.id))).concat(L.shuffle(customers));
let tc = 0;
const nextC = () => todayCustomers[tc++ % todayCustomers.length];
for (let n = 0; n < 4; n += 1) { const c = nextC(); exam(c, c.self, TODAY, L.pick(['ACNE', 'MELASMA', 'BARRIER']), { outcome: 'UPCOMING' }); }
{ const c = nextC(); exam(c, c.self, TODAY, 'ACNE', { outcome: 'TODAY_WAITING' }); }
{ const c = nextC(); exam(c, c.self, TODAY, 'ACNE', { outcome: 'TODAY_SALE' }); }
for (let n = 0; n < 2; n += 1) { const c = nextC(); exam(c, c.self, TODAY, 'ACNE', { outcome: 'WALK_IN_WAITING' }); }
// Ba ngày tới: lịch cần gọi nhắc
for (let d = 1; d <= 3; d += 1) for (let n = 0; n < 3; n += 1) { const c = nextC(); exam(c, c.self, L.addDays(TODAY, d), L.pick(['ACNE', 'MELASMA', 'BARRIER']), { outcome: 'UPCOMING', online: n === 2 }); }
// Bác sĩ xin nghỉ đột xuất ngày kia: khách cần đổi lịch
{
  const day = nextWorkDay(L.addDays(TODAY, 2), ['D2']);
  const c = nextC();
  const apt = exam(c, c.self, day, 'MELASMA', { outcome: 'NEEDS_RESCHEDULE', preferDoctor: 'D2' });
  if (apt) {
    add('booking', 'ShiftRequests', stamp({ id: L.uuid(), employee_id: apt.doctor_id, reason: `Nghỉ đột xuất ngày ${day} do phải hội chẩn tại bệnh viện`, status: 'APPROVED', approved_by: S.MG.id, from_shift_id: null }, L.at(TODAY, '08:30'), L.at(TODAY, '09:15')));
    // Quản lý duyệt nghỉ => ca đó bị xóa, khách trong ca chuyển sang chờ đổi lịch
    const type = apt.appointment_time < '12:30' ? 'MORNING' : 'AFTERNOON';
    P.booking.WorkShifts = P.booking.WorkShifts.filter((s) => !(s.employee_id === apt.doctor_id && s.date === day && s.shift_type === type));
    const [from, to] = type === 'MORNING' ? ['08:00', '12:00'] : ['13:00', '17:00'];
    for (const a of P.booking.Appointments) {
      if (a.doctor_id === apt.doctor_id && a.appointment_date === day && a.appointment_time.slice(0, 5) >= from && a.appointment_time.slice(0, 5) < to && ['PENDING', 'CONFIRMED'].includes(a.status)) a.status = 'NEEDS_RESCHEDULE';
    }
    shiftsByDate[day] = shiftsByDate[day].filter((s) => !(s.employee_id === apt.doctor_id && s.shift_type === type));
  }
}
// Lịch tuần sau
for (let d = 4; d <= 12; d += 1) if (L.chance(0.7)) { const c = nextC(); exam(c, c.self, L.addDays(TODAY, d), L.pick(['ACNE', 'MELASMA', 'BARRIER']), { outcome: 'UPCOMING' }); }

// Tư vấn: lỡ hẹn, chuyên gia vắng, sắp tới
consult(customers[30], pastDay(20, 40), 'NUTRITION', 'NO_SHOW');
consult(customers[31], pastDay(15, 30), 'COSMETICS', 'EXPERT_ABSENT');
for (const c of customers.slice(32, 36)) consult(c, pastDay(5, 60), L.pick(['COSMETICS', 'NUTRITION']), 'COMPLETED');
for (const c of customers.slice(0, 4)) consult(c, L.addDays(TODAY, L.int(1, 8)), L.pick(['COSMETICS', 'NUTRITION']), 'UPCOMING');

// Đơn hàng: hủy, hoàn trả, đơn đang chờ xử lý hôm nay
const shoppers = customers.filter((_, i) => SCENARIOS[i % SCENARIOS.length] === 'SHOPPER');
onlineOrder(customers[6], pastDay(20, 30), { cancel: 'CUSTOMER' });
onlineOrder(customers[13], pastDay(12, 20), { cancel: 'CLINIC', vietqr: true });
const r1 = onlineOrder(shoppers[0], pastDay(25, 35), { status: 'COMPLETED' });
returnFor(r1, 'REFUNDED', shoppers[0]);
const r2 = onlineOrder(shoppers[1], pastDay(15, 22), { status: 'COMPLETED' });
returnFor(r2, 'REJECTED', shoppers[1]);
const r3 = onlineOrder(customers[10], pastDay(4, 6), { status: 'COMPLETED' });
returnFor(r3, 'PENDING', customers[10]);
onlineOrder(customers[24], TODAY, { vietqr: false });
onlineOrder(customers[25], TODAY, { vietqr: true });
const tanBinh = customers.find((c) => c.street[1].includes('Tân Bình'));
if (tanBinh) onlineOrder(tanBinh, L.addDays(TODAY, -1), { status: 'CONFIRMED' });

// Khuyến mãi mới
add('commerce', 'Promotions', stamp({ id: AFTER_CONSULT.id, code: AFTER_CONSULT.code, discount_type: 'PERCENTAGE', discount_value: AFTER_CONSULT.discount_value, max_discount: AFTER_CONSULT.max_discount, min_order_value: 0, usage_limit: null, used_count: AFTER_CONSULT.used_count, start_date: iso(`${START}T00:00:00+07:00`), end_date: iso(`${L.addDays(TODAY, 180)}T23:59:59+07:00`), image_url: null, applicable_scope: 'ALL', status: 'ACTIVE', visibility: 'INTERNAL' }, new Date(`${L.addDays(START, -1)}T09:00:00+07:00`)));
add('commerce', 'Promotions', stamp({ id: promoId, code: 'GLOWSKIN10', discount_type: 'PERCENTAGE', discount_value: 10, max_discount: 50000, min_order_value: 300000, usage_limit: 500, used_count: promoUsed, start_date: iso(`${START}T00:00:00+07:00`), end_date: iso(`${L.addDays(TODAY, 60)}T23:59:59+07:00`), image_url: null, applicable_scope: 'PRODUCT', status: 'ACTIVE' }, new Date(`${L.addDays(START, -1)}T09:00:00+07:00`)));

// ===================== Thù lao chuyên gia các tháng đã qua =====================
for (const [month, byK] of Object.entries(consultsByMonth)) {
  if (month >= TODAY.slice(0, 7)) continue;
  const [y, m] = month.split('-').map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  for (const [k, { completed, no_show }] of Object.entries(byK)) {
    if (!completed) continue;
    const closed = new Date(`${next}-02T10:00:00+07:00`); const paid = new Date(`${next}-05T15:00:00+07:00`);
    add('booking', 'ExpertPayouts', stamp({ id: L.uuid(), month, expert_id: S[k].id, expert_name: S[k].name, completed, no_show, session_fee: fee[k], amount: completed * fee[k], status: 'PAID', closed_by: S.MG.id, paid_ref: `LUONGCG${month.replace('-', '')}${k}`, paid_at: iso(paid), paid_by: S.MG.id }, closed, paid));
  }
}

// ===================== Gọi chăm sóc khách =====================
const recent = examsDone.filter((e) => e.date < TODAY && L.diffDays(e.date, TODAY) <= 14);
for (const e of recent.slice(0, Math.floor(recent.length / 2))) {
  const C = staffOn(L.addDays(e.date, 3), ['C1', 'C2'], 'C1');
  const at = L.at(L.addDays(e.date, 3), '10:15');
  if (at > new Date()) continue;
  const skin = L.weighted([['BETTER', 5], ['MUCH_BETTER', 2], ['SAME', 2], ['WORSE', 1]]);
  add('booking', 'FollowUpLogs', stamp({ id: L.uuid(), customer_id: e.c.id, appointment_id: e.apt.id, consultant_id: C.id, patient_profile_id: e.profile.id, call_type: 'AFTERCARE', outcome: 'ANSWERED', call_status: skin === 'WORSE' ? 'COMPLAINT' : 'SUCCESS', scheduled_for: `${e.apt.appointment_date} ${e.apt.appointment_time.slice(0, 5)}`, call_note: skin === 'WORSE' ? 'Da hơi đỏ và khô sau 3 ngày bôi thuốc, đã dặn giảm tần suất còn cách ngày và hẹn bác sĩ gọi lại.' : 'Khách phản hồi da dịu, đang dùng thuốc đúng hướng dẫn.', aftercare: { skin_status: skin, adherence: L.weighted([['FULL', 7], ['PARTIAL', 3]]), satisfaction: skin === 'WORSE' ? 3 : L.pick([4, 5, 5]), symptoms: skin === 'WORSE' ? ['Đỏ rát', 'Khô căng'] : [], complaint: false } }, at));
}

// Gọi nhắc lịch trước ngày khám (khách đã xác nhận đến được)
for (const e of examsDone.filter((x) => !x.online && x.apt.type === 'NEW_EXAM' && L.diffDays(x.date, TODAY) <= 45 && L.chance(0.5))) {
  const callDay = L.addDays(e.date, -1);
  const C = staffOn(callDay, ['C1', 'C2'], 'C1');
  const at = L.at(callDay, L.pick(['09:20', '10:40', '14:15', '15:30']));
  if (at < new Date(e.apt.createdAt || 0)) continue;
  add('booking', 'FollowUpLogs', stamp({ id: L.uuid(), customer_id: e.c.id, appointment_id: e.apt.id, consultant_id: C.id, patient_profile_id: e.profile.id, call_type: 'REMINDER', outcome: 'CAN_COME', call_status: 'SUCCESS', scheduled_for: `${e.apt.appointment_date} ${e.apt.appointment_time.slice(0, 5)}`, call_note: 'Khách xác nhận đến đúng giờ, đã dặn mang theo các sản phẩm đang dùng.' }, at));
}

// ===================== Nội dung website =====================
const authorOf = (k) => (k ? { id: S[k].id, name: S[k].name, title: k === 'D3' ? 'BS.CKI Da liễu' : 'BS Da liễu' } : { id: S.MG.id, name: 'Ban biên tập GlowSkin', title: null });
D.ARTICLES.forEach((a, i) => {
  const au = authorOf(a.author);
  const at = new Date(`${L.addDays(START, 10 + i * 18)}T08:00:00+07:00`);
  add('media', 'Articles', stamp({ id: L.uuid(), title: a.title, slug: `${slug(a.title).join('-').slice(0, 70)}-${(i + 11).toString(36)}`, summary: a.summary, content: a.content, thumbnail_url: null, category: { KNOWLEDGE: 'Kiến thức da liễu', SKINCARE: 'Chăm sóc da', EVENT: 'Sự kiện' }[a.type], author_id: au.id, author_name: au.name, author_title: au.title, status: 'PUBLISHED', published_at: iso(at), article_type: a.type, tags: a.tags, sources: a.sources, is_featured: i === 0, view_count: L.int(80, 900), updated_by: S.MG.id }, at));
});
{
  const s = D.PENDING_SUBMISSION; const au = authorOf(s.author);
  const at = L.at(L.addDays(TODAY, -2), '21:10');
  add('media', 'ArticleSubmissions', stamp({ id: L.uuid(), author_id: au.id, author_name: au.name, author_title: au.title, title: s.title, summary: s.summary, content: s.content, article_type: s.type, category: 'Nghiên cứu', tags: s.tags, sources: s.sources, status: 'PENDING', version: 1, submitted_at: iso(at) }, at));
}

// ===================== Tồn kho vật tư sau khi dùng =====================
for (const m of Object.values(MAT)) {
  const left = m.lots.reduce((s, l) => s + l.left, 0);
  P.commerce.Products.find((p) => p.id === m.id).stock_quantity = left;
  for (const lot of m.lots) P.commerce.MaterialLots.find((l) => l.id === lot.id).quantity_left = lot.left;
}
// Vật tư sắp hết => hệ thống tự tạo đề xuất nhập, chờ quản lý duyệt
const stockOf = (m) => m.lots.reduce((s, l) => s + l.left, 0);
// Vật tư dưới hoặc sát mức tối thiểu (dưới 1,5 lần): luôn có ít nhất 1 đề xuất chờ quản lý duyệt
const byRatio = Object.entries(MAT).sort(([, a], [, b]) => stockOf(a) / a.min_stock - stockOf(b) / b.min_stock);
const lowMats = byRatio.filter(([, m]) => stockOf(m) <= m.min_stock * 1.5);
if (!lowMats.length) lowMats.push(byRatio[0]);
if (lowMats.length) purchase(lowMats.map(([k, m]) => [k, Math.ceil((m.min_stock * 2) / m.pack_size)]), L.at(L.addDays(TODAY, -1), '17:30'), { status: 'PENDING', received: false, ordered: false, reason: 'Tồn kho sắp chạm mức tối thiểu, đề xuất nhập bổ sung cho tháng tới', lotTag: 'L-NEW' });

// ===================== Đối soát: giao dịch cần xử lý tay =====================
bank({ amount: 200000, content: 'CHUYEN TIEN COC KHAM DA', code_type: 'NONE', code: null, matched_id: null, status: 'UNMATCHED', reason: 'Nội dung chuyển khoản không có mã đơn' }, L.at(L.addDays(TODAY, -1), '19:42'));
bank({ amount: 150000, content: 'NGUYEN VAN HAI chuyen tien O2O 9f2c1a', code_type: 'APPOINTMENT', code: '9f2c1a', matched_id: null, status: 'UNMATCHED', reason: 'Không còn lịch chờ thanh toán (giữ chỗ đã hết hạn)' }, L.at(L.addDays(TODAY, -3), '21:05'));

// ===================== Kiểm tra trước khi ghi =====================
const problems = [];
const slotSeen = new Set();
for (const a of P.booking.Appointments) {
  if (a.source === 'WALK_IN' || ['CANCELLED', 'NO_SHOW', 'NEEDS_RESCHEDULE'].includes(a.status)) continue;
  const k = `${a.doctor_id}|${a.appointment_date}|${a.appointment_time.slice(0, 5)}`;
  if (slotSeen.has(k)) problems.push(`Trùng giờ khám ${k}`);
  slotSeen.add(k);
  const shift = (shiftsByDate[a.appointment_date] || []).find((s) => s.employee_id === a.doctor_id && (EXAM_SLOTS[s.shift_type] || []).includes(a.appointment_time.slice(0, 5)));
  if (!shift) problems.push(`Lịch ${a.id} không nằm trong ca bác sĩ`);
}
for (const inv of P.booking.Invoices) {
  const paid = P.booking.Transactions.filter((t) => t.invoice_id === inv.id).reduce((s, t) => s + (t.transaction_type === 'INCOME' ? Number(t.amount) : 0), 0);
  const credit = inv.breakdown?.consult_credit || 0;
  if (inv.breakdown && paid + credit !== inv.breakdown.total) problems.push(`Hóa đơn ${inv.id}: thu ${paid} + cọc tư vấn ${credit} khác tổng ${inv.breakdown.total}`);
}
for (const m of Object.values(MAT)) if (m.lots.some((l) => l.left < 0)) problems.push(`Lô ${m.name} âm`);
if (problems.length) { console.error('KẾ HOẠCH CÓ LỖI:'); problems.slice(0, 20).forEach((p) => console.error(' - ' + p)); process.exit(1); }

// Bỏ trường nội bộ
for (const c of P.booking.Consultations || []) delete c.slotDate;
const out = path.join(__dirname, 'output', `plan-${TARGET}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
// Khoản hoàn gần nhất: nhân viên đã ghi "đã hoàn" nhưng ngân hàng chưa báo tiền ra => quản lý cần đối chiếu
{
  const claims = P.booking.RefundClaims || [];
  const last = claims.reduce((a, b) => (!a || b.claimed_at > a.claimed_at ? b : a), null);
  if (last) {
    P.booking.BankTransactions = P.booking.BankTransactions.filter((t) => t.id !== last.bank_tx_id);
    Object.assign(last, { status: 'WAITING', verified_method: null, verified_at: null, bank_tx_id: null });
  }
}
fs.writeFileSync(out, JSON.stringify({ target: TARGET, today: TODAY, start: START, password: D.PASSWORD, plan: P }, null, 0));
const summary = Object.fromEntries(Object.entries(P).map(([svc, tables]) => [svc, Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]))]));
console.log(JSON.stringify({ today: TODAY, start: START, summary }, null, 1));
