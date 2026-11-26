<!--
Bản văn bản của trang Chính sách (frontend-client/pages/PolicyPage.jsx) để chatbot tra cứu (RAG).
Sửa chính sách ở trang web thì sửa cả ở đây. Các giá trị trong {{...}} được điền lúc nạp kho từ cấu hình đang chạy
(/api/booking/config/timing, /api/booking/points/config, /api/commerce/returns/policy), không viết cứng.
Mỗi mục "## " là 1 đoạn trong kho; chatbot trích dẫn theo tên mục.
-->

## 1. Đặt lịch khám và tiền cọc
1.1. Đến thẳng phòng khám không cần đặt trước: CSKH tiếp nhận theo số điện thoại, khách chờ và được mời vào phòng khi bác sĩ khám xong. Khách đã đặt lịch được ưu tiên đúng giờ hẹn. Khách đến thẳng không cần đặt cọc, phí khám {{EXAM_FEE}} thanh toán sau khi khám; hồ sơ đã từng khám được miễn phí khám.
1.2. Phí khám bác sĩ là {{EXAM_FEE}} mỗi lần. Mỗi lịch khám gắn với một hồ sơ người khám thuộc tài khoản (bản thân hoặc người thân).
1.3. Khám tại phòng khám: đặt cọc {{OFFLINE_DEPOSIT}}. Tiền cọc được trừ vào phí khám khi thanh toán hóa đơn sau buổi khám.
1.4. Khám trực tuyến: thanh toán trước toàn bộ phí khám {{EXAM_FEE}}.
1.5. Hồ sơ đã từng được bác sĩ khám xong được miễn tiền cọc và miễn phí khám. Ưu đãi xét theo từng hồ sơ người khám: người thân khám lần đầu vẫn phải đặt cọc.
1.6. Sau khi bấm đặt lịch, khung giờ được giữ trong {{HOLD}} để chuyển khoản. Quá thời gian này hoặc rời trang thanh toán mà chưa trả tiền, lịch bị hủy và khung giờ được trả lại.
1.7. Chuyển thừa: lịch vẫn được xác nhận và CSKH hoàn phần dư. Chuyển thiếu: lịch chưa được xác nhận, khách liên hệ CSKH.
1.8. Thanh toán cọc bằng chuyển khoản VietQR (hệ thống tự xác nhận khi nhận được tiền), tiền mặt tại quầy, hoặc bằng Điểm GlowSkin.
1.9. Giờ khám bác sĩ: sáng 08:00 - 11:30, chiều 13:00 - 16:30, mỗi lượt khám 30 phút. Chỉ đặt được giờ trong tương lai, đúng ca làm của bác sĩ và chưa có người đặt.

## 2. Hủy, đổi lịch khám
2.1. Khách tự hủy được lịch chưa khám (chờ xác nhận, đã xác nhận, cần xếp lại lịch) trong mục Sổ lịch khám.
2.2. Hủy lịch đã đặt cọc trước giờ khám ít nhất {{RESCHEDULE}}: tiền cọc được đổi thành Điểm GlowSkin ({{POINT_RATE}}).
2.3. Hủy trong vòng {{RESCHEDULE}} trước giờ khám thì mất 100% tiền cọc. Lịch khám trực tuyến thì mất toàn bộ phí khám {{EXAM_FEE}} đã trả trước.
2.4. Phòng khám chủ động hủy lịch (bác sĩ vắng, sự cố): khách được hoàn 100% tiền cọc, chọn nhận lại tiền qua chuyển khoản hoặc nhận Điểm GlowSkin cộng thêm {{CLINIC_BONUS}}. Cọc đã trả bằng điểm được tự hoàn bằng điểm cộng thêm {{CLINIC_BONUS}}.
2.5. Lịch đã check-in, đang khám hoặc đã khám xong không thể hủy.
2.6. Đổi lịch: trước giờ khám ít nhất {{RESCHEDULE}}, khách tự đổi ngày giờ 1 lần, không mất cọc. Các trường hợp khác do CSKH đổi.
2.7. Sau giờ hẹn 15 phút mà khách không đến, phòng khám ghi nhận khách không đến và khách mất tiền cọc.

