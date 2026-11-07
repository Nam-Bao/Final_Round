// Thông tin liên hệ của phòng khám: quản lý sửa ở Quản lý trang > Thông tin phòng khám, tải 1 lần trước khi website hiện.
// Các giá trị dưới đây là mặc định khi quản lý chưa nhập hoặc không tải được.
const CLINIC_INFO_API = '/api/media/pages/clinic-info';
const LOAD_TIMEOUT_MS = 1500;
const DEFAULT_HOTLINE = '0869694064';
// Địa chỉ mặc định cấu hình trong frontend-client/.env (VITE_CLINIC_ADDRESS, VITE_CLINIC_MAP_QUERY)
const DEFAULT_ADDRESS = import.meta.env.VITE_CLINIC_ADDRESS || '';
const DEFAULT_MAP_QUERY = import.meta.env.VITE_CLINIC_MAP_QUERY || DEFAULT_ADDRESS;

const formatPhone = (phone) => phone.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3');
const mapEmbedUrl = (query) => `https://maps.google.com/maps?q=${query}&z=16&hl=vi&output=embed`;
const mapDirectionsUrl = (query) => `https://www.google.com/maps/dir/?api=1&destination=${query}`;

export let HOTLINE = DEFAULT_HOTLINE;
export let HOTLINE_DISPLAY = formatPhone(DEFAULT_HOTLINE);
export let ZALO_URL = `https://zalo.me/${DEFAULT_HOTLINE}`;
export let WORKING_HOURS = '08:00 - 17:00 (Hàng ngày)';
// Tư vấn chuyên gia qua video: giờ theo ca chuyên gia mở, khung cuối 20:00 - 21:00
export let CONSULT_HOURS = '08:00 - 21:00 (Hàng ngày)';
export let CLINIC_ADDRESS = DEFAULT_ADDRESS || 'Đang cập nhật địa chỉ';
// Bản đồ Google Maps nhúng (không cần API key) và link mở chỉ đường. Chưa khai báo địa chỉ thì không hiện bản đồ
let mapQuery = encodeURIComponent(DEFAULT_MAP_QUERY);
export let HAS_CLINIC_MAP = mapQuery !== '';
export let MAP_EMBED_URL = mapEmbedUrl(mapQuery);
export let MAP_DIRECTIONS_URL = mapDirectionsUrl(mapQuery);
export let SOCIAL_LINKS = [];

const applyClinicInfo = (info) => {
  if (info.hotline) {
    HOTLINE = info.hotline;
    HOTLINE_DISPLAY = formatPhone(info.hotline);
    ZALO_URL = `https://zalo.me/${info.hotline}`;
  }
  if (info.zalo_url) ZALO_URL = info.zalo_url;
  if (info.working_hours) WORKING_HOURS = info.working_hours;
  if (info.consult_hours) CONSULT_HOURS = info.consult_hours;
  if (info.address) CLINIC_ADDRESS = info.address;
  if (info.map_query || info.address) {
    mapQuery = encodeURIComponent(info.map_query || info.address);
    HAS_CLINIC_MAP = true;
    MAP_EMBED_URL = mapEmbedUrl(mapQuery);
    MAP_DIRECTIONS_URL = mapDirectionsUrl(mapQuery);
  }
  SOCIAL_LINKS = [['Facebook', info.facebook_url], ['Instagram', info.instagram_url], ['TikTok', info.tiktok_url], ['YouTube', info.youtube_url]]
    .filter(([, url]) => url)
    .map(([label, url]) => ({ label, url }));
};

// Không bao giờ ném lỗi: API chậm hoặc lỗi thì website vẫn hiện với giá trị mặc định
export const loadClinicInfo = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch(CLINIC_INFO_API, { signal: controller.signal });
    if (res.ok) applyClinicInfo((await res.json()).data || {});
  } catch { /* dùng giá trị mặc định */ } finally {
    clearTimeout(timer);
  }
};

// Thiết bị cảm ứng (điện thoại / máy tính bảng) mới gọi trực tiếp được qua link tel:
export const canPhoneCall = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
