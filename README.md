# 🌟 Skincare O2O Platform - Hệ thống Chăm sóc da cá nhân hóa tích hợp AI

Dự án xây dựng nền tảng quản lý và kết nối dịch vụ chăm sóc da mặt (O2O - Online to Offline), kết hợp trí tuệ nhân tạo (AI) để phân tích và đưa ra phác đồ điều trị cá nhân hóa.

Dự án được xây dựng theo kiến trúc **Microservices** dưới dạng **Monorepo** (tất cả services và frontend nằm trong cùng một repository).

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

### Frontend
- **Core:** React.js, Vite
- **Styling:** TailwindCSS (v3)
- **UI Components:** 
  - `frontend-admin`: **Ant Design** (Phù hợp cho Dashboard, quản lý dữ liệu phức tạp).
  - `frontend-client`: **DaisyUI** (v4) (Giao diện hiện đại, mượt mà cho trải nghiệm khách hàng).

### Backend & Hệ thống (Dự kiến)
- **Kiến trúc:** Microservices (Node.js)
- **Database:** PostgreSQL (Dữ liệu quan hệ), MongoDB (Dữ liệu phi quan hệ/AI)
- **Message Broker:** Kafka / RabbitMQ
- **Caching:** Redis
- **DevOps:** Docker, Kubernetes

---

## 📂 Cấu trúc thư mục (ĐẶC BIỆT CHÚ Ý)

Dự án sử dụng **Cấu trúc phẳng (Flat Structure)**. **Tuyệt đối KHÔNG sử dụng thư mục `src`** bên trong các project con để đảm bảo đường dẫn import ngắn gọn và kiến trúc thống nhất.

```text
skincare-o2o-platform/
│
├── frontend-admin/             # Web App cho Bác sĩ, Quản trị viên (Ant Design)
│   ├── components/             # Các UI component dùng chung
│   ├── pages/                  # Các trang giao diện (Dashboard, Lịch hẹn...)
│   └── ... (Cấu trúc phẳng, không có src)
│
├── frontend-client/            # Web App cho Khách hàng (DaisyUI)
│   ├── components/             # Navbar, Footer, ServiceCard...
│   ├── pages/                  # Các trang (Trang chủ, Đặt lịch, Mua sắm...)
│   └── ... (Cấu trúc phẳng, không có src)
│
├── api-gateway/                # Điểm vào duy nhất (Routing, Auth Middleware, Rate limit)
│
├── service-identity/           # Microservice: Quản lý Tài khoản, Phân quyền
├── service-booking/            # Microservice: Quản lý Đặt lịch O2O
├── service-commerce/           # Microservice: Quản lý Đơn hàng, Kho dược mỹ phẩm
├── service-ai-analysis/        # Microservice: Xử lý kết quả AI 
│
├── shared/                     # Chứa các file dùng chung (gRPC protos, constants, utils)
└── devops/                     # Cấu hình Docker, Kubernetes, CI/CD
## 📂 Các bước chạy Frontend (Client & Admin)
1. Clone dự án về máy
2. Chạy Frontend Khách hàng (Client - Cổng 3001)
Mở 1 terminal mới và chạy:
npm install
npm run dev
3. Chạy Frontend Quản trị (Admin - Cổng 3000)
npm install
npm run dev