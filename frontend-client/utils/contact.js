// Thông tin liên hệ của phòng khám — đổi số / giờ làm việc tại đây cho toàn bộ website
export const HOTLINE = '0869694064';
export const HOTLINE_DISPLAY = '0869 694 064';
export const ZALO_URL = `https://zalo.me/${HOTLINE}`;
export const WORKING_HOURS = '08:00 - 20:00 (Hàng ngày)';
// Địa chỉ phòng khám cấu hình trong frontend-client/.env (VITE_CLINIC_ADDRESS, VITE_CLINIC_MAP_QUERY)
export const CLINIC_ADDRESS = import.meta.env.VITE_CLINIC_ADDRESS || 'Đang cập nhật địa chỉ';
// Bản đồ Google Maps nhúng (không cần API key) và link mở chỉ đường; tra theo địa chỉ đầy đủ nếu có
const MAP_QUERY = encodeURIComponent(import.meta.env.VITE_CLINIC_MAP_QUERY || import.meta.env.VITE_CLINIC_ADDRESS || '');
export const MAP_EMBED_URL = `https://maps.google.com/maps?q=${MAP_QUERY}&z=16&hl=vi&output=embed`;
export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${MAP_QUERY}`;

// Thiết bị cảm ứng (điện thoại / máy tính bảng) mới gọi trực tiếp được qua link tel:
export const canPhoneCall = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
