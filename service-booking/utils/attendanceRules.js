// Quy tắc chấm công theo ca. Giờ tính theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ của máy chạy server.

// EVENING chỉ còn để hiển thị ca tối cũ trong lịch sử; ca đang dùng xem ACTIVE_SHIFTS
const { TIMING } = require('./timing');
const SHIFT_HOURS = {
  MORNING: { label: 'Ca Sáng', start: '08:00', end: '12:00' },
  AFTERNOON: { label: 'Ca Chiều', start: '13:00', end: '17:00' },
  EVENING: { label: 'Ca Tối', start: '18:00', end: '22:00' },
};
const ACTIVE_SHIFTS = ['MORNING', 'AFTERNOON'];
const SHIFT_MINUTES = 240;

const RULES = {
  OPEN_BEFORE_MIN: TIMING.attendanceOpenBeforeMinutes,  // mở QR vào ca trước giờ vào ca (mặc định 20', đổi trong .env)
  CLOSE_AFTER_MIN: TIMING.attendanceCloseAfterMinutes,  // đóng QR vào ca sau giờ vào ca (mặc định 10')
  CHECKOUT_AFTER_MIN: TIMING.attendanceCheckoutMinutes, // mở QR ra ca từ giờ kết thúc ca tới 30' sau (mặc định)
  QR_TTL_SEC: TIMING.attendanceQrTtlSeconds, // mỗi mã QR chỉ sống 20 giây (mặc định), dùng 1 lần
  TICKET_TTL_SEC: 120,        // sau khi quét có 2 phút để chụp ảnh xác nhận
  EXPLAIN_DEADLINE_MINUTES: TIMING.attendanceExplainMinutes, // hạn giải trình sau khi hết ca (mặc định 24 giờ)
  ATTENDANCE_BONUS: 500000,   // thưởng chuyên cần / tháng
  MAX_VIOLATIONS_FOR_BONUS: 3, // tổng vi phạm 0 - 3 lần mới có thưởng
};

const STAFF_ROLES = ['DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN'];
const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];

// Lý do giải trình vào ca trễ; evidence = bắt buộc ảnh minh chứng, witness = bắt buộc người xác nhận
const EXPLANATION_REASONS = {
  TRAFFIC: { label: 'Sự cố giao thông (kẹt xe, hỏng xe, tai nạn)', evidence: false, witness: false },
  HEALTH: { label: 'Sức khỏe (ốm, khám bệnh)', evidence: true, witness: false },
  FAMILY: { label: 'Việc gia đình khẩn cấp', evidence: false, witness: false },
  WORK_ASSIGNMENT: { label: 'Được giao việc khác của phòng khám', evidence: false, witness: true },
  FORGOT: { label: 'Có mặt đúng giờ nhưng quên chấm công', evidence: false, witness: true },
  SYSTEM_ERROR: { label: 'Lỗi hệ thống / máy chấm công / điện thoại', evidence: true, witness: true },
  OTHER: { label: 'Lý do khác', evidence: true, witness: false },
};

// Lý do xin về sớm
const EARLY_LEAVE_REASONS = {
  HEALTH: 'Sức khỏe không đảm bảo',
  FAMILY: 'Việc gia đình khẩn cấp',
  WORK_ASSIGNMENT: 'Được giao việc bên ngoài phòng khám',
  PERSONAL: 'Việc cá nhân',
  OTHER: 'Lý do khác',
};

