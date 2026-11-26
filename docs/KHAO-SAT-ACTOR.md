# Phiếu khảo sát yêu cầu theo tác nhân

Phòng khám trong đề tài là **giả định**. Các câu trả lời dưới đây là **câu trả lời mô phỏng**, tổng hợp từ cách vận hành công khai của các phòng khám da liễu, quy định chung về khám chữa bệnh và góp ý của giảng viên hướng dẫn. Đây không phải kết quả phỏng vấn người thật. Phiếu dùng để xác định yêu cầu chức năng; mỗi câu trả lời ghi tính năng tương ứng trong hệ thống.

## 1. Quản lý chung (chủ phòng khám)

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Phòng khám đang gặp khó khăn lớn nhất ở khâu nào? | Khách đặt lịch qua điện thoại, mạng xã hội rồi không đến, giờ trống bị bỏ phí; số liệu doanh thu, vật tư phải tổng hợp tay cuối tháng. | Đặt lịch online có cọc VietQR, báo cáo doanh thu |
| 2 | Chính sách cọc và hủy lịch mong muốn? | Khám tại phòng khám cọc 50.000đ, khám online trả trước 100.000đ. Hủy trước 24 giờ không mất tiền nhưng giữ lại dưới dạng điểm để khách quay lại; hủy sát giờ hoặc không đến thì mất cọc. | Quy tắc hủy 24 giờ, Điểm GlowSkin |
| 3 | Khi phòng khám hủy lịch (bác sĩ vắng) thì xử lý thế nào? | Hoàn 100% cọc. Khuyến khích khách nhận điểm, cộng thêm 10% để bù bất tiện. | Hoàn cọc bằng tiền hoặc điểm +10% |
| 4 | Kiểm soát hoàn tiền ra sao để tránh gian lận? | Nhân viên chuyển khoản hoàn tiền phải ghi mã giao dịch; chỉ coi là đã hoàn khi sao kê ngân hàng có khoản tiền ra khớp. Quá 24 giờ chưa khớp thì quản lý đối chiếu. | Đối soát tiền vào / hoàn tiền chờ xác minh |
| 5 | Chấm công hiện nay có vấn đề gì? | Máy vân tay bị chấm hộ, nhân viên quên chấm rồi khai lại; tính lương bằng bảng tính mất 2 - 3 ngày. | Chấm công QR 20 giây + khuôn mặt, giải trình, bảng lương tự tính |
| 6 | Quy định lương và thưởng? | Lương theo ca (mỗi vị trí một mức), thưởng chuyên cần 500.000đ nếu cả tháng vi phạm không quá 3 lần; khoản cộng / trừ khác phải ghi lý do; đã chi trả thì khóa sổ. | Mức lương ca, bảng lương nháp → duyệt khóa → chi trả |
| 7 | Quản lý vật tư tiêu hao thế nào? | Mỗi dịch vụ có định mức; dùng vượt phải có lý do; dùng lô gần hết hạn trước; sắp hết thì nhắc đặt hàng. | Định mức vật tư, trừ kho theo lô, đề xuất nhập hàng |
| 8 | Kiểm soát an toàn khi kê đơn? | Có danh sách chống chỉ định (mang thai, cho con bú, isotretinoin...) do bác sĩ thống nhất, có nguồn y khoa, quản lý duyệt; hệ thống tự cảnh báo khi kê. | Quy tắc an toàn: soạn → bác sĩ xem xét → duyệt |
| 9 | Có muốn dùng AI không, ở mức nào? | Có, nhưng AI chỉ hỗ trợ, bác sĩ quyết định. AI phải trả lời đúng giá và chính sách của phòng khám, không được bịa. | Chatbot RAG có nguồn, AI rà soát đơn trích quy tắc |
| 10 | Mã giảm giá nội bộ quản lý thế nào? | Mã cho khách đặc biệt (vd đã tư vấn chuyên gia) không công khai; nhân viên áp phải chụp ảnh xác thực; quản lý xem lịch sử áp. | Voucher nội bộ + ảnh xác thực + lịch sử áp |

