import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App'
import './styles/index.css'

// Tự gắn token nhân viên vào mọi request axios gửi tới API Gateway (các API quản lý đơn, khuyến mãi...
// giờ bắt buộc đăng nhập). Không gắn cho domain khác để không lộ token ra ngoài.
const GATEWAY_URL = 'http://localhost:4000';
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
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
