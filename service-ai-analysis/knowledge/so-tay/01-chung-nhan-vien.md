<!--
vai-tro: ALL
Sổ tay quy trình nội bộ (trợ lý hỏi đáp cho nhân viên). Mỗi mục "## " là 1 đoạn tra cứu. Dòng vai-tro: ai được xem
(ALL = mọi nhân viên; hoặc danh sách: CONSULTANT, DOCTOR, TECHNICIAN, SALES, EXPERT, GEN_MANAGER, ADMIN).
Số liệu phải khớp code (service-booking/utils/timing.js, attendanceRules.js). Sửa quy trình thì sửa cả ở đây.
-->

## Ca làm việc và chấm công bằng mã QR
- Ca sáng 08:00 - 12:00, ca chiều 13:00 - 17:00. Quản lý có thể điều chỉnh giờ ca của một ngày (sự kiện, tăng ca); khi đó giờ mới hiện trong lịch.
- Máy chấm công đặt tại phòng khám hiện mã QR, mỗi mã chỉ dùng được trong 20 giây và một lần.
- Vào ca: mở trang Chấm công trên điện thoại, quét mã từ 20 phút trước đến 10 phút sau giờ vào ca, rồi chụp ảnh khuôn mặt trong 2 phút sau khi quét.
- Ra ca: quét mã ra ca từ giờ kết thúc ca tới 30 phút sau.
- Quét mã đã quá 20 giây: báo mã hết hạn, bấm hiện mã mới. Quét khi không có ca đang mở: báo không có ca.
- Ảnh khuôn mặt được so với ảnh gốc đã được quản lý duyệt. Không khớp thì vẫn ghi nhận nhưng gắn cờ để quản lý xem lại; nếu quản lý xác định không phải nhân viên đó thì ca bị tính vắng và vi phạm nghiêm trọng.

## Đến muộn, quên chấm công, giải trình
- Quét mã sau giờ vào ca (trong 10 phút khung còn mở) là đến trễ, hệ thống ghi số phút trễ và tính vi phạm.
- Quá 10 phút sau giờ vào ca thì khung quét mã đã đóng, không chấm công tại máy được nữa: gửi giải trình ở trang Chấm công của tôi, nhập giờ có mặt thực tế (sau khi khung đóng, trong vòng 24 giờ sau khi hết ca).
- Đã có mặt trước khi khung đóng mà chưa quét được (quên, máy lỗi): chọn lý do "quên chấm công" hoặc "lỗi hệ thống". Mô tả giải trình cần ít nhất 80 ký tự, 15 từ, nêu rõ chuyện gì, lúc nào, ở đâu, và tick cam kết đúng sự thật. Mỗi ca chỉ giải trình một lần.
- Lý do giải trình: sự cố giao thông; sức khỏe (cần ảnh minh chứng); việc gia đình khẩn cấp; được giao việc khác (cần người xác nhận); có mặt đúng giờ nhưng quên chấm công (cần người xác nhận); lỗi hệ thống / máy chấm công (cần ảnh và người xác nhận); lý do khác (cần ảnh).
- Quản lý duyệt thì không tính vi phạm; từ chối thì giữ vi phạm và tính vào lương.
- Hết ca không chấm công và không giải trình trong 24 giờ: hệ thống tự ghi vắng.
- Quên chấm ra ca: gửi giải trình "quên chấm ra ca" trong 24 giờ để quản lý duyệt.

## Xin về sớm
- Gửi đơn xin về sớm ở trang Chấm công của tôi trước khi về, chọn lý do: sức khỏe, việc gia đình khẩn cấp, được giao việc bên ngoài, việc cá nhân, lý do khác.
- Gửi đơn xong quét mã ra ca được ngay. Quản lý duyệt thì không tính vi phạm về sớm.

## Đăng ký ảnh gốc khuôn mặt
- Vào Chấm công → đăng ký 3 ảnh khuôn mặt của chính mình và đồng ý cho xử lý dữ liệu khuôn mặt. Thiếu đồng ý, thiếu ảnh hoặc 3 ảnh không cùng một người thì bị từ chối.
- Ảnh hợp lệ ở trạng thái chờ duyệt; quản lý duyệt xong mới dùng để so khi chấm công.
- Rút lại đồng ý bất cứ lúc nào: ảnh gốc bị xóa, trạng thái về "chưa có ảnh gốc".
- Ảnh chỉ xử lý trên máy chủ của phòng khám, không gửi ra dịch vụ bên ngoài.

## Lịch làm việc, xin nghỉ
- Xem ca được phân ở Lịch làm việc của tôi.
- Xin nghỉ: gửi đơn nghỉ kèm lý do ở Lịch làm việc của tôi, quản lý duyệt hoặc từ chối.
- Bác sĩ nghỉ đột xuất được duyệt: các lịch khám trong ca đó chuyển sang "cần xếp lại lịch" để CSKH dời giờ cho khách.

## Lương và phiếu lương
- Lương tính theo ca đã làm (mức lương / ca do quản lý cài), cộng thưởng chuyên cần 500.000đ / tháng nếu tổng vi phạm trong tháng từ 0 đến 3 lần, trừ vi phạm, cộng / trừ các khoản quản lý ghi kèm lý do.
- Quản lý chốt công cuối tháng, tạo bảng lương, duyệt và khóa. Sau khi khóa, nhân viên xem phiếu lương ở trang Phiếu lương.
- Thắc mắc về lương: liên hệ quản lý chung (hệ thống chưa có quy trình khiếu nại lương).

## Chuông việc cần xử lý, đăng nhập
- Chuông góc trên hiện các việc đang chờ theo vai trò (đơn chờ duyệt, khách chờ thu tiền, hoàn cọc, quy tắc chờ xem xét...). Số việc tự giảm ở mọi máy khi có người xử lý xong.
- Phiên đăng nhập hết hạn sau 8 giờ, phải đăng nhập lại. Đăng nhập sai quá 10 lần trong 15 phút bị chặn tạm.
- Tài khoản khách không đăng nhập được trang nội bộ.

## Bảo mật dữ liệu khách
- Chỉ xem hồ sơ, ảnh của khách khi cần cho công việc của mình. Không chụp màn hình, không gửi dữ liệu khách qua kênh cá nhân.
- Kết quả soi da bằng AI chỉ để tham khảo, bác sĩ là người xác nhận.
- Chatbot trên web chỉ xem lịch hẹn / điểm / đơn hàng của khách khi khách bấm đồng ý trong phiên chat.
