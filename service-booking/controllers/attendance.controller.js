const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  sequelize, WorkShift, AttendanceKiosk, AttendanceQr, AttendanceRecord, AttendanceExplanation, AttendanceCheckoutRequest, Payroll,
} = require('../models');
const { getSecret } = require('../middlewares/auth.middleware');
const {
  SHIFT_HOURS, ACTIVE_SHIFTS, RULES, MANAGER_ROLES, EXPLANATION_REASONS, EARLY_LEAVE_REASONS,
  vnToday, shiftTimes, kioskWindow, nextWindow, minutesLate, minutesEarly,
} = require('../utils/attendanceRules');
const { violationsOf, unsettledReason, summarizeViolations } = require('../utils/attendanceViolations');

// Luồng chấm công:
// 1. Máy tại quầy bấm "Chấm công" => QR ngẫu nhiên (20 giây, 1 lần). Mở trong khung vào ca (20' trước -> 10' sau giờ vào),
//    khung ra ca (giờ kết thúc -> 30' sau) và trong ca (chỉ người đã gửi đơn xin về sớm quét được).
// 2. Nhân viên quét QR => server tự biết là vào ca hay ra ca => vé tạm 2 phút để chụp ảnh khuôn mặt.
// 3. Lỡ khung vào ca => giải trình. Về sớm => đơn xin về sớm. Quên chấm ra ca => giải trình ra ca. Quản lý duyệt / từ chối.
// 4. Hết hạn mà không chấm / không giải trình => hệ thống tự ghi vắng / thiếu ra ca.
// 5. Tháng đã khóa bảng lương => không thay đổi được công của tháng đó.

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const text = (v) => String(v ?? '').trim();
const HTTPS = /^https:\/\/[^\s"'<>]{1,490}$/;
const fmtTime = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const httpError = (status, message) => Object.assign(new Error(message), { status });

// Tháng đã khóa bảng lương => không cho đổi công
const assertMonthOpen = async (date) => {
  const locked = await Payroll.findOne({ where: { month: String(date).slice(0, 7), status: 'LOCKED' } });
  if (locked) throw httpError(400, `Bảng lương tháng ${String(date).slice(5, 7)}/${String(date).slice(0, 4)} đã khóa, không thể thay đổi chấm công`);
};

const checkDescription = (description, minChars, minWords) => {
  const words = description.split(/\s+/).filter(Boolean);
  if (description.length < minChars || words.length < minWords) throw httpError(400, `Mô tả cần ít nhất ${minChars} ký tự và ${minWords} từ: nêu rõ chuyện gì, lúc nào, ở đâu`);
  if (description.length > 2000) throw httpError(400, 'Mô tả tối đa 2.000 ký tự');
  if (new Set(words.map((w) => w.toLowerCase())).size < Math.min(8, minWords)) throw httpError(400, 'Mô tả lặp từ quá nhiều, vui lòng viết rõ ràng');
};
const checkEvidence = (urls) => {
  const list = (Array.isArray(urls) ? urls : []).map(text).filter(Boolean);
  if (list.length > 5 || list.some((u) => !HTTPS.test(u))) throw httpError(400, 'Tối đa 5 ảnh minh chứng hợp lệ');
  return list;
};

// ---------- Máy chấm công ----------

// Header "Authorization: Kiosk <token>" (khác token đăng nhập của nhân viên)
const kioskAuth = async (req, res, next) => {
  const [scheme, token] = String(req.header('Authorization') || '').split(' ');
  if (scheme !== 'Kiosk' || !token) return res.status(401).json({ message: 'Thiết bị chưa được kích hoạt làm máy chấm công' });
  const kiosk = await AttendanceKiosk.findOne({ where: { token_hash: sha256(token), is_active: true } });
  if (!kiosk) return res.status(401).json({ message: 'Máy chấm công không hợp lệ hoặc đã bị vô hiệu hóa' });
  req.kiosk = kiosk;
  kiosk.update({ last_seen_at: new Date() }).catch(() => {});
  next();
};

const createKiosk = async (req, res) => {
  const name = text(req.body.name);
  if (!name || name.length > 100) return res.status(400).json({ message: 'Tên máy chấm công từ 1 đến 100 ký tự' });
  const token = crypto.randomBytes(32).toString('base64url');
  const kiosk = await AttendanceKiosk.create({ name, token_hash: sha256(token), created_by: req.user.id });
  res.status(201).json({ message: 'Đã kích hoạt máy chấm công', data: { id: kiosk.id, name: kiosk.name, token } });
};

const listKiosks = async (req, res) => {
  const rows = await AttendanceKiosk.findAll({ attributes: { exclude: ['token_hash'] }, order: [['createdAt', 'DESC']] });
  res.json({ data: rows });
};

const updateKiosk = async (req, res) => {
  const kiosk = await AttendanceKiosk.findByPk(req.params.id);
  if (!kiosk) return res.status(404).json({ message: 'Không tìm thấy máy chấm công' });
  await kiosk.update({ is_active: !!req.body.is_active });
  res.json({ message: req.body.is_active ? 'Đã bật lại máy chấm công' : 'Đã vô hiệu hóa máy chấm công' });
};

const windowInfo = (w) => w && ({
  date: w.date, shift_type: w.shift_type, kind: w.kind, label: SHIFT_HOURS[w.shift_type].label,
  open_at: w.kind === 'OUT' ? w.checkoutOpenAt : w.openAt, until: w.until, start: w.start, end: w.end,
});

// [KIOSK] GET /attendance/kiosk/status
const kioskStatus = async (req, res) => {
  const now = new Date();
  res.json({ data: { name: req.kiosk.name, now, window: windowInfo(kioskWindow(now)), next: windowInfo(nextWindow(now)), qr_ttl: RULES.QR_TTL_SEC } });
};

// [KIOSK] POST /attendance/kiosk/qr — tạo mã QR mới (không trùng mã nào trước đó)
const createQr = async (req, res) => {
  const now = new Date();
  const w = kioskWindow(now);
  if (!w) {
    const next = nextWindow(now);
    return res.status(400).json({ message: `Ngoài giờ chấm công. Mở lại lúc ${fmtTime(next.openAt)} (${SHIFT_HOURS[next.shift_type].label})` });
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const qr = await AttendanceQr.create({
        code: crypto.randomBytes(24).toString('base64url'), // 192 bit ngẫu nhiên + cột unique => không trùng
        kiosk_id: req.kiosk.id,
        shift_date: w.date,
        shift_type: w.shift_type,
        expires_at: new Date(now.getTime() + RULES.QR_TTL_SEC * 1000),
      });
      return res.status(201).json({ data: { id: qr.id, code: qr.code, expires_at: qr.expires_at, ttl: RULES.QR_TTL_SEC, kind: w.kind } });
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    }
  }
  res.status(500).json({ message: 'Không tạo được mã QR, vui lòng bấm lại' });
};