## 2. Bác sĩ da liễu

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Trước khi khám cần biết gì về khách? | Lý do khám, các lần khám trước (chẩn đoán, thuốc đã kê, phản ứng), liệu trình đang làm, dị ứng, có mang thai / cho con bú không. | Sổ y bạ đầy đủ, tóm tắt hồ sơ bằng AI |
| 2 | Khó khăn khi xem lịch sử khách tái khám nhiều lần? | Phải đọc từng lần, mất thời gian; thông tin nằm rải rác (soi da, liệu trình, mỹ phẩm khách tự mua). | Sổ y bạ gom mọi nguồn, tóm tắt có nguồn |
| 3 | Kê đơn có rủi ro gì? | Kê retinoid cho người mang thai, peel cho người đang dùng isotretinoin; sản phẩm tên thương mại khó nhớ thành phần. | Cảnh báo chống chỉ định theo bảng quy tắc + AI rà soát |
| 4 | Khi có cảnh báo mà vẫn muốn kê? | Bác sĩ được quyết định nhưng phải ghi lý do để sau này đối chiếu. | Ghi lý do khi giữ đơn có cảnh báo |
| 5 | Kết quả soi da AI dùng thế nào? | Chỉ tham khảo; bác sĩ phải xem lại, sửa vùng AI khoanh sai trước khi khách thấy là kết quả đã được xác nhận. | Xác nhận / hiệu chỉnh kết quả soi da |
| 6 | Cần gì ở đơn thuốc? | In được đơn A5 có cách dùng từng sản phẩm, ngày tái khám, thông tin bác sĩ. | In đơn thuốc A5 |
| 7 | Bác sĩ có muốn góp ý quy tắc an toàn? | Có, đề xuất quy tắc mới hoặc ngưng quy tắc lỗi thời; xem xét quy tắc quản lý soạn trước khi áp dụng. | Bác sĩ đề xuất / xem xét quy tắc |
| 8 | Khám online cần điều kiện gì? | Khách tải ảnh vùng da trước, phòng video chỉ khách và bác sĩ phụ trách vào được. | Khám trực tuyến ZEGOCLOUD, bắt buộc ảnh |

## 3. Chăm sóc khách hàng (CSKH)

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Quy trình tiếp nhận khách hiện tại? | Hỏi tên, số điện thoại, lý do khám, ghi sổ, rồi dẫn vào phòng bác sĩ trống; khách đến thẳng xen với khách đã hẹn rất dễ rối. | Không gian tư vấn: khách đặt hôm nay, danh sách chờ |
| 2 | Có hỏi sàng lọc an toàn không? | Nên hỏi mỗi lần khám (mang thai, cho con bú, dị ứng) nhưng hay quên. | Bắt buộc xác nhận sàng lọc trước khi chuyển khách |
| 3 | Đối soát chuyển khoản mất bao lâu? | Cuối ngày dò sao kê với sổ lịch; khách chuyển thừa / thiếu / chuyển sau khi hủy rất khó phát hiện. | Đối soát tự động theo mã O2O / TV / SP |
| 4 | Thu tiền sau khám gặp vấn đề gì? | Tính tay, quên trừ cọc, áp mã giảm giá không kiểm soát. | Hóa đơn tự trừ cọc, voucher có ảnh xác thực |
| 5 | Khách không đến thì xử lý thế nào? | Quá giờ hẹn khoảng 15 phút thì gọi khách; không liên lạc được thì ghi không đến, giữ cọc. | Cảnh báo quá giờ 15 phút, nút Khách không đến |
| 6 | Câu hỏi khách hay hỏi qua chat? | Giá dịch vụ, gói, sản phẩm; hủy lịch có mất cọc không; còn giờ trống không; đơn hàng đến đâu. | Chatbot RAG trả lời theo dữ liệu, xem lịch / đơn khi khách đồng ý; nháp trả lời cho CSKH |
| 7 | Gọi chăm sóc sau khám gồm gì? | Nhắc lịch, nhắc tái khám, thăm hỏi tình trạng da sau điều trị; khách phàn nàn thì báo quản lý. | Trang Gọi chăm sóc khách, nhãn Cần lưu ý |
| 8 | Nhân viên mới học quy trình thế nào? | Hỏi người cũ, dễ làm sai; cần chỗ tra cứu nhanh quy định. | Ô chat Hỏi quy trình theo chủ đề |

## 4. Kỹ thuật viên (KTV)

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Biết khách nào cần làm dịch vụ bằng cách nào? | CSKH báo miệng sau khi thu tiền; dễ sót khách liệu trình đặt trước. | Không gian kỹ thuật viên, tự phân công KTV ít việc |
| 2 | Ghi nhận buổi làm thế nào? | Ghi phiếu giấy, chụp ảnh bằng điện thoại cá nhân. | Ghi chú + ảnh sau buổi lưu vào hồ sơ |
| 3 | Vật tư dùng bao nhiêu? | Không ai ghi; cuối tháng mới biết thiếu hàng. | Gợi ý vật tư theo định mức, vượt phải ghi lý do |
| 4 | Lo ngại an toàn khi làm thủ thuật? | Cần biết khách đang mang thai, dùng thuốc chống đông, có sẹo lồi... trước khi lăn kim, peel, RF. | Hiển thị sàng lọc an toàn của khách |

