// Thông tin liên hệ của phòng khám — đổi số / giờ làm việc tại đây cho toàn bộ website
export const HOTLINE = '0869694064';
export const HOTLINE_DISPLAY = '0869 694 064';
export const ZALO_URL = `https://zalo.me/${HOTLINE}`;
export const WORKING_HOURS = '08:00 - 20:00 (Hàng ngày)';

// Thiết bị cảm ứng (điện thoại / máy tính bảng) mới gọi trực tiếp được qua link tel:
export const canPhoneCall = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
