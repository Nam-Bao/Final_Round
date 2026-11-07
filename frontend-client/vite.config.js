import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Website gọi API qua đường dẫn tương đối /api nên điện thoại trong cùng Wi-Fi dùng được.
// Vite chuyển tiếp về gateway và socket chat chạy trên máy này.
const proxy = {
  '/api': { target: process.env.GATEWAY_TARGET || 'http://localhost:4000', changeOrigin: true },
  '/socket.io': { target: process.env.SOCKET_TARGET || 'http://localhost:4001', changeOrigin: true, ws: true },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.CLIENT_PORT) || 3001,
    host: true,
    proxy,
  },
  preview: { host: true, proxy },
})
