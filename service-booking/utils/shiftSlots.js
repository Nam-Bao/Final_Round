// Khung giờ (mỗi khung 1 tiếng) theo ca làm việc. Dùng chung cho lịch khám bác sĩ và lịch tư vấn chuyên gia,
// khớp với trang đặt lịch bên frontend.
const SHIFT_SLOTS = {
  MORNING: ['08:00', '09:00', '10:00', '11:00'],
  AFTERNOON: ['13:00', '14:00', '15:00', '16:00'],
  EVENING: ['18:00', '19:00', '20:00']
};

module.exports = { SHIFT_SLOTS };
