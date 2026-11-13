// Mốc thời gian chờ đang áp dụng ở server (đổi được qua .env khi demo). Nạp 1 lần trước khi website hiện, lỗi thì dùng mặc định.
const DEFAULTS = {
  paymentHoldMinutes: 15,
  noShowGraceMinutes: 15,
  rescheduleMinMinutes: 24 * 60,
  consultRoomCloseMinutes: 45,
  consultResultDeadlineMinutes: 24 * 60,
  consultFee: 300000,
};
let current = { ...DEFAULTS };

export const loadTiming = () => fetch('/api/booking/config/timing')
  .then((res) => (res.ok ? res.json() : null))
  .then((json) => { if (json?.data) current = { ...DEFAULTS, ...json.data }; })
  .catch(() => {});

export const timing = () => current;

// "24 giờ", "10 phút", "1 giờ 30 phút"
export const durationLabel = (total) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return [h ? `${h} giờ` : '', m ? `${m} phút` : ''].filter(Boolean).join(' ') || '0 phút';
};