// [KIOSK] GET /attendance/kiosk/qr/:id — để máy quầy đóng QR ngay khi đã có người quét
const qrState = async (req, res) => {
  const qr = await AttendanceQr.findOne({ where: { id: req.params.id, kiosk_id: req.kiosk.id } });
  if (!qr) return res.status(404).json({ message: 'Không tìm thấy mã QR' });
  res.json({ data: { used: !!qr.used_by, expired: qr.expires_at <= new Date() } });
};

// ---------- Trạng thái ca ----------

const INCLUDE = [{ model: AttendanceRecord }, { model: AttendanceExplanation }, { model: AttendanceCheckoutRequest }];

// Trạng thái vào / ra ca để giao diện biết hiện nút gì
const shiftView = (shift, now = new Date()) => {
  const t = shiftTimes(shift.date, shift.shift_type);
  const record = shift.AttendanceRecord ? shift.AttendanceRecord.toJSON() : null;
  const explanation = shift.AttendanceExplanation || null;
  const request = shift.AttendanceCheckoutRequest || null;

  let phase; // vào ca
  if (record) phase = record.status === 'ABSENT' ? 'ABSENT' : 'CHECKED_IN';
  else if (explanation) phase = 'EXPLANATION_PENDING';
  else if (now < t.openAt) phase = 'UPCOMING';
  else if (now <= t.closeAt) phase = 'OPEN';
  else if (now <= t.explainUntil) phase = 'NEED_EXPLANATION';
  else phase = 'EXPIRED';

  let checkout = null; // ra ca (chỉ khi đã vào ca)
  if (record && record.status !== 'ABSENT') {
    if (record.checkout_status) checkout = 'DONE';
    else if (request?.kind === 'EARLY_LEAVE') checkout = now <= t.checkoutCloseAt ? 'EARLY_LEAVE_READY' : 'DONE';
    else if (request?.kind === 'FORGOT') checkout = 'REQUEST_PENDING';
    else if (now < t.checkoutOpenAt) checkout = 'WORKING';
    else if (now <= t.checkoutCloseAt) checkout = 'OPEN';
    else if (now <= t.explainUntil) checkout = 'NEED_EXPLANATION';
    else checkout = 'MISSING';
  }

  const view = {
    id: shift.id, employee_id: shift.employee_id, date: shift.date, shift_type: shift.shift_type, label: SHIFT_HOURS[shift.shift_type].label,
    start: t.start, end: t.end, open_at: t.openAt, close_at: t.closeAt,
    checkout_open_at: t.checkoutOpenAt, checkout_close_at: t.checkoutCloseAt, explain_until: t.explainUntil,
    phase, checkout, record, explanation, checkout_request: request,
  };
  view.violations = violationsOf(view);
  view.unsettled = unsettledReason(view);
  return view;
};