## 3. Khám trực tuyến
3.1. Phòng khám video mở từ đúng giờ hẹn và đóng sau 2 giờ kể từ giờ hẹn. Chỉ khách và bác sĩ phụ trách được vào phòng.
3.2. Cần nơi đủ sáng, mạng ổn định và cho phép trình duyệt dùng camera, micro.
3.3. Bác sĩ chỉ tư vấn dựa trên thông tin và hình ảnh trong buổi khám; trường hợp cần soi da, làm thủ thuật sẽ được hẹn khám tại phòng khám.

## 4. Thanh toán sau buổi khám
4.1. Hóa đơn sau khám gồm phí khám, dịch vụ, gói liệu trình, mỹ phẩm khách đồng ý sử dụng, theo bảng giá hiện hành.
4.2. Số tiền cần trả = tổng hóa đơn - voucher (nếu có) - tiền cọc đã trả. Tiền cọc chỉ được trừ một lần.
4.3. Mỹ phẩm mua tại quầy được ghi thành đơn hàng trong mục Đơn hàng mỹ phẩm của khách.
4.4. Dịch vụ lẻ và buổi đầu tiên của gói liệu trình được thực hiện ngay trong ngày thanh toán.

## 5. Gói liệu trình
5.1. Gói liệu trình chỉ được bán sau khi bác sĩ khám và chỉ định. Khách xem trước các gói ở trang Gói liệu trình.
5.2. Giá gói áp dụng giá ưu đãi (nếu có) tại thời điểm thanh toán. Mỗi gói có số buổi, khoảng cách tối thiểu giữa các buổi và thời hạn sử dụng tính từ ngày mua; gói hết hạn thì không đặt thêm buổi.
5.3. Buổi 1 làm ngay ngày mua. Các buổi sau khách tự đặt trong mục Gói liệu trình của tôi: cách buổi trước ít nhất số ngày quy định, đặt trước tối đa 30 ngày, không quá ngày hết hạn, chỉ có một buổi chưa thực hiện tại một thời điểm.
5.4. Khách hủy được buổi đã đặt khi buổi chưa bắt đầu và chưa qua ngày hẹn. Các buổi dùng cho đúng hồ sơ người khám, không chuyển cho người khác.

## 6. Mua hàng và giao hàng
6.1. Thuốc kê đơn không bán trên website, chỉ được bác sĩ kê trong buổi khám và bán tại quầy theo đơn.
6.2. Thanh toán: khi nhận hàng (COD), chuyển khoản VietQR, hoặc Điểm GlowSkin. Đơn chuyển khoản chỉ được duyệt sau khi hệ thống nhận được tiền.
6.3. Trả bằng Điểm GlowSkin: phải đủ điểm cho cả đơn, tính theo giá niêm yết (không áp giá khuyến mãi) cộng phí vận chuyển, làm tròn lên; không dùng kèm voucher. {{POINT_RATE}}.
6.4. Phí vận chuyển do Giao Hàng Nhanh (GHN) tính theo địa chỉ và cân nặng. Đơn COD: shipper thu tiền hàng sau giảm giá cộng phí vận chuyển.
6.5. Đơn hàng đi qua các bước: Chờ duyệt, Đã duyệt, Đang đóng gói, Đang giao, Đã nhận. Mã vận đơn GHN có khi đơn chuyển sang Đang giao.
6.6. Khi nhận hàng được kiểm tra hàng nhưng không được dùng thử; nên quay video lúc mở hộp.