## 5. Nhân viên bán hàng (NVBH)

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Bán hàng online đang làm thế nào? | Nhận đơn qua tin nhắn, tự tính phí ship, tự tạo vận đơn trên trang GHN. | Cửa hàng online, phí GHN tự tính, tạo vận đơn |
| 2 | Khách hủy đơn / trả hàng xử lý ra sao? | Cho trả trong 7 ngày nếu hàng lỗi, vỡ, giao sai, hết hạn; không nhận đổi ý. Hàng lỗi ưu tiên đổi; hàng khuyến mãi không hoàn tiền. | Hủy đơn theo bên yêu cầu, hoàn trả / đổi hàng |
| 3 | Bán tại quầy có cần lưu ý gì? | Một số sản phẩm có hoạt chất không dùng được khi mang thai / cho con bú, phải hỏi khách trước khi bán. | Sàng lọc an toàn tại quầy |
| 4 | Tư vấn sản phẩm cho khách mới gặp khó khăn gì? | Nhiều sản phẩm, khó nhớ loại da phù hợp, thành phần và hàng còn trong kho. | Gợi ý sản phẩm theo nhu cầu (AI), lọc theo quy tắc an toàn |
| 5 | Khách muốn trả bằng điểm tích lũy? | Cho phép nếu đủ điểm cho cả đơn, tính theo giá niêm yết, không dùng kèm mã giảm giá. | Thanh toán bằng Điểm GlowSkin |

## 6. Chuyên gia tư vấn (thỉnh giảng)

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Hình thức tư vấn mong muốn? | Video theo lịch hẹn, mỗi buổi khoảng 45 phút, khách trả phí trước. | Đặt lịch tư vấn, thanh toán trước, phòng video |
| 2 | Sau buổi tư vấn cần làm gì? | Gửi nhận định, lời khuyên, sản phẩm gợi ý cho khách; cần đi khám thì khuyên khách đặt lịch bác sĩ. | Gửi kết quả tư vấn, gợi ý đi khám |
| 3 | Khách không vào phòng thì sao? | Vẫn tính buổi, không hoàn phí cho khách; chuyên gia vắng thì phải hoàn phí cho khách. | Xác định khách vắng / chuyên gia vắng |
| 4 | Thù lao tính thế nào? | Theo buổi hoàn thành (cả hai cùng vào phòng và đã gửi kết quả). | Thống kê buổi, thù lao chuyên gia |

## 7. Khách hàng

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Bạn muốn đặt lịch khám thế nào? | Tự chọn bác sĩ và giờ trống trên điện thoại, thanh toán nhanh bằng quét mã, nhận email xác nhận và nhắc lịch. | Đặt lịch online, VietQR, email xác nhận / nhắc lịch |
| 2 | Bạn có muốn tự kiểm tra da trước khi khám? | Có, chụp ảnh để biết sơ bộ tình trạng mụn, nám; nhưng muốn bác sĩ xem lại. | Sàng lọc da AI, bác sĩ xác nhận |
| 3 | Khi bận đột xuất? | Muốn tự đổi lịch hoặc hủy trên web; hủy sớm thì không mất tiền. | Đổi lịch 1 lần, hủy trước 24 giờ đổi cọc thành điểm |
| 4 | Bạn hỏi gì trước khi mua mỹ phẩm? | Giá, có phù hợp da mình không, có dùng được khi mang thai không, có ship không. | Trang sản phẩm, chatbot có nguồn, giá theo điểm |
| 5 | Bạn lo ngại gì khi chatbot xem thông tin cá nhân? | Chỉ cho xem khi mình đồng ý, xem xong có thể thu hồi. | Chatbot xin phép từng loại dữ liệu, thu hồi được |
| 6 | Bạn có đồng ý cho AI đọc hồ sơ khám để bác sĩ nắm nhanh? | Đồng ý nếu bỏ tên, số điện thoại, ảnh; và mình rút lại được. | Đồng ý tóm tắt hồ sơ, bỏ định danh |
| 7 | Sau khi điều trị bạn cần gì? | Xem lại kết quả khám, đơn thuốc, số buổi liệu trình còn lại, đánh giá dịch vụ. | Sổ lịch khám, Gói liệu trình của tôi, đánh giá |

## 8. Quản trị viên

| STT | Câu hỏi | Câu trả lời (mô phỏng) | Tính năng đáp ứng |
|---|---|---|---|
| 1 | Quản lý tài khoản nhân viên thế nào? | Tạo tài khoản theo vai trò, khóa khi nghỉ việc; mỗi vai trò chỉ thấy chức năng của mình. | Quản lý người dùng, phân quyền theo vai trò |
| 2 | Cần theo dõi gì về hệ thống? | Email gửi khách có lỗi không để gửi lại; dữ liệu AI cập nhật chưa. | Lịch sử email, Kho kiến thức AI |
| 3 | Yêu cầu bảo mật? | Mật khẩu được mã hóa, khóa tạm khi đăng nhập sai nhiều lần, quên mật khẩu bằng mã OTP qua email. | bcrypt, giới hạn tần suất, OTP |
