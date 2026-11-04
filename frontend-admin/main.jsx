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

// Tự gắn token nhân viên (sessionStorage) vào mọi request axios gửi tới API Gateway (các API quản lý đơn, khuyến mãi...
// giờ bắt buộc đăng nhập). Không gắn cho domain khác để không lộ token ra ngoài.
const GATEWAY_URL = 'http://localhost:4000';
// Mở admin từ điện thoại trong mạng LAN (npm run dev:mobile, để chấm công bằng camera): "localhost" trên điện thoại
// là chính điện thoại => gọi API cùng địa chỉ trang, Vite chuyển tiếp /api sang gateway (xem vite.config.js)
const viaDevProxy = !['localhost', '127.0.0.1'].includes(window.location.hostname);
const toProxy = (url) => (viaDevProxy && typeof url === 'string' && url.startsWith(GATEWAY_URL) ? url.slice(GATEWAY_URL.length) : url);

axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('admin_token');
  if (token && config.url?.startsWith(GATEWAY_URL) && !config.headers?.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.url = toProxy(config.url);
  return config;
});
if (viaDevProxy) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => nativeFetch(toProxy(input), init);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