const shiftsWithAttendance = (where) => WorkShift.findAll({ where, include: INCLUDE, order: [['date', 'ASC']] });
const sortShifts = (list) => list.sort((a, b) => new Date(a.start) - new Date(b.start));

// Điều kiện lọc ca trong 1 tháng (cột DATEONLY không dùng LIKE được)
const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { [Op.between]: [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`] };
};
const parseMonth = (value) => (/^\d{4}-\d{2}$/.test(value || '') ? value : vnToday().slice(0, 7));

// ---------- Nhân viên ----------

// [STAFF] GET /attendance/me/today — ca hôm nay + ca hôm qua còn cần giải trình
const myToday = async (req, res) => {
  const now = new Date();
  const yesterday = vnToday(new Date(now.getTime() - 24 * 3600000));
  const shifts = await shiftsWithAttendance({ employee_id: req.user.id, date: { [Op.between]: [yesterday, vnToday(now)] } });
  const views = sortShifts(shifts.map((s) => shiftView(s, now))).filter((v) => v.date === vnToday(now)
    || ['NEED_EXPLANATION', 'EXPLANATION_PENDING'].includes(v.phase) || ['NEED_EXPLANATION', 'REQUEST_PENDING'].includes(v.checkout));
  res.json({ data: views, now, rules: RULES, reasons: EXPLANATION_REASONS, early_reasons: EARLY_LEAVE_REASONS });
};

// [STAFF] GET /attendance/me?month=YYYY-MM
const myMonth = async (req, res) => {
  const month = parseMonth(req.query.month);
  const shifts = sortShifts((await shiftsWithAttendance({ employee_id: req.user.id, date: monthRange(month) })).map((s) => shiftView(s)));
  res.json({ data: shifts, month, summary: summarizeViolations(shifts), reasons: EXPLANATION_REASONS, early_reasons: EARLY_LEAVE_REASONS });
};

// Ca nào của nhân viên đang quét được lúc này (ra ca được ưu tiên trước vào ca)
const findScanTarget = (views, now) => {
  // Ra ca: trong khung QR ra ca, hoặc đã gửi đơn xin về sớm (quét được ngay, tới hết khung ra ca)
  const checkOut = views.find((v) => v.checkout === 'OPEN' || v.checkout === 'EARLY_LEAVE_READY');
  if (checkOut) return { view: checkOut, kind: 'OUT' };
  const checkIn = views.find((v) => v.phase === 'OPEN' && now <= v.close_at);
  if (checkIn) return { view: checkIn, kind: 'IN' };
  return null;
};

// [STAFF] POST /attendance/scan { code } — quét QR tại quầy
const scanQr = async (req, res) => {
  const code = text(req.body.code).replace(/^GLOWSKIN-ATT:/, '');
  if (!/^[\w-]{20,64}$/.test(code)) return res.status(400).json({ message: 'Mã QR không hợp lệ, hãy quét đúng mã trên máy chấm công' });
  const now = new Date();
  const qr = await AttendanceQr.findOne({ where: { code } });
  if (!qr) return res.status(400).json({ message: 'Mã QR không hợp lệ' });
  if (qr.used_by) return res.status(400).json({ message: 'Mã QR đã được dùng. Bấm "Chấm công" trên máy để lấy mã mới' });
  if (qr.expires_at <= now) return res.status(400).json({ message: 'Mã QR đã hết hạn. Bấm "Chấm công" trên máy để lấy mã mới' });
  if (qr.shift_date !== vnToday(now)) return res.status(400).json({ message: 'Mã QR không còn hiệu lực' });
  const kiosk = await AttendanceKiosk.findOne({ where: { id: qr.kiosk_id, is_active: true } });
  if (!kiosk) return res.status(400).json({ message: 'Máy chấm công đã bị vô hiệu hóa' });

  const shifts = await shiftsWithAttendance({ employee_id: req.user.id, date: vnToday(now), shift_type: ACTIVE_SHIFTS });
  const views = sortShifts(shifts.map((s) => shiftView(s, now)));
  const target = findScanTarget(views, now);
  if (!target) {
    const working = views.find((v) => v.checkout === 'WORKING');
    if (working) return res.status(400).json({ message: `Chưa tới giờ ra ${working.label} (${fmtTime(working.end)}). Nếu cần về sớm, hãy gửi đơn "Xin về sớm" trước` });
    return res.status(400).json({ message: views.length ? 'Không có ca nào đang mở chấm công cho bạn lúc này' : 'Hôm nay bạn không có ca làm' });
  }
  await assertMonthOpen(target.view.date);

  // Giữ mã cho đúng 1 người: chỉ cập nhật nếu chưa ai dùng và còn hạn
  const [count] = await AttendanceQr.update(
    { used_by: req.user.id, used_at: now },
    { where: { id: qr.id, used_by: null, expires_at: { [Op.gt]: now } } }
  );
  if (!count) return res.status(400).json({ message: 'Mã QR vừa được người khác dùng hoặc đã hết hạn' });

  const { view, kind } = target;
  const ticket = jwt.sign({ typ: 'attendance', kind, emp: req.user.id, shift_id: view.id, qr_id: qr.id }, getSecret(), { expiresIn: RULES.TICKET_TTL_SEC });
  res.json({
    message: kind === 'IN' ? 'Quét mã vào ca thành công, hãy chụp ảnh xác nhận' : 'Quét mã ra ca thành công, hãy chụp ảnh xác nhận',
    data: {
      ticket, kind, ticket_ttl: RULES.TICKET_TTL_SEC, scanned_at: now, label: view.label,
      minutes_late: kind === 'IN' ? minutesLate(view.start, now) : 0,
      minutes_early: kind === 'OUT' ? minutesEarly(view.end, now) : 0,
    },
  });
};

// [STAFF] POST /attendance/check-in { ticket, photo_url, face_count } — gửi ảnh để hoàn tất vào / ra ca
const checkIn = async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(text(req.body.ticket), getSecret());
  } catch {
    return res.status(400).json({ message: 'Đã quá 2 phút kể từ lúc quét mã. Vui lòng quét lại QR' });
  }
  if (payload.typ !== 'attendance' || payload.emp !== req.user.id) return res.status(403).json({ message: 'Vé chấm công không hợp lệ' });
  const photo = text(req.body.photo_url);
  if (!HTTPS.test(photo)) return res.status(400).json({ message: 'Thiếu ảnh xác nhận' });
  const faces = Number(req.body.face_count);
  if (faces !== 1) return res.status(400).json({ message: 'Ảnh phải có đúng 1 khuôn mặt (của bạn)' });

  const t = await sequelize.transaction();
  try {
    const [shift, qr] = await Promise.all([
      WorkShift.findByPk(payload.shift_id, { transaction: t, lock: t.LOCK.UPDATE }),
      AttendanceQr.findByPk(payload.qr_id, { transaction: t }),
    ]);
    if (!shift || !qr || qr.used_by !== req.user.id) throw httpError(400, 'Vé chấm công không hợp lệ');
    const times = shiftTimes(shift.date, shift.shift_type);

    if (payload.kind === 'OUT') {
      const record = await AttendanceRecord.findOne({ where: { shift_id: shift.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!record || record.status === 'ABSENT') throw httpError(400, 'Bạn chưa chấm vào ca này');
      if (record.checkout_status) throw httpError(400, 'Bạn đã chấm ra ca này rồi');
      const early = minutesEarly(times.end, qr.used_at);
      await record.update({
        check_out_at: qr.used_at, checkout_status: early > 0 ? 'EARLY' : 'ON_TIME', checkout_method: 'QR',
        checkout_photo_url: photo, checkout_face_count: faces, minutes_early: early,
      }, { transaction: t });
      await t.commit();
      return res.json({
        message: early > 0 ? `Đã chấm ra ca (về sớm ${early} phút, chờ quản lý duyệt đơn)` : 'Đã chấm ra ca, hẹn gặp lại!',
        data: { kind: 'OUT', time: qr.used_at },
      });
    }

    const late = minutesLate(times.start, qr.used_at);
    await AttendanceRecord.create({
      shift_id: shift.id, employee_id: req.user.id, shift_date: shift.date, shift_type: shift.shift_type,
      status: late > 0 ? 'LATE' : 'ON_TIME', check_in_at: qr.used_at, minutes_late: late,
      method: 'QR', photo_url: photo, face_count: faces, qr_id: qr.id, kiosk_id: qr.kiosk_id,
    }, { transaction: t });
    await shift.update({ status: 'ATTENDED' }, { transaction: t });
    await t.commit();
    res.status(201).json({ message: late > 0 ? `Chấm công vào ca thành công (trễ ${late} phút)` : 'Chấm công vào ca thành công, đúng giờ', data: { kind: 'IN', time: qr.used_at } });
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Bạn đã chấm vào ca này rồi' });
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [STAFF] POST /attendance/explanations — giải trình khi lỡ khung giờ quét QR vào ca
const createExplanation = async (req, res) => {
  try {
    const now = new Date();
    const shift = await WorkShift.findOne({ where: { id: req.body.shift_id, employee_id: req.user.id }, include: INCLUDE });
    if (!shift) return res.status(404).json({ message: 'Không tìm thấy ca làm của bạn' });
    await assertMonthOpen(shift.date);
    if (shift.AttendanceRecord) return res.status(400).json({ message: 'Ca này đã có kết quả chấm công' });
    if (shift.AttendanceExplanation) return res.status(400).json({ message: 'Mỗi ca chỉ được gửi giải trình 1 lần' });
    const t = shiftTimes(shift.date, shift.shift_type);
    if (now <= t.closeAt) return res.status(400).json({ message: 'Vẫn còn trong giờ quét QR, hãy chấm công tại máy ở quầy' });
    if (now > t.explainUntil) return res.status(400).json({ message: `Đã quá hạn giải trình (${RULES.EXPLAIN_DEADLINE_HOURS} giờ sau khi hết ca)` });

    const reasonType = text(req.body.reason_type);
    const reason = EXPLANATION_REASONS[reasonType];
    if (!reason) return res.status(400).json({ message: 'Vui lòng chọn lý do' });

    const arrival = new Date(req.body.arrival_time);
    if (Number.isNaN(arrival.getTime())) return res.status(400).json({ message: 'Vui lòng nhập giờ có mặt thực tế' });
    if (arrival < t.openAt || arrival > t.end) return res.status(400).json({ message: `Giờ có mặt phải trong khoảng ${fmtTime(t.openAt)} – ${fmtTime(t.end)}` });
    if (arrival > now) return res.status(400).json({ message: 'Giờ có mặt không được ở tương lai' });
    if (reasonType !== 'FORGOT' && reasonType !== 'SYSTEM_ERROR' && arrival <= t.closeAt) {
      return res.status(400).json({ message: 'Có mặt trước giờ đóng QR thì phải chấm công tại máy; nếu đã có mặt mà không chấm được, chọn lý do "quên chấm công" hoặc "lỗi hệ thống"' });
    }
    const description = text(req.body.description);
    checkDescription(description, 80, 15);
    const evidence = checkEvidence(req.body.evidence_urls);
    if (reason.evidence && !evidence.length) return res.status(400).json({ message: `Lý do "${reason.label}" bắt buộc có ảnh minh chứng` });
    const witness = text(req.body.witness_name);
    if (witness.length > 100) return res.status(400).json({ message: 'Tên người xác nhận tối đa 100 ký tự' });
    if (reason.witness && witness.length < 2) return res.status(400).json({ message: `Lý do "${reason.label}" bắt buộc ghi người xác nhận` });
    if (req.body.committed !== true) return res.status(400).json({ message: 'Bạn phải cam kết nội dung giải trình là đúng sự thật' });

    const explanation = await AttendanceExplanation.create({
      shift_id: shift.id, employee_id: req.user.id, shift_date: shift.date, shift_type: shift.shift_type,
      reason_type: reasonType, arrival_time: arrival, description, evidence_urls: evidence, witness_name: witness || null, committed: true,
    });
    res.status(201).json({ message: 'Đã gửi giải trình, chờ quản lý xét duyệt', data: explanation });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Mỗi ca chỉ được gửi giải trình 1 lần' });
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [STAFF] POST /attendance/checkout-requests — xin về sớm (EARLY_LEAVE) hoặc giải trình quên chấm ra ca (FORGOT)
const createCheckoutRequest = async (req, res) => {
  try {
    const now = new Date();
    const kind = req.body.kind === 'FORGOT' ? 'FORGOT' : 'EARLY_LEAVE';
    const shift = await WorkShift.findOne({ where: { id: req.body.shift_id, employee_id: req.user.id }, include: INCLUDE });
    if (!shift) return res.status(404).json({ message: 'Không tìm thấy ca làm của bạn' });
    await assertMonthOpen(shift.date);
    const record = shift.AttendanceRecord;
    if (!record || record.status === 'ABSENT') return res.status(400).json({ message: 'Bạn chưa chấm vào ca này' });
    if (record.checkout_status) return res.status(400).json({ message: 'Ca này đã có kết quả ra ca' });
    if (shift.AttendanceCheckoutRequest) return res.status(400).json({ message: 'Mỗi ca chỉ được gửi 1 đơn ra ca' });
    const t = shiftTimes(shift.date, shift.shift_type);

    const leave = new Date(req.body.leave_time);
    if (Number.isNaN(leave.getTime())) return res.status(400).json({ message: 'Vui lòng nhập giờ về' });
    const description = text(req.body.description);
    const witness = text(req.body.witness_name);
    if (witness.length > 100) return res.status(400).json({ message: 'Tên người xác nhận tối đa 100 ký tự' });
    if (req.body.committed !== true) return res.status(400).json({ message: 'Bạn phải cam kết nội dung là đúng sự thật' });
    let reasonType;

    if (kind === 'EARLY_LEAVE') {
      if (now >= t.end) return res.status(400).json({ message: 'Đã hết ca, hãy chấm ra ca tại máy ở quầy' });
      reasonType = text(req.body.reason_type);
      if (!EARLY_LEAVE_REASONS[reasonType]) return res.status(400).json({ message: 'Vui lòng chọn lý do về sớm' });
      if (leave < new Date(now.getTime() - 5 * 60000) || leave >= t.end) return res.status(400).json({ message: `Giờ về dự kiến phải từ bây giờ đến trước ${fmtTime(t.end)}` });
      checkDescription(description, 50, 10);
    } else {
      if (now <= t.checkoutCloseAt) return res.status(400).json({ message: 'Vẫn còn trong giờ quét QR ra ca, hãy chấm ra ca tại máy ở quầy' });
      if (now > t.explainUntil) return res.status(400).json({ message: `Đã quá hạn giải trình (${RULES.EXPLAIN_DEADLINE_HOURS} giờ sau khi hết ca)` });
      reasonType = 'FORGOT';
      if (leave <= new Date(record.check_in_at) || leave > t.checkoutCloseAt) return res.status(400).json({ message: `Giờ về phải sau giờ vào ca và không muộn hơn ${fmtTime(t.checkoutCloseAt)}` });
      if (witness.length < 2) return res.status(400).json({ message: 'Quên chấm ra ca bắt buộc ghi người xác nhận' });
      checkDescription(description, 80, 15);
    }

    const request = await AttendanceCheckoutRequest.create({
      shift_id: shift.id, employee_id: req.user.id, shift_date: shift.date, shift_type: shift.shift_type,
      kind, reason_type: reasonType, leave_time: leave, is_early: leave < t.end, description,
      witness_name: witness || null, evidence_urls: checkEvidence(req.body.evidence_urls), committed: true,
    });
    res.status(201).json({
      message: kind === 'EARLY_LEAVE'
        ? 'Đã gửi đơn xin về sớm. Bạn có thể quét QR ra ca tại máy ở quầy ngay bây giờ'
        : (request.is_early ? 'Đã gửi giải trình. Giờ về trước giờ kết thúc ca nên được xét như về sớm' : 'Đã gửi giải trình quên chấm ra ca, chờ quản lý duyệt'),
      data: request,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ message: 'Mỗi ca chỉ được gửi 1 đơn ra ca' });
    res.status(err.status || 500).json({ message: err.message });
  }
};

// ---------- Quản lý ----------

// [MANAGER] GET /attendance/daily?date=YYYY-MM-DD
const dailyBoard = async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : vnToday();
  const shifts = await shiftsWithAttendance({ date });
  res.json({ data: sortShifts(shifts.map((s) => shiftView(s))), date });
};

// [MANAGER] GET /attendance/explanations?status= — giải trình vào ca
const listExplanations = async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const rows = await AttendanceExplanation.findAll({ where, order: [['createdAt', 'DESC']], limit: 300 });
  const pending = await AttendanceExplanation.count({ where: { status: 'PENDING' } });
  res.json({ data: rows, pending, reasons: EXPLANATION_REASONS });
};

// [MANAGER] POST /attendance/explanations/:id/review { decision: APPROVE | REJECT | ABSENT, note }
// APPROVE: tính công bình thường | REJECT: vẫn có lương ca, tính vi phạm nghiêm trọng | ABSENT: xác định không có mặt => vắng
const reviewExplanation = async (req, res) => {
  const decision = ['APPROVE', 'REJECT', 'ABSENT'].includes(req.body.decision) ? req.body.decision : null;
  if (!decision) return res.status(400).json({ message: 'Quyết định không hợp lệ' });
  const note = text(req.body.note);
  if (decision !== 'APPROVE' && note.length < 10) return res.status(400).json({ message: 'Từ chối phải ghi rõ lý do (ít nhất 10 ký tự)' });
  if (note.length > 1000) return res.status(400).json({ message: 'Ghi chú tối đa 1.000 ký tự' });
  const t = await sequelize.transaction();
  try {
    const exp = await AttendanceExplanation.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!exp) throw httpError(404, 'Không tìm thấy giải trình');
    if (exp.status !== 'PENDING') throw httpError(400, 'Giải trình đã được xử lý');
    if (exp.employee_id === req.user.id) throw httpError(400, 'Không được tự duyệt giải trình của mình');
    await assertMonthOpen(exp.shift_date);
    const shift = await WorkShift.findByPk(exp.shift_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!shift) throw httpError(400, 'Ca làm đã bị xóa');

    await exp.update({ status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note || null }, { transaction: t });
    const present = decision !== 'ABSENT';
    await AttendanceRecord.create({
      shift_id: shift.id, employee_id: exp.employee_id, shift_date: shift.date, shift_type: shift.shift_type,
      status: decision === 'APPROVE' ? 'EXPLAINED' : decision === 'REJECT' ? 'LATE_REJECTED' : 'ABSENT',
      check_in_at: present ? exp.arrival_time : null,
      minutes_late: present ? minutesLate(shiftTimes(shift.date, shift.shift_type).start, exp.arrival_time) : 0,
      method: 'EXPLANATION', explanation_id: exp.id, note: note || null,
    }, { transaction: t });
    await shift.update({ status: present ? 'ATTENDED' : 'ABSENT' }, { transaction: t });
    await t.commit();
    res.json({
      message: decision === 'APPROVE' ? 'Đã duyệt giải trình'
        : decision === 'REJECT' ? 'Đã từ chối: vẫn tính công, ghi 1 vi phạm nghiêm trọng' : 'Đã xác định vắng ca này',
    });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [MANAGER] GET /attendance/checkout-requests?status=
const listCheckoutRequests = async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const rows = await AttendanceCheckoutRequest.findAll({ where, order: [['createdAt', 'DESC']], limit: 300 });
  const records = await AttendanceRecord.findAll({ where: { shift_id: rows.map((r) => r.shift_id) }, raw: true });
  const byShift = Object.fromEntries(records.map((r) => [r.shift_id, r]));
  const pending = await AttendanceCheckoutRequest.count({ where: { status: 'PENDING' } });
  res.json({ data: rows.map((r) => ({ ...r.toJSON(), record: byShift[r.shift_id] || null })), pending, early_reasons: EARLY_LEAVE_REASONS });
};

// [MANAGER] POST /attendance/checkout-requests/:id/review { decision: APPROVE | REJECT, note }
const reviewCheckoutRequest = async (req, res) => {
  const approve = req.body.decision === 'APPROVE';
  const note = text(req.body.note);
  if (!approve && note.length < 10) return res.status(400).json({ message: 'Từ chối phải ghi rõ lý do (ít nhất 10 ký tự)' });
  if (note.length > 1000) return res.status(400).json({ message: 'Ghi chú tối đa 1.000 ký tự' });
  const t = await sequelize.transaction();
  try {
    const request = await AttendanceCheckoutRequest.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!request) throw httpError(404, 'Không tìm thấy đơn');
    if (request.status !== 'PENDING') throw httpError(400, 'Đơn đã được xử lý');
    if (request.employee_id === req.user.id) throw httpError(400, 'Không được tự duyệt đơn của mình');
    await assertMonthOpen(request.shift_date);
    const record = await AttendanceRecord.findOne({ where: { shift_id: request.shift_id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!record) throw httpError(400, 'Ca này chưa có kết quả vào ca');
    if (request.kind === 'EARLY_LEAVE' && !record.checkout_status) throw httpError(400, 'Nhân viên chưa chấm ra ca, chờ hết khung ra ca rồi duyệt');

    await request.update({ status: approve ? 'APPROVED' : 'REJECTED', reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note || null }, { transaction: t });
    // Quên chấm ra ca: lấy giờ về đã khai làm giờ ra ca (khai về trước giờ kết thúc => tính là về sớm)
    if (request.kind === 'FORGOT') {
      const early = minutesEarly(shiftTimes(request.shift_date, request.shift_type).end, request.leave_time);
      await record.update({
        check_out_at: request.leave_time, checkout_method: 'REQUEST', minutes_early: early,
        checkout_status: early > 0 ? 'EARLY' : approve ? 'FORGOT_APPROVED' : 'FORGOT_REJECTED',
      }, { transaction: t });
    }
    await t.commit();
    res.json({ message: approve ? 'Đã duyệt đơn' : 'Đã từ chối: ghi 1 vi phạm nghiêm trọng' });
  } catch (err) {
    await t.rollback();
    res.status(err.status || 500).json({ message: err.message });
  }
};

// [MANAGER] GET /attendance/report?month=YYYY-MM — tổng hợp theo nhân viên + chi tiết từng ca
const monthlyReport = async (req, res) => {
  const month = parseMonth(req.query.month);
  const views = sortShifts((await shiftsWithAttendance({ date: monthRange(month) })).map((s) => shiftView(s)));
  const byEmployee = {};
  for (const v of views) (byEmployee[v.employee_id] ||= []).push(v);
  const summary = Object.entries(byEmployee).map(([employee_id, list]) => {
    const s = summarizeViolations(list);
    return {
      employee_id,
      scheduled: list.length,
      worked: list.filter((v) => v.record && v.record.status !== 'ABSENT').length,
      absent: list.filter((v) => v.record?.status === 'ABSENT').length,
      late_minutes: list.reduce((sum, v) => sum + (v.record?.minutes_late || 0), 0),
      early_minutes: list.reduce((sum, v) => sum + (v.record?.minutes_early || 0), 0),
      normal_violations: s.normal_count,
      serious_violations: s.serious_count,
      bonus: s.bonus,
      suggested_discipline: s.suggested_discipline,
      unsettled: list.filter((v) => v.unsettled).length,
    };
  });
  res.json({ data: { month, summary, shifts: views } });
};

// ---------- Tự chốt khi quá hạn ----------
// - Không chấm vào ca, không giải trình trong hạn => vắng.
// - Đã gửi đơn về sớm mà không quét ra ca => ra ca theo giờ về đã khai (khi hết khung QR ra ca).
// - Không chấm ra ca, không giải trình trong hạn => thiếu ra ca (vi phạm nghiêm trọng).
// Chỉ áp dụng từ ngày kích hoạt máy chấm công đầu tiên để không đụng tới ca cũ.
const markAbsences = async () => {
  try {
    const first = await AttendanceKiosk.findOne({ order: [['createdAt', 'ASC']] });
    if (!first) return;
    const now = new Date();
    const shifts = await WorkShift.findAll({ where: { date: { [Op.between]: [vnToday(first.createdAt), vnToday(now)] } }, include: INCLUDE });
    for (const shift of shifts) {
      const t = shiftTimes(shift.date, shift.shift_type);
      const record = shift.AttendanceRecord;
      const request = shift.AttendanceCheckoutRequest;
      if (!record) {
        if (shift.AttendanceExplanation || now <= t.explainUntil) continue;
        await sequelize.transaction(async (tx) => {
          await AttendanceRecord.create({
            shift_id: shift.id, employee_id: shift.employee_id, shift_date: shift.date, shift_type: shift.shift_type,
            status: 'ABSENT', method: 'AUTO', note: 'Không chấm công và không giải trình trong hạn',
          }, { transaction: tx });
          await shift.update({ status: 'ABSENT' }, { transaction: tx });
        }).catch((err) => { if (err.name !== 'SequelizeUniqueConstraintError') throw err; });
        continue;
      }
      if (record.status === 'ABSENT' || record.checkout_status) continue;
      if (request?.kind === 'EARLY_LEAVE' && now > t.checkoutCloseAt) {
        const early = minutesEarly(t.end, request.leave_time);
        await record.update({ check_out_at: request.leave_time, checkout_method: 'REQUEST', minutes_early: early, checkout_status: early > 0 ? 'EARLY' : 'ON_TIME' });
      } else if (!request && now > t.explainUntil) {
        await record.update({ checkout_status: 'MISSING', checkout_method: 'AUTO' });
      }
    }
  } catch (err) {
    console.error('Lỗi tự chốt chấm công:', err.message);
  }
};

module.exports = {
  kioskAuth, createKiosk, listKiosks, updateKiosk, kioskStatus, createQr, qrState,
  myToday, myMonth, scanQr, checkIn, createExplanation, createCheckoutRequest,
  dailyBoard, listExplanations, reviewExplanation, listCheckoutRequests, reviewCheckoutRequest, monthlyReport, markAbsences,
  shiftView, shiftsWithAttendance, monthRange, parseMonth, assertMonthOpen, httpError, MANAGER_ROLES,
};