## 7. Hủy đơn hàng
7.1. Khách tự hủy được đơn giao hàng trên website (mục Đơn hàng mỹ phẩm) khi đơn chưa giao cho đơn vị vận chuyển. Đơn đã giao cho GHN thì liên hệ hotline hoặc nhân viên bán hàng.
7.2. Tự hủy đơn đã chuyển khoản: chọn hoàn tiền về tài khoản (CSKH chuyển khoản) hoặc hoàn Điểm GlowSkin tương đương ({{POINT_RATE}}, nhận ngay, không cộng thêm). Đơn trả bằng điểm bị hủy thì được hoàn lại điểm.
7.3. Đơn chuyển khoản không thanh toán trong 15 phút sẽ tự hủy, sản phẩm trả lại kho và voucher được trả lại lượt.
7.4. Voucher được trả lại lượt nếu việc hủy không do khách (quá hạn thanh toán, phòng khám hủy, đơn vị vận chuyển hủy). Khách yêu cầu hủy hoặc không nhận hàng thì không được trả lại lượt.

## 8. Hoàn / trả hàng
8.1. Áp dụng cho đơn giao qua GHN đã nhận hàng, gửi yêu cầu trong {{RETURN_DAYS}} ngày kể từ khi đơn chuyển sang Đã nhận. Đơn mua tại quầy thì mang sản phẩm đến phòng khám.
8.2. Chỉ chấp nhận các lý do: {{RETURN_REASONS}}. Không nhận trả hàng vì đổi ý.
8.3. Hồ sơ yêu cầu: chọn sản phẩm và số lượng trả, mô tả tình trạng ít nhất 20 ký tự, 1 - {{RETURN_MAX_IMAGES}} ảnh, chọn cách xử lý. Chọn hoàn tiền thì khai tài khoản ngân hàng (đơn trả bằng điểm được hoàn điểm, không cần tài khoản).
8.4. Cách xử lý mặc định là đổi sản phẩm. Sản phẩm hết hàng thì đổi sang sản phẩm khác có giá trị không vượt giá trị hàng trả, phần chênh lệch được cộng thành Điểm GlowSkin; hoặc hoàn tiền nếu khách đồng ý.
8.5. {{SALE_RULE}}. {{SALE_OUT_OF_STOCK_RULE}}.
8.6. Sản phẩm trả phải còn đủ hộp, tem, phụ kiện và chưa qua sử dụng (trừ lỗi chỉ phát hiện khi mở). Mỗi đơn chỉ yêu cầu hoàn trả một lần.
8.7. Quy trình: nhân viên duyệt hồ sơ trong 24 giờ làm việc, GHN đến lấy hàng (GlowSkin trả phí vận chuyển), kho kiểm tra, rồi giao sản phẩm đổi hoặc hoàn tiền.
8.8. Số tiền hoàn = giá các sản phẩm trả lại trừ phần voucher đã giảm tương ứng. Trả lại toàn bộ đơn thì được hoàn thêm phí vận chuyển ban đầu.

## 9. Voucher khuyến mãi
9.1. Mỗi đơn hàng / hóa đơn chỉ áp dụng một mã; mỗi khách chỉ dùng mỗi mã một lần.
9.2. Mã phải còn thời gian áp dụng và còn lượt. Mỗi mã có phạm vi riêng (toàn bộ đơn, dịch vụ spa, sản phẩm hoặc gói liệu trình) và có thể có giá trị đơn tối thiểu, mức giảm tối đa.
9.3. Voucher không cộng dồn với giá khuyến mãi online và không trừ vào phí vận chuyển.

