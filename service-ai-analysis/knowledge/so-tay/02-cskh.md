<!--
vai-tro: CONSULTANT, GEN_MANAGER, ADMIN
Quy trình của Chăm sóc khách hàng (CSKH).
-->

## Tiếp nhận khách đã đặt lịch hôm nay
- Vào Không gian tư vấn, tab Khách đặt hôm nay, chọn khách.
- Hỏi khách từng câu ở khung Sàng lọc an toàn (mang thai, cho con bú, isotretinoin, thuốc chống đông, sẹo lồi...) và dị ứng, rồi bấm "Xác nhận đã hỏi khách". Phải hỏi lại mỗi lần khám. Chưa xác nhận thì nút chuyển khách vào phòng bị khóa.
- Nhập lý do khám, thói quen chăm sóc da; chụp ảnh da nếu khách đồng ý (tick đồng ý phân tích AI thì ảnh được quét AI cho bác sĩ).
- Hỏi khách có đồng ý cho AI tóm tắt hồ sơ khám không (bệnh án gửi AI đã bỏ tên, SĐT, ngày sinh, ảnh). Đồng ý thì tick "Khách đồng ý cho AI tóm tắt hồ sơ" ở khung Sàng lọc an toàn; khách rút lại thì bỏ tick. Không bắt buộc.
- Bấm Lưu hồ sơ & chuyển phòng khám: khách vào hàng chờ của bác sĩ đã đặt.

## Tiếp nhận khách đến thẳng (không đặt lịch)
- Bấm Tiếp nhận khách tại quầy, nhập số điện thoại. Chưa có thì tạo hồ sơ mới.
- Khách đến thẳng không đặt cọc. Khách mới: hóa đơn ghi sẵn phí khám 100.000đ chưa thu. Hồ sơ đã từng được bác sĩ khám xong: phí khám 0đ.
- Khách vào tab Danh sách chờ. Chọn khách, xem tình trạng bác sĩ rồi mời vào phòng; bác sĩ đang khám hoặc sắp hết ca thì có cảnh báo cần xác nhận.
- Khách bỏ về khi đang chờ: chọn khách và báo đã rời đi, không phát sinh phí.

## Khách không đến
- Lịch tại phòng khám quá giờ hẹn 15 phút mà khách chưa được tiếp nhận: chuông báo "Lịch khám quá giờ, khách chưa đến" và khung cam ở Quản lý lịch hẹn.
- Gọi khách trước. Khách không đến: Mở lịch → Khách không đến. Lịch chuyển "Khách không đến", giữ tiền cọc.
- Hệ thống không tự ghi khách không đến; chưa đủ 15 phút thì chưa có nút này.

## Hủy lịch, đổi lịch cho khách
- Khách tự đổi lịch được 1 lần khi còn ít nhất 24 giờ trước giờ khám. Các trường hợp khác CSKH đổi ở Quản lý lịch hẹn (giờ mới phải đúng ca bác sĩ và còn trống).
- Hủy theo yêu cầu khách (bên yêu cầu = Khách): trước giờ khám từ 24 giờ thì tiền cọc đổi thành Điểm GlowSkin (1 điểm = 100đ); trong vòng 24 giờ thì khách mất cọc.
- Lịch "cần xếp lại lịch" (bác sĩ nghỉ) mà khách hủy: luôn đổi cọc thành điểm.
- Phòng khám hủy (bác sĩ vắng, sự cố): Hủy lịch → bên yêu cầu Phòng khám, lý do ít nhất 10 ký tự. Lịch vào khối Chờ hoàn cọc.
- Lịch đã check-in, đang khám hoặc đã khám xong không hủy được.

## Hoàn cọc khi phòng khám hủy lịch
- Ở khối Chờ hoàn cọc, hỏi khách muốn nhận tiền hay nhận điểm.
- Nhận tiền: chuyển khoản cho khách với nội dung "HOAN <mã>", rồi bấm Đã chuyển khoản hoàn cọc và nhập mã giao dịch. Khoản này chỉ được xác minh khi ngân hàng báo tiền ra đúng mã và đúng số tiền.
- Nhận điểm: bấm Hoàn bằng điểm, khách được cộng thêm 10% (vì lỗi của phòng khám), không cần chuyển khoản.
- Cọc khách đã trả bằng điểm: hệ thống tự hoàn điểm cộng thêm 10%, không chuyển khoản tiền mặt được.
- Lịch tư vấn chuyên gia bị hủy do chuyên gia vắng: xử lý tương tự ở Tư vấn chuyên gia.

