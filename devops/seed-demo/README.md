# Dữ liệu demo GlowSkin

Tạo dữ liệu 3 tháng gần nhất theo đúng quy trình nghiệp vụ, phục vụ demo và kiểm thử. Dữ liệu cũ được giữ nguyên, chỉ thêm mới.

## Nội dung

| Nhóm | Dữ liệu |
|---|---|
| Khách hàng | 80 tài khoản, 6 hồ sơ người thân, sàng lọc an toàn |
| Khám bệnh | Khám mới, tái khám, khám online, khách đến thẳng, hủy lịch, không đến, chờ hoàn cọc, chờ đổi lịch do bác sĩ nghỉ |
| Hóa đơn | Cọc VietQR, chốt hóa đơn, trừ cọc tư vấn chuyên gia, giao dịch ngân hàng đã khớp và 2 khoản chưa khớp |
| Liệu trình | Gói trị mụn, mờ nám, phục hồi da; buổi đã làm, buổi sắp tới; ghi vật tư theo định mức |
| Tư vấn chuyên gia | Hoàn thành có kết quả, khách vắng, chuyên gia vắng (đã hoàn cọc), lịch sắp tới; thù lao đã chi trả |
| Mỹ phẩm | Đơn online đủ trạng thái, đơn tại quầy, hủy đơn, hoàn trả (đã hoàn tiền, từ chối, đang chờ), đánh giá |
| Kho | Vật tư mới, lô hàng, định mức, đề xuất nhập đã nhận và đề xuất chờ duyệt |
| Nhân sự | Ca làm 3 tháng, chấm công (đúng giờ, trễ, giải trình, về sớm, vắng), đơn xin nghỉ, bảng lương tháng 8, 9 đã chi trả, tháng 10 chờ chi trả |
| CSKH | Lịch cần gọi nhắc, tái khám, thăm hỏi sau khám, nhật ký cuộc gọi |
| Website | 4 bài viết, 1 bài bác sĩ chờ duyệt |

## Tài khoản

Tài khoản mới đều có mật khẩu `Demo@123`, email đuôi `@glowskin.demo`. Tài khoản nhân viên cũ giữ nguyên mật khẩu.

- Nhân viên mới: `bacsi3@glowskin.demo` (bác sĩ), `ktv2@glowskin.demo` (kỹ thuật viên), `chuyengia2@glowskin.demo` (chuyên gia mỹ phẩm)
- Khách hàng: xem danh sách trong `output/plan-real.json` (`plan.identity.Users`)

## Chạy

Cần Docker đang chạy. Các bước 1 - 3 chạy được với service đang tắt; bước 4 cần backend đang chạy.

```bash
# 1. Lập kế hoạch (chỉ đọc database)
cd devops/seed-demo && node plan.js real

# 2. Ghi vào từng service (mỗi service 1 transaction, lỗi thì hoàn tác)
cd service-identity && node -r dotenv/config ../devops/seed-demo/write.js identity real
cd service-booking  && node -r dotenv/config ../devops/seed-demo/write.js booking real
cd service-commerce && node -r dotenv/config ../devops/seed-demo/write.js commerce real
cd service-media    && node -r dotenv/config ../devops/seed-demo/write.js media real

# 3. Tạo bảng lương các tháng đã qua qua API của hệ thống
cd service-booking && node -r dotenv/config ../devops/seed-demo/payroll.js real http://localhost:4000

# 4. Kiểm tra các màn hình chính
cd service-booking && node -r dotenv/config ../devops/seed-demo/verify.js real http://localhost:4000
```

`plan.js` dừng nếu database đã có dữ liệu demo, nên không tạo trùng.

## Xóa dữ liệu demo

```bash
cd service-media    && node -r dotenv/config ../devops/seed-demo/remove.js media real
cd service-commerce && node -r dotenv/config ../devops/seed-demo/remove.js commerce real
cd service-booking  && node -r dotenv/config ../devops/seed-demo/remove.js booking real
cd service-identity && node -r dotenv/config ../devops/seed-demo/remove.js identity real
```

Chỉ xóa đúng các dòng có trong `output/created-real.json`. Bản sao lưu trước khi tạo dữ liệu nằm trong `output/backup/`.

Thư mục `output/` không đưa lên git vì chứa thông tin tài khoản và bản sao lưu database.
