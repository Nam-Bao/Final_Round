// Địa chỉ backend cho web nội bộ, đọc từ .env (VITE_*) lúc build. Để trống thì dùng máy cá nhân.
// VITE_API_URL: API Gateway (vd https://may-chu.ten-mang.ts.net). Socket.IO (chat, thông báo) đi chung địa chỉ này
// vì gateway chuyển tiếp /socket.io sang service identity. VITE_SOCKET_URL chỉ cần khi muốn nối thẳng identity.
const trim = (u) => String(u).replace(/\/+$/, '');
export const API_BASE = trim(import.meta.env.VITE_API_URL || 'http://localhost:4000');
export const SOCKET_BASE = trim(import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL ? API_BASE : 'http://localhost:4001'));