const VN_OFFSET = '+07:00';
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00${VN_OFFSET}`);
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

// Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD)
const vnToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);

// Giờ ca điều chỉnh theo ngày (quản lý đổi giờ ca 1 ngày: sự kiện, tăng ca, demo). Nạp từ bảng ShiftHourOverrides vào bộ nhớ
// (lúc khởi động, sau mỗi lần sửa và mỗi phút) để mọi chỗ tính giờ ca vẫn gọi đồng bộ như cũ.
let overrides = new Map(); // `${date}|${shift_type}` -> { start: 'HH:mm', end: 'HH:mm', reason }
const setOverrides = (rows) => { overrides = new Map(rows.map((r) => [`${r.date}|${r.shift_type}`, { start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), reason: r.reason }])); };
const overrideOf = (date, shiftType) => overrides.get(`${date}|${shiftType}`) || null;
// Giờ ca thực tế của 1 ngày: { start, end, adjusted, reason }
const hoursOf = (date, shiftType) => {
  const o = overrideOf(date, shiftType);
  const h = SHIFT_HOURS[shiftType];
  return o ? { start: o.start, end: o.end, adjusted: true, reason: o.reason } : { start: h.start, end: h.end, adjusted: false };
};

const shiftTimes = (date, shiftType) => {
  const h = hoursOf(date, shiftType);
  const start = at(date, h.start);
  const end = at(date, h.end);
  return {
    start,
    end,
    openAt: addMin(start, -RULES.OPEN_BEFORE_MIN),
    closeAt: addMin(start, RULES.CLOSE_AFTER_MIN),
    checkoutOpenAt: end,
    checkoutCloseAt: addMin(end, RULES.CHECKOUT_AFTER_MIN),
    explainUntil: new Date(end.getTime() + RULES.EXPLAIN_DEADLINE_MINUTES * 60000),
    adjusted: h.adjusted,
  };
};

// Trạng thái máy chấm công lúc này: khung QR vào / ra ca, hoặc đang trong ca (chỉ người đã xin về sớm quét được)
const kioskWindow = (now = new Date()) => {
  const date = vnToday(now);
  for (const type of ACTIVE_SHIFTS) {
    const t = shiftTimes(date, type);
    if (now >= t.openAt && now <= t.closeAt) return { date, shift_type: type, kind: 'IN', until: t.closeAt, ...t };
    if (now >= t.checkoutOpenAt && now <= t.checkoutCloseAt) return { date, shift_type: type, kind: 'OUT', until: t.checkoutCloseAt, ...t };
    if (now > t.closeAt && now < t.end) return { date, shift_type: type, kind: 'WORKING', until: t.end, ...t };
  }
  return null;
};

// Khung mở QR tiếp theo (hôm nay hoặc ngày mai). Sắp theo giờ thực tế: giờ ca điều chỉnh có thể làm ca chiều diễn ra trước ca sáng
const nextWindow = (now = new Date()) => {
  for (const offset of [0, 1]) {
    const date = vnToday(new Date(now.getTime() + offset * 24 * 3600000));
    const candidates = ACTIVE_SHIFTS.flatMap((type) => {
      const t = shiftTimes(date, type);
      return [{ date, shift_type: type, kind: 'IN', ...t }, { date, shift_type: type, kind: 'OUT', ...t, openAt: t.checkoutOpenAt }];
    }).filter((w) => w.openAt > now).sort((a, b) => a.openAt - b.openAt);
    if (candidates.length) return candidates[0];
  }
  const tomorrow = vnToday(new Date(now.getTime() + 24 * 3600000));
  return { date: tomorrow, shift_type: ACTIVE_SHIFTS[0], kind: 'IN', ...shiftTimes(tomorrow, ACTIVE_SHIFTS[0]) };
};

// Tính theo phút đủ: vào lúc 08:00:59 vẫn là đúng giờ
const minutesLate = (start, checkIn) => Math.max(0, Math.floor((checkIn - start) / 60000));
const minutesEarly = (end, checkOut) => Math.max(0, Math.ceil((end - checkOut) / 60000));

module.exports = {
  SHIFT_HOURS, ACTIVE_SHIFTS, SHIFT_MINUTES, RULES, STAFF_ROLES, MANAGER_ROLES, EXPLANATION_REASONS, EARLY_LEAVE_REASONS,
  vnToday, shiftTimes, kioskWindow, nextWindow, minutesLate, minutesEarly, hoursOf, setOverrides, at, addMin,
};
