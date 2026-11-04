import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// npm run dev        : http://localhost:3000 như bình thường
// npm run dev:mobile : https://<IP Wi-Fi của máy tính>:3443 cho điện thoại cùng Wi-Fi (camera chỉ chạy trên https).
//                      Chạy song song với npm run dev được (máy tính vẫn dùng http://localhost:3000).
//                      Lần đầu trình duyệt báo chứng chỉ tự ký => chọn "Nâng cao" -> "Tiếp tục".
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'mobile' ? [basicSsl()] : [])],
  server: {
    port: 3000, // Chạy Admin ở port 3000
    // Điện thoại gọi /api cùng địa chỉ trang => chuyển tiếp sang API Gateway trên máy tính
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
}))
