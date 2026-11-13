# Sơ đồ BPMN nghiệp vụ GlowSkin

Các file `.bpmn` theo chuẩn BPMN 2.0, ảnh xuất sẵn nằm trong thư mục `png/`.
Mở và chỉnh sửa bằng https://demo.bpmn.io (kéo thả file vào trang) hoặc Camunda Modeler.

## Danh sách sơ đồ

| Số | Quy trình |
|---|---|
| 01 | Đặt lịch khám online và thanh toán cọc |
| 02 | Hủy, đổi lịch và khách không đến |
| 03 | Tiếp nhận và khám tại phòng khám |
| 04 | Tư vấn chuyên gia online |
| 05 | Mua mỹ phẩm online |
| 06 | Hủy đơn mỹ phẩm |
| 07 | Hoàn / trả hàng |
| 08 | Chấm công nhân viên |
| 09 | Tính lương hàng tháng |
| 10 | Xuất vật tư và nhập kho |
| 11 | Quản lý quy tắc an toàn (chống chỉ định): quản lý soạn hoặc bác sĩ đề xuất, bác sĩ xem xét, quản lý chung duyệt; sửa / ngưng theo phiên bản |

## Vai trò

| Vai trò | Công việc |
|---|---|
| Khách hàng | Đặt lịch, thanh toán, mua hàng, xem kết quả |
| CSKH | Tiếp nhận khách, quản lý lịch hẹn, thu tiền, đối soát tiền vào |
| Bác sĩ | Khám, chẩn đoán, kê đơn; xem xét và đề xuất quy tắc an toàn |
| Chuyên gia | Tư vấn online, gợi ý sản phẩm. Không khám, không kê thuốc |
| Kỹ thuật viên | Làm dịch vụ, ghi vật tư đã dùng |
| Nhân viên bán hàng | Duyệt, đóng gói, hủy đơn mỹ phẩm, xử lý hoàn trả |
| Quản lý | Mở ca, duyệt đề xuất, duyệt giải trình, tính lương |
| Hệ thống | Các bước tự động của phần mềm |

SePay, Giao Hàng Nhanh và nhà cung cấp là bên ngoài hệ thống nên vẽ thành pool riêng, nối bằng message flow nét đứt.

## Ký hiệu

| Ký hiệu | Ý nghĩa |
|---|---|
| Hình người | Việc do người thực hiện |
| Bánh răng | Việc do hệ thống tự thực hiện |
| Hình thoi có dấu X | Rẽ nhánh theo điều kiện, chỉ đi một nhánh |
| Hình thoi có ngũ giác | Cổng sự kiện: chờ xem sự kiện nào xảy ra trước |
| Vòng tròn có phong bì | Nhận thông báo từ bên ngoài |
| Vòng tròn có đồng hồ | Sự kiện theo thời gian |
| Vòng tròn có trang giấy | Chờ một điều kiện đúng |

## Phạm vi chưa có trong hệ thống

Các nội dung sau chưa được xây dựng nên không có trong sơ đồ, nên ghi ở mục hướng phát triển:

- Đối soát tiền thu hộ COD với GHN.
- Gửi trả lại khách hàng không hợp lệ sau khi đã từ chối hoàn trả.
- Vai trò thủ kho riêng.
- Hóa đơn bổ sung cho dịch vụ phát sinh sau khi đã chốt hóa đơn.
- Khiếu nại lương.
- Cộng dồn khi khách chuyển bù phần tiền còn thiếu.
- Hủy đơn đang giao thì chờ hàng về rồi mới cộng kho.
