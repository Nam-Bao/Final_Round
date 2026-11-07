import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import { useAuthStore } from './store/authStore'
import { loadClinicInfo } from './utils/contact'
import './styles/index.css'

// Server báo phiên đăng nhập không còn hợp lệ (hết hạn / đổi khóa) -> đăng xuất và về trang đăng nhập.
// 403 do thiếu quyền (sai vai trò) thì giữ nguyên phiên.
axios.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  const message = String(error.response?.data?.message || '');
  const sessionInvalid = status === 401 || (status === 403 && /token/i.test(message));
  if (sessionInvalid && useAuthStore.getState().token) {
    useAuthStore.getState().logout();
    if (window.location.pathname !== '/login') {
      window.location.assign(`/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }
  return Promise.reject(error);
});

// Tự gắn token đăng nhập vào mọi request axios gửi tới API Gateway (backend lấy định danh khách từ token,
// không còn tin customer_id gửi trong body/query). Không gắn cho domain khác để không lộ token ra ngoài.
const GATEWAY_PATH = '/api';
axios.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token && config.url?.startsWith(GATEWAY_PATH) && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Ảnh hỏng (link chết, ảnh đã xóa) hiện ảnh thay thế nhẹ nhàng thay vì icon vỡ và chữ mô tả đè lên giao diện
const IMAGE_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#F2F7F6"/><path d="M100 62l9 29 29 9-29 9-9 29-9-29-29-9 29-9z" fill="#B7D3CF"/></svg>')}`;
window.addEventListener('error', (event) => {
  const img = event.target;
  if (img?.tagName === 'IMG' && img.src !== IMAGE_FALLBACK) {
    img.removeAttribute('srcset');
    img.src = IMAGE_FALLBACK;
  }
}, true);

loadClinicInfo().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
