# Test API

Test chạy trên dữ liệu tạm (khách walk-in, lịch, hoá đơn, điểm...) và tự dọn sạch khi chạy xong.
Cần Docker (database) và các service đang chạy (gateway 4000, identity 4001, booking 4002).

| File | Nội dung | Chạy từ thư mục |
|---|---|---|
| `diem-glowskin.test.js` | Điểm GlowSkin: hủy đúng hạn đổi cọc thành điểm, hủy trễ mất cọc, trả cọc bằng điểm, phòng khám hủy hoàn bằng điểm, chống trừ trùng, phân quyền | `service-identity` |
| `khach-cu.test.js` | Quy tắc "khách cũ" (miễn cọc, miễn phí khám): chỉ tính lịch bác sĩ đã khám xong; theo hồ sơ người khám; khách đến thẳng | `service-booking` |

```
cd service-identity && node ../tests/diem-glowskin.test.js
cd service-booking  && node ../tests/khach-cu.test.js
```

Các test dùng tài khoản test `cskh.test@test.local` và chuyên gia `tuvan.dalieu@glowskin.example` có sẵn trong DB.
