<!--
vai-tro: GEN_MANAGER, ADMIN
Quy trình của quản lý chung.
-->

## Phân ca và duyệt đơn nghỉ
- Lịch làm việc: xếp ca sáng / chiều cho nhân viên; điều chỉnh giờ ca của một ngày khi cần (ghi lý do).
- Duyệt hoặc từ chối đơn xin nghỉ. Duyệt nghỉ cho bác sĩ thì các lịch khám trong ca chuyển sang "cần xếp lại lịch" cho CSKH.
- Mở ca tư vấn cho chuyên gia ở Tư vấn chuyên gia → Ca tư vấn.

## Chấm công: duyệt giải trình và ảnh khuôn mặt
- Chấm công nhân viên: duyệt / từ chối giải trình đến muộn, quên chấm, đơn về sớm. Duyệt thì không tính vi phạm.
- Ảnh chấm công bị gắn cờ không khớp: xem lại, chọn đúng người hoặc "Không phải nhân viên này" (ghi vắng, vi phạm nghiêm trọng).
- Duyệt ảnh gốc khuôn mặt nhân viên mới đăng ký. Máy chấm công: Chấm công nhân viên → Máy chấm công → kích hoạt thiết bị.

## Tính lương hàng tháng
- Lương → Bảng lương, chọn tháng. Bước Chốt công liệt kê việc còn treo (giải trình chờ duyệt, chờ nhân viên giải trình, ca chưa diễn ra); còn việc treo thì chưa tạo được bảng lương.
- Tạo bảng lương nháp: lương ca, thưởng chuyên cần 500.000đ (vi phạm 0 - 3 lần), trừ vi phạm. Thêm khoản cộng / trừ phải có lý do.
- Duyệt & khóa: nhân viên xem được phiếu lương. Chi trả xong bấm Đã chi trả lương, nhập mã lệnh chuyển; đã chi trả thì không mở khóa được.
- Mở khóa tháng chưa chi trả: ghi lý do; tháng sau đang khóa thì phải mở tháng sau trước.

## Quy tắc an toàn (chống chỉ định)
- Dịch vụ → Quy tắc an toàn. Soạn quy tắc: tình trạng khách, hoạt chất (từ khóa trong bảng thành phần) hoặc thủ thuật, mức độ, lời nhắc, ít nhất 1 nguồn y khoa.
- Bấm Kiểm tra quy tắc tương tự (AI) trước khi lưu để phát hiện quy tắc trùng hoặc mâu thuẫn; có quy tắc trùng thì sửa quy tắc cũ thay vì tạo mới.
- Gửi bác sĩ xem xét. Tất cả Đồng ý thì quản lý chung Duyệt, áp dụng ngay ở kê đơn, thu tiền, bán tại quầy. Có ý kiến Cần sửa thì không duyệt được.
- Sửa quy tắc đang áp dụng tạo phiên bản mới; bản cũ vẫn áp dụng tới khi bản mới được duyệt. Admin không tham gia duyệt.
- Hoạt chất mới có tên khác (vd retinal, retinaldehyde là dẫn xuất retinol): thêm vào từ khóa của đối tượng để bảng quy tắc nhận ra.

## Đối chiếu hoàn tiền
- Đối soát & hoàn tiền, tab Hoàn tiền chờ xác minh: khoản nhân viên ghi đã hoàn nhưng ngân hàng chưa báo tiền ra khớp.
- Quá 24 giờ: bấm Đối chiếu. Sao kê có khoản tiền ra thì chọn có (ghi chú); không thấy thì chọn Không thấy tiền ra (ghi chú ít nhất 10 ký tự), khoản bị đánh dấu Sai lệch.
- Không tự đối chiếu khoản do chính mình ghi nhận.

## Kho, vật tư, đề xuất nhập hàng
- Vật tư & Định mức: định mức vật tư cho từng dịch vụ; lịch sử xuất theo buổi.
- Đề xuất nhập hàng tự tạo khi tồn kho dưới mức tối thiểu. Duyệt (ghi nhà cung cấp, ngày dự kiến) → Đã đặt hàng → Nhận hàng (nhập số lô, hạn dùng, giá nhập). Lô đã hết hạn không cho nhập. Hoặc Từ chối.

## Khuyến mãi và mã nội bộ
- Khuyến mãi → Tạo mã: phạm vi (toàn đơn, dịch vụ, sản phẩm, gói), giá trị tối thiểu, mức giảm tối đa, số lượt.
- Hiển thị "Lưu hành nội bộ": khách không tự nhập được, chỉ nhân viên áp kèm ảnh xác thực. Lịch sử áp ở từng mã: khách, kênh, người áp, số tiền giảm, ảnh.

## Báo cáo
- Báo cáo doanh thu: khám, dịch vụ, gói, mỹ phẩm, tư vấn, cọc bị mất, hoàn tiền.
- Báo cáo Điểm GlowSkin: điểm phát ra, đã dùng, hết hạn trong kỳ; điểm đang lưu hành quy ra tiền (khoản phòng khám đang nợ khách); đơn trả bằng điểm; xuất Excel.
- Lịch sử email gửi khách: xem trạng thái, gửi lại email lỗi (trừ email mã OTP).

## Trợ lý AI và kho kiến thức
- Chatbot khách, trợ lý nhân viên và AI rà soát đơn trả lời theo kho kiến thức tự nạp từ dữ liệu hệ thống (dịch vụ, gói, sản phẩm, bài viết, chính sách, quy tắc an toàn, sổ tay quy trình) mỗi 30 phút.
- Vừa sửa giá, sản phẩm, quy tắc mà cần AI cập nhật ngay: nạp lại kho kiến thức (API POST /api/ai/knowledge/reindex).