## 10. Tư vấn chuyên gia
10.1. Mỗi buổi tư vấn online kéo dài 45 phút, phòng tư vấn đóng khi hết thời gian.
10.2. Phí mỗi buổi tư vấn là {{CONSULT_FEE}}, thanh toán trước khi xác nhận lịch (VietQR hoặc Điểm GlowSkin), không trừ vào phí khám.
10.3. Buổi tư vấn hoàn thành khi cả khách và chuyên gia vào phòng và chuyên gia gửi kết quả, chậm nhất {{CONSULT_RESULT}} sau khi phòng đóng.
10.4. Khách không vào phòng thì không được hoàn phí. Chuyên gia vắng hoặc không gửi kết quả đúng hạn thì khách được hoàn phí 100% (phí trả bằng điểm được hoàn điểm cộng thêm {{CLINIC_BONUS}}).
10.5. Trước giờ hẹn ít nhất {{RESCHEDULE}}, khách tự đổi lịch 1 lần miễn phí; tự hủy trước mốc này thì phí đổi thành Điểm GlowSkin; hủy trong vòng {{RESCHEDULE}} thì không được hoàn phí.
10.6. Muốn đi khám sau buổi tư vấn: cho nhân viên quầy xem lịch sử tư vấn để được áp voucher ưu đãi trên hóa đơn sau khám. Chuyên gia không kê thuốc, sản phẩm gợi ý chỉ để tham khảo.

## 11. Điểm GlowSkin
11.1. {{POINT_RATE}}. Điểm dùng để trả cọc lịch khám, phí tư vấn chuyên gia, hoặc mua mỹ phẩm theo giá niêm yết. Điểm không đổi ra tiền mặt, không chuyển cho người khác.
11.2. Khách nhận điểm khi: hủy lịch khám hoặc lịch tư vấn đúng hạn (cọc đổi thành điểm), phòng khám hủy lịch và khách chọn nhận điểm (cộng thêm {{CLINIC_BONUS}}), tự hủy đơn đã chuyển khoản và chọn hoàn điểm, trả hàng đơn mua bằng điểm, đổi sang sản phẩm rẻ hơn (phần chênh lệch).
11.3. Mỗi lần được cộng, điểm có hạn dùng {{POINT_EXPIRE}} tháng. Khi dùng, điểm sắp hết hạn được trừ trước. Điểm quá hạn bị trừ tự động; hệ thống gửi email báo trước 30 ngày.
11.4. Khách xem số dư, lịch sử và hạn dùng của điểm ở trang Hồ sơ cá nhân.

## 12. Đánh giá
12.1. Chỉ khách đã sử dụng mới được đánh giá: sản phẩm sau khi đơn Đã nhận; bác sĩ sau buổi khám hoàn tất; dịch vụ sau khi buổi đó hoàn thành; chuyên gia sau buổi tư vấn hoàn thành.
12.2. Mỗi mục được đánh giá một lần, 1 - 5 sao, nhận xét tối đa 1000 ký tự.

## 13. Bảo mật và dữ liệu cá nhân
13.1. Dữ liệu thu thập: thông tin tài khoản, hồ sơ người khám, lịch sử khám, địa chỉ giao hàng, ảnh da tải lên. Dùng để đặt lịch, khám, giao hàng, thanh toán, chăm sóc sau điều trị; không dùng cho quảng cáo của bên thứ ba.
13.2. Kết quả sàng lọc da bằng AI chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ. Mỗi tài khoản phân tích tối đa {{AI_DAILY_LIMIT}} lượt mỗi ngày. Ảnh và kết quả lưu 2 năm rồi tự xóa.
13.3. Chatbot AI chỉ xem lịch hẹn, điểm hoặc đơn hàng của khách đã đăng nhập khi khách bấm đồng ý cho từng loại dữ liệu trong phiên chat đó; khách thu hồi được bất cứ lúc nào.
13.4. AI tóm tắt hồ sơ khám cho bác sĩ chỉ khi khách đồng ý (nhân viên hỏi lúc tiếp nhận); bệnh án gửi cho AI đã bỏ họ tên, số điện thoại, ngày sinh, ảnh. Khách rút lại đồng ý bằng cách báo nhân viên.
13.5. Khách có quyền yêu cầu xem, sửa, xóa dữ liệu cá nhân qua email privacy@glowskin.vn.
