// Khung giờ theo ca làm việc, khớp với trang đặt lịch bên frontend.
const EXAM_SLOT_MINUTES = 30;    // mỗi lượt khám bác sĩ
const CONSULT_SLOT_MINUTES = 45; // mỗi buổi tư vấn online của chuyên gia

// Chia ca thành các khung bắt đầu từ `start`; khung cuối phải kết thúc trong ca
const buildSlots = (start, end, minutes) => {
  const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const slots = [];
  for (let m = toMinutes(start); m + minutes <= toMinutes(end); m += minutes) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return slots;
};

// Khám tại phòng khám: chỉ ca sáng & chiều (phòng khám làm 08:00 - 17:00)
const EXAM_SLOTS = {
  MORNING: buildSlots('08:00', '12:00', EXAM_SLOT_MINUTES),
  AFTERNOON: buildSlots('13:00', '17:00', EXAM_SLOT_MINUTES),
};

// Tư vấn video online: có thêm ca tối
const CONSULT_SLOTS = {
  MORNING: buildSlots('08:00', '12:00', CONSULT_SLOT_MINUTES),
  AFTERNOON: buildSlots('13:00', '17:00', CONSULT_SLOT_MINUTES),
  EVENING: buildSlots('18:00', '21:00', CONSULT_SLOT_MINUTES),
};

// Giờ làm của bác sĩ theo ca
const EXAM_SHIFT_HOURS = { MORNING: ['08:00', '12:00'], AFTERNOON: ['13:00', '17:00'] };

module.exports = { EXAM_SLOT_MINUTES, CONSULT_SLOT_MINUTES, EXAM_SLOTS, CONSULT_SLOTS, EXAM_SHIFT_HOURS };
