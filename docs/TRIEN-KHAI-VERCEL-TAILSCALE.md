# Triển khai: frontend trên Vercel, backend chạy ở máy qua Tailscale Funnel

```
Trình duyệt ──https──> Vercel (web khách, web nội bộ)                    *.vercel.app
     │
     └──https / wss──> Tailscale Funnel ──> máy chạy backend, cổng 4000 (API Gateway)
                       https://<tên máy>.<tên mạng>.ts.net
                                             ├─ /api/...      -> các service 4001..4005
                                             └─ /socket.io    -> service identity (chat, thông báo)
```

Không cần mua tên miền: Vercel cấp `*.vercel.app`, Tailscale cấp `*.ts.net` (cố định, có HTTPS).
Chỉ mở **một cổng 4000**; gateway tự chuyển Socket.IO sang service identity.

Máy chạy backend phải bật: Docker (database), 6 service (gateway, identity, booking, commerce, ai-analysis, media) và Tailscale.

## 1. Tailscale Funnel
1. Cài: `winget install Tailscale.Tailscale`, mở Tailscale và đăng nhập (Google / GitHub / Microsoft).
2. (Tùy chọn) Đổi tên máy cho dễ đọc ở https://login.tailscale.com/admin/machines, vd `glowskin`. Tên máy nằm trong địa chỉ công khai.
3. Mở Funnel cho cổng 4000 (PowerShell):
   ```
   tailscale funnel --bg 4000
   ```
   Lần đầu lệnh in ra link để bật HTTPS và Funnel cho tài khoản, mở link, bấm đồng ý rồi chạy lại lệnh.
   `--bg`: chạy nền, tự bật lại khi khởi động máy.
4. Xem địa chỉ: `tailscale funnel status`, dạng `https://glowskin.tail1234.ts.net`.
5. Thử: mở `https://glowskin.tail1234.ts.net/` phải thấy `O2O API Gateway đang hoạt động`.
6. Tắt: `tailscale funnel reset`.

## 2. Biến môi trường backend (trên máy chạy backend)

| File | Biến |
|---|---|
| `api-gateway/.env` | `CORS_ORIGINS=https://<web khách>.vercel.app,https://<web nội bộ>.vercel.app` |
| `service-identity/.env` | `CORS_ORIGINS=` (giống trên), `CLIENT_URL=https://<web khách>.vercel.app` (link trong email) |

Không có dấu `/` ở cuối địa chỉ. Giữ nguyên `GATEWAY_URL`, `IDENTITY_URL`... là `localhost` vì các service vẫn gọi nhau trong máy.
Sửa `.env` xong thì khởi động lại gateway và identity.

## 3. Vercel (2 project từ cùng repo GitHub)
Vào https://vercel.com → Add New → Project → chọn repo, làm 2 lần:

| | Web khách | Web nội bộ |
|---|---|---|
| Root Directory | `frontend-client` | `frontend-admin` |
| Framework Preset | Vite | Vite |
| Production Branch (Settings → Git) | `main` | `main` |

Biến môi trường (Settings → Environment Variables):

| Biến | Web khách | Web nội bộ |
|---|---|---|
| `VITE_API_URL` | `https://glowskin.tail1234.ts.net` | `https://glowskin.tail1234.ts.net` |
| `VITE_CLIENT_URL` | | `https://<web khách>.vercel.app` |
| Các biến `VITE_` khác | chép từ `frontend-client/.env` (ngân hàng, địa chỉ phòng khám) | chép từ `frontend-admin/.env` |

`VITE_SOCKET_URL` để trống: socket đi chung địa chỉ `VITE_API_URL`.
Vite gắn biến lúc build, nên **sửa biến xong phải Redeploy** (Deployments → ... → Redeploy).
File `vercel.json` trong mỗi thư mục giúp tải lại trang con (vd `/appointments`) không bị 404.

## 4. Webhook (nay gọi được thật)
- SePay, cọc lịch khám: `https://glowskin.tail1234.ts.net/api/booking/appointments/sepay-webhook`
- SePay, đơn mỹ phẩm: `https://glowskin.tail1234.ts.net/api/commerce/orders/sepay-webhook`
- GHN: `https://glowskin.tail1234.ts.net/api/commerce/orders/ghn-webhook`

## 5. Kiểm tra sau khi đưa lên
1. Web khách: xem dịch vụ, đăng nhập, đặt lịch, mở chat CSKH (Socket.IO).
2. Web nội bộ: đăng nhập, chuông thông báo có số việc, chấm công bằng camera (đã có https).
3. F12 → Console không có lỗi CORS. Có lỗi thì xem lại `CORS_ORIGINS` (đúng địa chỉ Vercel, không có `/` cuối) và đã khởi động lại gateway, identity chưa.

## 6. Cập nhật code sau này
- **Frontend**: commit + push lên `main` → Vercel tự build lại (1 - 2 phút). Push nhánh khác (vd `nam`) → Vercel tạo bản xem thử có địa chỉ riêng, không đụng bản chính.
- **Backend**: code chạy ngay trên máy này. Kéo code mới về (`git pull`) rồi khởi động lại service. Sửa code trên máy là bản đang chạy cho mọi người đổi theo sau khi khởi động lại, nên thử trên nhánh / bộ e2e trước.
- Đổi frontend và backend cùng lúc (vd thêm API mới): khởi động lại backend trước, rồi mới push frontend.

## 7. Chuyển backend sang nơi khác sau này
Code không phải sửa. Dựng backend ở nơi mới (VPS, Railway, Render...), chép dữ liệu (`pg_dump` 4 database Postgres, `mongodump` MongoDB),
đặt biến như mục 2, rồi đổi `VITE_API_URL` trên Vercel sang địa chỉ mới → Redeploy, và khai lại địa chỉ webhook SePay / GHN.
