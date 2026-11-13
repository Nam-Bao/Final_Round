// Các mốc thời gian chờ của nghiệp vụ. Mặc định là quy định thật của phòng khám; khi demo / test có thể đặt ngắn lại trong .env
// (ví dụ giữ chỗ 2 phút, hạn gửi kết quả tư vấn 0.2 giờ) để không phải chờ. Frontend đọc cùng các giá trị qua GET /config/timing.
const read = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const minutes = (n) => Math.max(1, Math.round(n));

const TIMING = {
  paymentHoldMinutes: minutes(read('PAYMENT_HOLD_MINUTES', 15)),               // giữ chỗ chờ cọc lịch khám / lịch tư vấn
  noShowGraceMinutes: minutes(read('NO_SHOW_GRACE_MINUTES', 15)),              // quá giờ hẹn bao lâu mới ghi "khách không đến"
  rescheduleMinMinutes: minutes(read('RESCHEDULE_MIN_HOURS', 24) * 60),        // khách tự đổi lịch (khám, tư vấn) trước giờ hẹn ít nhất
  expertOpenBeforeMinutes: minutes(read('EXPERT_OPEN_BEFORE_MINUTES', 15)),    // chuyên gia vào phòng tư vấn sớm
  consultRoomCloseMinutes: minutes(read('CONSULT_ROOM_CLOSE_MINUTES', 45)),    // phòng tư vấn đóng sau giờ hẹn
  consultMinSessionMinutes: minutes(read('CONSULT_MIN_SESSION_MINUTES', 5)),   // tư vấn tối thiểu trước khi gửi kết quả
  consultResultDeadlineMinutes: minutes(read('CONSULT_RESULT_DEADLINE_HOURS', 24) * 60), // hạn gửi kết quả sau khi phòng đóng
  attendanceQrTtlSeconds: Math.max(5, Math.round(read('ATTENDANCE_QR_TTL_SECONDS', 20))), // mã QR chấm công sống
  attendanceExplainMinutes: minutes(read('ATTENDANCE_EXPLAIN_HOURS', 24) * 60), // hạn giải trình sau khi hết ca, quá hạn tự ghi vắng
};

// "24 giờ", "10 phút", "1 giờ 30 phút" để đưa vào thông báo
const durationLabel = (total) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} giờ` : '', m ? `${m} phút` : ''].filter(Boolean).join(' ') || '0 phút';
};

// Phí 1 buổi tư vấn chuyên gia (khách trả trước khi đặt, không trừ vào phí khám)
const CONSULT_FEE = Math.round(read('CONSULT_FEE', 300000));

module.exports = { TIMING, CONSULT_FEE, durationLabel };
