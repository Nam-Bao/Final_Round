import axios from 'axios';
import { message } from 'antd';

// API của service-media (tin tức, bài nghiên cứu, banner, popup, tải ảnh / video)
export const MEDIA_API = 'http://localhost:4000/api/media';
export const CLIENT_URL = 'http://localhost:3001';

export const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
export const errorText = (err, fallback) => err.response?.data?.message || fallback;

// validateFields lỗi => antd đã tô đỏ ô sai; trả null để hàm lưu dừng lại thay vì văng lỗi Uncaught
export const validateForm = (form, fields) => form.validateFields(fields).catch(() => {
  message.warning('Vui lòng kiểm tra lại các ô báo đỏ');
  return null;
});

// Loại bài viết = các tab ở trang Tin tức của khách (khớp service-media/utils/articleTypes.js)
export const ARTICLE_TYPES = {
  INTRO: { label: 'Giới thiệu', color: 'cyan' },
  EVENT: { label: 'Sự kiện', color: 'orange' },
  KNOWLEDGE: { label: 'Kiến thức da liễu', color: 'blue' },
  SKINCARE: { label: 'Chăm sóc da', color: 'green' },
  RESEARCH: { label: 'Nghiên cứu', color: 'magenta' },
};
export const ARTICLE_TYPE_OPTIONS = Object.entries(ARTICLE_TYPES).map(([value, t]) => ({ value, label: t.label }));

// Tải ảnh (tối đa 5MB) / video (tối đa 50MB) lên Cloudinary, trả về đường dẫn https
export const uploadImage = async (file) => {
  if (!file.type.startsWith('image/')) throw new Error('Vui lòng chọn file ảnh');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5MB');
  const form = new FormData();
  form.append('image', file);
  const res = await axios.post(`${MEDIA_API}/upload`, form, authConfig());
  return res.data.url;
};

export const uploadVideo = async (file) => {
  if (!/^video\/(mp4|webm|quicktime)$/.test(file.type)) throw new Error('Chỉ nhận video mp4, webm, mov');
  if (file.size > 50 * 1024 * 1024) throw new Error('Video tối đa 50MB. Video dài hơn hãy đăng YouTube rồi dán link');
  const form = new FormData();
  form.append('video', file);
  const res = await axios.post(`${MEDIA_API}/upload/video`, form, authConfig());
  return res.data.url;
};

// Chọn file từ máy (không cần thẻ <input> trong giao diện)
export const pickFile = (accept) => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => resolve(input.files?.[0] || null);
  input.click();
});

export const SUBMISSION_STATUS = {
  DRAFT: { color: 'default', label: 'Bản nháp' },
  PENDING: { color: 'processing', label: 'Chờ duyệt' },
  CHANGES_REQUESTED: { color: 'warning', label: 'Cần chỉnh sửa' },
  APPROVED: { color: 'success', label: 'Đã duyệt & đăng' },
};

export const REVIEW_ACTION = {
  SUBMITTED: { color: 'blue', label: 'Gửi duyệt' },
  APPROVED: { color: 'green', label: 'Duyệt & đăng' },
  CHANGES_REQUESTED: { color: 'orange', label: 'Yêu cầu chỉnh sửa' },
  WITHDRAWN: { color: 'default', label: 'Rút bài' },
};
