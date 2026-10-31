import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import { useAuthStore } from './store/authStore'
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
const GATEWAY_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
axios.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token && config.url?.startsWith(GATEWAY_URL) && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
