// Dùng chung cho trang Nhập hàng (đề xuất, đơn đặt hàng, nhận hàng, kiểm kho, nhà cung cấp)
import axios from 'axios';
import { API_BASE } from '../../config';

export const API = `${API_BASE}/api/commerce`;
export const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
export const vnd = (n) => (n === null || n === undefined || n === '' ? '-' : `${Math.round(Number(n)).toLocaleString('vi-VN')}đ`);
export const role = () => { try { return JSON.parse(sessionStorage.getItem('admin_user') || '{}').role; } catch { return null; } };
export const isManagerRole = (r) => ['GEN_MANAGER', 'ADMIN'].includes(r);
export const errMsg = (e, fallback) => e.response?.data?.message || fallback;
export const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

// Tình trạng hàng khi nhận / kiểm kho (khớp CONDITIONS ở service-commerce)
export const CONDITIONS = {
  OK: 'Nguyên vẹn', DENTED: 'Móp / vỡ', LEAKING: 'Rò rỉ', SEAL_BROKEN: 'Mất niêm phong / seal', ODD: 'Đổi màu / mùi lạ',
  WRONG_ITEM: 'Sai sản phẩm / dung tích', TEMPERATURE: 'Bảo quản sai nhiệt độ',
};
export const CONDITION_OPTIONS = Object.entries(CONDITIONS).map(([value, label]) => ({ value, label }));

export const PO_STATUS = {
  SENT: { color: 'blue', label: 'Đã gửi, chờ hàng' }, PARTIAL: { color: 'orange', label: 'Nhận một phần, chờ giao bù' },
  RECEIVED: { color: 'green', label: 'Đã nhận xong' }, CANCELLED: { color: 'default', label: 'Đã hủy' },
};
export const RECEIPT_STATUS = {
  MATCHED: { color: 'green', label: 'Khớp, đã nhập kho' }, PENDING_REVIEW: { color: 'red', label: 'Chờ quản lý kiểm tra' }, REVIEWED: { color: 'blue', label: 'Quản lý đã xử lý' },
};
export const COUNT_STATUS = {
  MATCHED: { color: 'green', label: 'Khớp hệ thống' }, PENDING_REVIEW: { color: 'red', label: 'Lệch, chờ quản lý' }, REVIEWED: { color: 'blue', label: 'Đã chốt' },
};

// Tải ảnh lên Cloudinary qua service-media, trả về URL https
export const uploadImage = async (file) => {
  const form = new FormData();
  form.append('image', file);
  const r = await axios.post(`${API_BASE}/api/media/upload`, form, auth());
  return r.data.url;
};