## Thu tiền và chốt hóa đơn sau khám
- Vào Thu tiền khách, chọn khách. Hóa đơn gồm phí khám, dịch vụ, gói liệu trình, mỹ phẩm bác sĩ kê.
- Số phải thu = tổng hóa đơn - voucher (nếu có) - tiền cọc đã trả. Cọc chỉ trừ một lần.
- Áp voucher: nhập mã → Áp dụng → bắt buộc tải ảnh xác thực, chưa có ảnh thì nút thu tiền bị khóa.
- Khách đã tư vấn chuyên gia online rồi đến khám: được ưu đãi bằng voucher nội bộ (mã lưu hành nội bộ, khách không tự nhập được) trên tổng hóa đơn sau khám (phí khám, dịch vụ, gói, mỹ phẩm). CSKH kiểm tra khung Lịch sử tư vấn chuyên gia ở trang Thu tiền khách, nhập mã nội bộ, chụp lịch sử tư vấn khách cho xem làm ảnh xác thực. Phí tư vấn không trừ vào phí khám.
- Thêm mục ngoài đơn bác sĩ mà mục đó Chống chỉ định với khách thì không chốt được hóa đơn.
- Thu tiền xong in phiếu thanh toán A5. Dịch vụ lẻ và buổi 1 của gói được xếp kỹ thuật viên làm ngay trong ngày; mỹ phẩm thành đơn tại quầy.

## Đối soát tiền vào
- Trang Đối soát & hoàn tiền, tab Tiền vào chưa xử lý.
- Khách chuyển thừa: lịch / đơn vẫn xác nhận, hoàn phần dư cho khách.
- Chuyển thiếu: lịch / đơn chưa xác nhận, liên hệ khách chuyển bổ sung hoặc hoàn lại.
- Tiền về sau khi lịch đã hết giữ chỗ (15 phút) hoặc đã hủy: ghi "chưa khớp", liên hệ khách để hoàn.
- Giao dịch có mã O2O / TV / SP: cột Khách hàng hiện tên, SĐT chủ lịch / đơn. Không có mã: tra tên người chuyển, mã tham chiếu.
- Hoàn tiền: bấm Xử lý → Đã hoàn tiền, nhập tài khoản nhận, mã giao dịch. Khoản vào "Hoàn tiền chờ xác minh" cho tới khi ngân hàng báo tiền ra khớp. Quá 24 giờ chưa khớp sẽ có nhãn và quản lý đối chiếu.

## Chat với khách trên website
- Bật trạng thái Sẵn sàng để nhận khách (tối đa 5 khách cùng lúc). Tắt khi bận.
- Nút robot cạnh ô nhập: AI soạn nháp câu trả lời theo giá, chính sách, sản phẩm của phòng khám, kèm nguồn. Luôn đọc lại, sửa rồi mới gửi; AI không tự gửi.
- Khách gửi ảnh da: bấm Đính kèm vào hồ sơ khám để bác sĩ thấy. Chỉ nhận ảnh và PDF.
- Đóng phiên khi xong. Ngoài giờ 08:00 - 17:00 khách chỉ chat được với chatbot AI.

## Gọi chăm sóc khách
- Trang Gọi chăm sóc khách có 3 loại cuộc gọi: nhắc lịch hẹn, nhắc tái khám, thăm hỏi sau khám.
- Gọi xong ghi kết quả: Đến được, Không đến được, Đã đổi lịch, Đã hủy (với cuộc nhắc lịch / tái khám), Đã thăm hỏi (thăm hỏi sau khám), hoặc Không nghe máy; kèm ghi chú.
- Thăm hỏi sau khám: ghi thêm tình trạng da (Cải thiện rõ, Cải thiện ít, Không thay đổi, Nặng hơn), việc dùng thuốc theo đơn, mức hài lòng, triệu chứng và khách có phàn nàn không. Da nặng hơn hoặc khách phàn nàn thì bắt buộc ghi rõ lý do, cuộc gọi được gắn nhãn "Cần lưu ý" trong tab Lịch sử cuộc gọi.

## Điểm GlowSkin của khách
- Xem số dư điểm của khách khi tư vấn, thu tiền (khung điểm trong hồ sơ khách).
- 1 điểm = 100đ. Điểm dùng trả cọc khám, phí tư vấn, mua mỹ phẩm theo giá niêm yết (không áp giá khuyến mãi, không kèm voucher). Không đổi ra tiền mặt.
- Mỗi lần cộng điểm có hạn 12 tháng; điểm sắp hết hạn được dùng trước; khách nhận email báo trước 30 ngày.
