// Ảnh da trước khám + sàng lọc AI tại phòng khám.
// - pre_exam_images vẫn là danh sách URL (các trang cũ, bệnh án bên identity đọc kiểu này).
// - pre_exam_image_meta: { [url]: { source: 'customer' | 'counter', angle, at, by } } - ảnh khách tự tải khi đặt lịch / CSKH chụp tại quầy.
// - ai_consent: { accepted, at, by } - CSKH hỏi khách đồng ý cho phân tích ảnh bằng AI (ảnh được gửi cho đơn vị phân tích Roboflow).
// - Có đồng ý + có ảnh CSKH chụp => nhờ service AI quét (token hệ thống), kết quả về tab "Soi da AI" / trang "Xác nhận soi da" của bác sĩ.
const axios = require('axios');
const jwt = require('jsonwebtoken');

const GATEWAY = () => process.env.GATEWAY_URL || 'http://localhost:4000';
const ANGLES = ['front', 'left', 'right'];
const MAX_CUSTOMER_IMAGES = 5;
const MAX_COUNTER_IMAGES = 10;

const isImageUrl = (u) => {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && x.hostname === 'res.cloudinary.com'; } catch { return false; }
};
// Nhận [url] hoặc [{ url, angle }] => [{ url, angle }] hợp lệ, không trùng
const normalize = (list, max) => {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === 'string' ? { url: x } : { url: x?.url, angle: x?.angle }))
    .filter((x) => isImageUrl(x.url) && !seen.has(x.url) && seen.add(x.url))
    .slice(0, max)
    .map((x) => ({ url: x.url, angle: ANGLES.includes(x.angle) ? x.angle : null }));
};

const metaOf = (apt) => apt.pre_exam_image_meta || {};
// Ảnh khách tự tải khi đặt lịch online
const setCustomerImages = (apt, list) => {
  const imgs = normalize(list, MAX_CUSTOMER_IMAGES);
  const at = new Date().toISOString();
  apt.pre_exam_images = imgs.map((x) => x.url);
  apt.pre_exam_image_meta = Object.fromEntries(imgs.map((x) => [x.url, { source: 'customer', angle: x.angle, at }]));
};
// Ảnh CSKH chụp tại quầy: thay bộ ảnh tại quầy, GIỮ ảnh khách đã tự tải
const setCounterImages = (apt, list, staffId) => {
  const imgs = normalize(list, MAX_COUNTER_IMAGES);
  const old = metaOf(apt);
  const customer = (apt.pre_exam_images || []).filter((u) => ['customer', 'chat'].includes(old[u]?.source)); // giữ ảnh khách tự tải / gửi qua chat
  const at = new Date().toISOString();
  const meta = Object.fromEntries(customer.map((u) => [u, old[u]]));
  imgs.filter((x) => !meta[x.url]).forEach((x) => { meta[x.url] = { source: 'counter', angle: x.angle, at: old[x.url]?.at || at, by: staffId }; });
  apt.pre_exam_images = [...customer, ...imgs.map((x) => x.url).filter((u) => !customer.includes(u))];
  apt.pre_exam_image_meta = meta;
  apt.changed('pre_exam_image_meta', true);
};
// Ảnh khách gửi qua chat CSKH (thư mục O2O_Chat) => CSKH đính vào hồ sơ khám, tối đa 15 ảnh / lịch
const MAX_TOTAL_IMAGES = 15;
const isChatImage = (u) => isImageUrl(u) && new URL(u).pathname.includes('/image/upload/') && new URL(u).pathname.includes('/O2O_Chat/');
const addChatImages = (apt, urls, staffId) => {
  const current = apt.pre_exam_images || [];
  const fresh = [...new Set((Array.isArray(urls) ? urls : []).map(String))].filter((u) => isChatImage(u) && !current.includes(u));
  const room = Math.max(0, MAX_TOTAL_IMAGES - current.length);
  const added = fresh.slice(0, room);
  const at = new Date().toISOString();
  apt.pre_exam_images = [...current, ...added];
  apt.pre_exam_image_meta = { ...metaOf(apt), ...Object.fromEntries(added.map((u) => [u, { source: 'chat', angle: null, at, by: staffId }])) };
  apt.changed('pre_exam_image_meta', true);
  apt.changed('pre_exam_images', true);
  return { added: added.length, skipped: fresh.length - added.length };
};
const counterImages = (apt) => {
  const meta = metaOf(apt);
  return (apt.pre_exam_images || []).filter((u) => (meta[u]?.source || 'counter') === 'counter') // ảnh cũ chưa có meta: do CSKH chụp (ảnh khách tải / gửi qua chat không quét AI)
    .map((u) => ({ url: u, angle: meta[u]?.angle || null }));
};
// Tối đa 3 ảnh để quét: ưu tiên Chính diện, Má trái, Má phải; còn chỗ thì lấy ảnh chưa ghi góc
const scanImages = (apt) => {
  const all = counterImages(apt);
  const picked = ANGLES.map((a) => all.find((x) => x.angle === a)).filter(Boolean);
  for (const x of all) if (picked.length < 3 && !picked.includes(x)) picked.push(x);
  const used = new Set(picked.map((x) => x.angle).filter(Boolean));
  return picked.map((x) => ({ url: x.url, angle: x.angle || ANGLES.find((a) => !used.has(a) && used.add(a)) || 'front' }));
};

// Nhờ service AI quét ảnh tại quầy của lịch hẹn. force: quét lại cả khi bác sĩ đã xác nhận lượt trước
const requestScan = async (apt, { force = false } = {}) => {
  const images = scanImages(apt);
  if (!apt.ai_consent?.accepted) throw Object.assign(new Error('Khách chưa đồng ý cho phân tích ảnh bằng AI (CSKH ghi nhận khi đón khách)'), { status: 409, code: 'NO_AI_CONSENT' });
  if (!images.length) throw Object.assign(new Error('Chưa có ảnh CSKH chụp tại quầy'), { status: 409, code: 'NO_COUNTER_IMAGES' });
  const token = jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '2m' });
  const res = await axios.post(`${GATEWAY()}/api/ai/analyses/clinic`, {
    appointment_id: apt.id, patient_profile_id: apt.patient_profile_id, customer_id: apt.customer_id, doctor_id: apt.doctor_id,
    captured_by: apt.consultant_id, consent: { at: apt.ai_consent.at, by: apt.ai_consent.by }, images, force,
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 });
  return res.data;
};
// Quét nền sau khi CSKH lưu (không chờ). Lỗi thì bác sĩ bấm "Quét lại".
const scanInBackground = (apt) => {
  if (!apt.ai_consent?.accepted || !scanImages(apt).length) return;
  requestScan(apt).catch((e) => console.warn('Quét AI ảnh tại quầy chưa được:', e.response?.data?.message || e.message));
};

module.exports = { normalize, setCustomerImages, setCounterImages, addChatImages, isChatImage, counterImages, scanImages, requestScan, scanInBackground, isImageUrl };
