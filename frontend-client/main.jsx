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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
