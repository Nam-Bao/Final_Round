// Địa chỉ backend cho web nội bộ, đọc từ .env (VITE_*) lúc build. Để trống thì dùng máy cá nhân.
// VITE_API_URL: API Gateway (vd https://api.glowskin.vn). VITE_SOCKET_URL: service identity (Socket.IO chat, thông báo).
const trim = (u) => String(u).replace(/\/+$/, '');
export const API_BASE = trim(import.meta.env.VITE_API_URL || 'http://localhost:4000');
export const SOCKET_BASE = trim(import.meta.env.VITE_SOCKET_URL || 'http://localhost:4001');
