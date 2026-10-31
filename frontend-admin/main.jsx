import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import './styles/index.css'

// Phiên đăng nhập nhân viên lưu trong sessionStorage: đóng trình duyệt / tab là phải đăng nhập lại.
// Xoá dữ liệu đăng nhập cũ từng lưu ở localStorage.
localStorage.removeItem('admin_token');
localStorage.removeItem('admin_user');

const clearSession = () => {
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_user');
};

// Thời điểm hết hạn (ms) trong payload JWT; token hỏng coi như đã hết hạn
const getTokenExpiry = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

const goToLogin = () => {
  clearSession();
  if (window.location.pathname !== '/login') window.location.assign('/login');
};

// Hết hạn khi đang mở trang -> tự đăng xuất đúng lúc; kiểm tra lại mỗi phút (đăng nhập mới sẽ có token mới)
const checkExpiry = () => {
  const token = sessionStorage.getItem('admin_token');
  if (token && getTokenExpiry(token) <= Date.now()) goToLogin();
};
checkExpiry();
setInterval(checkExpiry, 60 * 1000);

// Server báo phiên không còn hợp lệ -> về trang đăng nhập. 403 do sai vai trò thì giữ nguyên phiên.
axios.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  const message = String(error.response?.data?.message || '');
  if (sessionStorage.getItem('admin_token') && (status === 401 || (status === 403 && /token/i.test(message)))) {
    goToLogin();
  }
  return Promise.reject(error);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
