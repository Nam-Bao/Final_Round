import axios from 'axios';
import dayjs from 'dayjs';

export const ATT_API = 'http://localhost:4000/api/booking/attendance';
export const PAYROLL_API = 'http://localhost:4000/api/booking/payroll';
export const MEDIA_UPLOAD = 'http://localhost:4000/api/media/upload';
export const QR_PREFIX = 'GLOWSKIN-ATT:';

export const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
export const errorText = (err, fallback) => err.response?.data?.message || err.message || fallback;

export const SHIFT_LABEL = {
  MORNING: 'Ca Sáng (08:00 - 12:00)',
  AFTERNOON: 'Ca Chiều (13:00 - 17:00)',
  EVENING: 'Ca Tối (18:00 - 22:00)', // ca cũ, đã bỏ
};
export const ROLE_LABEL = { DOCTOR: 'Bác sĩ', CONSULTANT: 'CSKH', SALES: 'NVBH', TECHNICIAN: 'KTV' };
export const STAFF_ROLES = ['DOCTOR', 'CONSULTANT', 'SALES', 'TECHNICIAN'];
export const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

// Kết quả chấm công của ca
export const RECORD_STATUS = {
  ON_TIME: { color: 'green', label: 'Đúng giờ' },
  LATE: { color: 'orange', label: 'Đi trễ' },
  EXPLAINED: { color: 'blue', label: 'Có giải trình' },
  LATE_REJECTED: { color: 'volcano', label: 'Trễ - giải trình bị từ chối' },
  ABSENT: { color: 'red', label: 'Vắng' },
};
// Kết quả ra ca
export const CHECKOUT_STATUS = {
  ON_TIME: { color: 'green', label: 'Ra đúng giờ' },
  EARLY: { color: 'orange', label: 'Về sớm' },
  FORGOT_APPROVED: { color: 'blue', label: 'Quên chấm (đã duyệt)' },
  FORGOT_REJECTED: { color: 'volcano', label: 'Quên chấm (bị từ chối)' },
  MISSING: { color: 'red', label: 'Không chấm ra ca' },
};
// Giai đoạn ra ca khi chưa có kết quả
export const CHECKOUT_PHASE = {
  WORKING: { color: 'cyan', label: 'Đang trong ca' },
  EARLY_LEAVE_READY: { color: 'gold', label: 'Đã xin về sớm - quét QR ra ca' },
  OPEN: { color: 'processing', label: 'Đang mở chấm ra ca' },
  NEED_EXPLANATION: { color: 'warning', label: 'Chưa chấm ra ca - cần giải trình' },
  REQUEST_PENDING: { color: 'gold', label: 'Giải trình ra ca chờ duyệt' },
  MISSING: { color: 'red', label: 'Không chấm ra ca' },
};
export const checkoutStatus = (view) => {
  if (!view.record || view.record.status === 'ABSENT') return null;
  if (view.record.checkout_status) return CHECKOUT_STATUS[view.record.checkout_status];
  return CHECKOUT_PHASE[view.checkout] || null;
};
export const REQUEST_KIND = { EARLY_LEAVE: 'Xin về sớm', FORGOT: 'Quên chấm ra ca' };
// Trạng thái ca chưa có kết quả
export const PHASE = {
  UPCOMING: { color: 'default', label: 'Chưa tới giờ' },
  OPEN: { color: 'processing', label: 'Đang mở chấm vào ca' },
  NEED_EXPLANATION: { color: 'warning', label: 'Chưa chấm công - cần giải trình' },
  EXPLANATION_PENDING: { color: 'gold', label: 'Giải trình chờ duyệt' },
  EXPIRED: { color: 'red', label: 'Quá hạn giải trình' },
};
export const EXPLANATION_STATUS = {
  PENDING: { color: 'gold', label: 'Chờ duyệt' },
  APPROVED: { color: 'green', label: 'Đã duyệt' },
  REJECTED: { color: 'red', label: 'Từ chối' },
};

// Nhãn hiển thị cho 1 ca (đã có kết quả thì theo kết quả, chưa có thì theo giai đoạn)
export const shiftStatus = (view) => (view.record ? RECORD_STATUS[view.record.status] : PHASE[view.phase]) || { color: 'default', label: view.phase };

export const fmtTime = (d) => (d ? dayjs(d).format('HH:mm') : '—');
export const fmtDateTime = (d) => (d ? dayjs(d).format('HH:mm DD/MM/YYYY') : '—');

export const uploadPhoto = async (blob, name = 'cham-cong.jpg') => {
  const form = new FormData();
  form.append('image', blob instanceof File ? blob : new File([blob], name, { type: 'image/jpeg' }));
  const res = await axios.post(MEDIA_UPLOAD, form, authConfig());
  return res.data.url;
};

// Camera chỉ chạy trên https hoặc localhost
export const cameraError = (err) => {
  if (!window.isSecureContext) return 'Trình duyệt chỉ cho mở camera trên trang https. Trên điện thoại hãy mở admin bằng địa chỉ https (npm run dev:mobile).';
  if (err?.name === 'NotAllowedError') return 'Bạn đã chặn quyền camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.';
  if (err?.name === 'NotFoundError') return 'Không tìm thấy camera trên thiết bị này.';
  return 'Không mở được camera, hãy thử lại.';
};

export const openCamera = (facingMode) => navigator.mediaDevices.getUserMedia({
  video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
});
export const stopCamera = (stream) => stream?.getTracks().forEach((t) => t.stop());
