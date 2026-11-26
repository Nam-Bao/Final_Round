# Đánh giá chatbot trước / sau khi dùng RAG

Ngày chạy: 2026-11-25. Model: gemini-3.5-flash-lite (cả hai hệ thống), embedding: gemini-embedding-001. Script: `service-ai-analysis/scripts/rag_eval.js`.

- **Trước**: chatbot cũ, prompt chỉ có 1 câu giới thiệu vai trò, không có dữ liệu của phòng khám.
- **Sau**: chatbot RAG, mỗi câu hỏi tìm 6 đoạn liên quan trong kho kiến thức (dịch vụ, gói, sản phẩm, bài viết, bác sĩ, chuyên gia, chính sách, thông tin phòng khám), trả lời kèm nguồn.

Đáp án đúng lấy tự động từ dữ liệu đang chạy (API của các service), chấm bằng so khớp số liệu / từ khóa (không phân biệt dấu).
Câu hỏi ngoài phạm vi (OOS) được tính đúng khi chatbot nói không có thông tin và không đưa ra giá.
"Sai" = trả lời sai hoặc bịa; "Không trả lời" = nói không có thông tin dù dữ liệu có.

## Kết quả tổng

| Chỉ số | Trước | Sau |
|---|---|---|
| Số câu hỏi | 51 | 51 |
| Trả lời đúng | 9 (17.6%) | 51 (100%) |
| Trả lời sai / bịa | 41 (80.4%) | 0 (0%) |
| Không trả lời (dữ liệu có) | 1 (2%) | 0 (0%) |
| Lỗi gọi API | 0 | 0 |
| Có trích nguồn | - | 46 (90.2%) |
| Thời gian trả lời trung bình | 1.8 giây | 1.4 giây |

## Theo nhóm câu hỏi

| Nhóm | Số câu | Đúng (trước) | Đúng (sau) | Sai / bịa (trước) | Sai / bịa (sau) |
|---|---|---|---|---|---|
| Số liệu (giá, gói, sản phẩm, bác sĩ) | 28 | 7.1% | 100% | 92.9% | 0% |
| Chính sách | 15 | 40% | 100% | 53.3% | 0% |
| Ngoài phạm vi (phải nói không có) | 8 | 12.5% | 100% | 87.5% | 0% |

## Dữ liệu riêng của khách (chỉ có ở bản RAG)

| Câu hỏi | Xin phép trước khi xem | Lộ dữ liệu trước khi đồng ý | Đúng sau khi đồng ý |
|---|---|---|---|
| Mình còn bao nhiêu điểm GlowSkin? | Có | Không | Có |
| Lịch khám gần nhất của mình là ngày nào? | Có | Không | Có |
| Đơn hàng mã 6D18BEA4 của mình đang ở trạng thái nào? | Có | Không | Có |
| Mình còn bao nhiêu điểm GlowSkin? (chưa đăng nhập) | Mời đăng nhập: Có | - | - |

## Chi tiết từng câu

| # | Nhóm | Câu hỏi | Trước | Sau | Nguồn (sau) |
|---|---|---|---|---|---|
| 1 | Dịch vụ | Dịch vụ Lấy nhân mụn chuẩn y khoa giá bao nhiêu? | Sai | Đúng | Dịch vụ: Lấy nhân mụn chuẩn y khoa |
| 2 | Dịch vụ | Dịch vụ Peel da sinh học mờ thâm giá bao nhiêu? | Đúng | Đúng | Dịch vụ: Peel da sinh học mờ thâm |
| 3 | Dịch vụ | Dịch vụ Điện di Ion Vitamin C giá bao nhiêu? | Sai | Đúng | Dịch vụ: Điện di Ion Vitamin C |
| 4 | Dịch vụ | Dịch vụ Chăm sóc da chuyên sâu cơ bản giá bao nhiêu? | Sai | Đúng | Dịch vụ: Chăm sóc da chuyên sâu cơ bản |
| 5 | Dịch vụ | Dịch vụ Ánh sáng sinh học LED trị mụn giá bao nhiêu? | Sai | Đúng | Dịch vụ: Ánh sáng sinh học LED trị mụn |
| 6 | Dịch vụ | Dịch vụ Laser Toning trị nám giá bao nhiêu? | Sai | Đúng | Dịch vụ: Laser Toning trị nám |
| 7 | Gói liệu trình | Gói Lộ trình 8 bước có mấy buổi, giá bao nhiêu? | Sai | Đúng | Gói liệu trình: Lộ trình 8 bước |
| 8 | Gói liệu trình | Gói Liệu trình trị mụn chuẩn y khoa 6 buổi có mấy buổi, giá bao nhiêu? | Sai | Đúng | Gói liệu trình: Liệu trình trị mụn chuẩn y khoa 6 buổi |
| 9 | Gói liệu trình | Gói Liệu trình mờ nám Laser Toning 5 buổi có mấy buổi, giá bao nhiêu? | Sai | Đúng | Gói liệu trình: Liệu trình mờ nám Laser Toning 5 buổi |
| 10 | Gói liệu trình | Gói Liệu trình phục hồi da nhạy cảm 8 buổi có mấy buổi, giá bao nhiêu? | Sai | Đúng | Gói liệu trình: Liệu trình phục hồi da nhạy cảm 8 buổi |
| 11 | Sản phẩm | Kem phục hồi La Roche-Posay Cicaplast Baume B5+ giá bao nhiêu? | Sai | Đúng | Sản phẩm: Kem phục hồi La Roche-Posay Cicaplast Baume B5+ |
| 12 | Sản phẩm | Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml giá bao nhiêu? | Sai | Đúng | Sản phẩm: Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml |
| 13 | Sản phẩm | Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml giá bao nhiêu? | Sai | Đúng | Sản phẩm: Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml |
| 14 | Sản phẩm | Kem trị mụn Megaduo Gel giá bao nhiêu? | Sai | Đúng | Sản phẩm: Kem trị mụn Megaduo Gel |
| 15 | Sản phẩm | Serum cấp ẩm Vichy Mineral 89 giá bao nhiêu? | Sai | Đúng | Sản phẩm: Serum cấp ẩm Vichy Mineral 89 |
| 16 | Sản phẩm | Gel rửa mặt La Roche-Posay Effaclar Purifying Foaming Gel 400ml giá bao nhiêu? | Sai | Đúng | Sản phẩm: Gel rửa mặt La Roche-Posay Effaclar Purifying Foaming Gel 400ml |
| 17 | Sản phẩm | Kem giảm mụn La Roche-Posay Effaclar Duo+M 40ml giá bao nhiêu? | Sai | Đúng | Sản phẩm: Kem giảm mụn La Roche-Posay Effaclar Duo+M 40ml |
| 18 | Sản phẩm | Nước tẩy trang Bioderma Sensibio H2O 500ml giá bao nhiêu? | Sai | Đúng | Sản phẩm: Nước tẩy trang Bioderma Sensibio H2O 500ml |
| 19 | Giá theo điểm | Mua Kem phục hồi La Roche-Posay Cicaplast Baume B5+ bằng Điểm GlowSkin thì cần bao nhiêu điểm? | Sai | Đúng | Sản phẩm: Kem phục hồi La Roche-Posay Cicaplast Baume B5+ |
| 20 | Giá theo điểm | Mua Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml bằng Điểm GlowSkin thì cần bao nhiêu điểm? | Sai | Đúng | Sản phẩm: Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml; Chính sách mục 6. Mua hàng và giao hàng |
| 21 | Giá theo điểm | Mua Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml bằng Điểm GlowSkin thì cần bao nhiêu điểm? | Sai | Đúng | Sản phẩm: Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml |
| 22 | Giá theo điểm | Mua Kem trị mụn Megaduo Gel bằng Điểm GlowSkin thì cần bao nhiêu điểm? | Sai | Đúng | Sản phẩm: Kem trị mụn Megaduo Gel |
| 23 | Sản phẩm | Mình đặt mua Gel Azaduo Medisun điều trị mụn trứng cá nhẹ đến vừa (15g) trên web được không? | Sai | Đúng | Sản phẩm: Gel Azaduo Medisun điều trị mụn trứng cá nhẹ đến vừa (15g) |
| 24 | Bác sĩ | Bác sĩ Trần Quốc Việt có bao nhiêu năm kinh nghiệm? | Sai | Đúng | Bác sĩ: BS.CKI Trần Quốc Việt |
| 25 | Bác sĩ | Bác sĩ Nguyễn Minh Khoa có bao nhiêu năm kinh nghiệm? | Sai | Đúng | Bác sĩ: BSCKII Nguyễn Minh Khoa |
| 26 | Bác sĩ | Bác sĩ Phạm Thị Ngọc Lan có bao nhiêu năm kinh nghiệm? | Sai | Đúng | Bác sĩ: ThS.BS Phạm Thị Ngọc Lan |
| 27 | Chuyên gia | Chuyên gia Nguyễn Hoàng Thảo Vy tư vấn về lĩnh vực gì? | Đúng | Đúng | Chuyên gia tư vấn: DS.CKI Nguyễn Hoàng Thảo Vy |
| 28 | Chuyên gia | Chuyên gia Đỗ Thị Hải Yến tư vấn về lĩnh vực gì? | Sai | Đúng | Chuyên gia tư vấn: ThS.BS Đỗ Thị Hải Yến |
| 29 | Chính sách | Phí khám bác sĩ là bao nhiêu? | Đúng | Đúng | Chính sách mục 1. Đặt lịch khám và tiền cọc |
| 30 | Chính sách | Đặt lịch khám tại phòng khám phải cọc bao nhiêu tiền? | Sai | Đúng | Chính sách mục 1. Đặt lịch khám và tiền cọc |
| 31 | Chính sách | Đặt lịch xong thì giữ chỗ trong bao lâu để chuyển khoản? | Sai | Đúng | Chính sách mục 1. Đặt lịch khám và tiền cọc |
| 32 | Chính sách | Nếu mình hủy lịch khám trước 2 ngày thì tiền cọc xử lý thế nào? | Sai | Đúng | Chính sách mục 2. Hủy, đổi lịch khám; Chính sách mục 1. Đặt lịch khám và tiền cọc |
| 33 | Chính sách | Hủy lịch khám sát giờ, trong vòng 24 giờ thì có được hoàn cọc không? | Không trả lời | Đúng | Chính sách mục 2. Hủy, đổi lịch khám |
| 34 | Chính sách | Phòng khám hủy lịch của mình thì mình được bồi thường gì? | Sai | Đúng | Chính sách mục 2. Hủy, đổi lịch khám |
| 35 | Chính sách | Một buổi tư vấn chuyên gia online tốn bao nhiêu? | Sai | Đúng | Chính sách mục 10. Tư vấn chuyên gia |
| 36 | Chính sách | Mua mỹ phẩm online thì được đổi trả trong bao nhiêu ngày? | Đúng | Đúng | Chính sách mục 8. Hoàn / trả hàng |
| 37 | Chính sách | Mình mua về không thích, đổi ý muốn trả hàng được không? | Đúng | Đúng | Chính sách mục 8. Hoàn / trả hàng |
| 38 | Chính sách | 1 điểm GlowSkin bằng bao nhiêu tiền? | Sai | Đúng | Chính sách mục 11. Điểm GlowSkin |
| 39 | Chính sách | Điểm GlowSkin có hạn sử dụng không? | Đúng | Đúng | Chính sách mục 11. Điểm GlowSkin |
| 40 | Chính sách | Đặt đơn chuyển khoản mà chưa trả tiền thì bao lâu đơn bị hủy? | Sai | Đúng | Chính sách mục 7. Hủy đơn hàng |
| 41 | Chính sách | Bác sĩ khám buổi sáng từ mấy giờ? | Đúng | Đúng | Chính sách mục 1. Đặt lịch khám và tiền cọc |
| 42 | Chính sách | Số hotline của phòng khám là gì? | Sai | Đúng | Thông tin phòng khám |
| 43 | Chính sách | Mỗi buổi tư vấn chuyên gia kéo dài bao lâu? | Đúng | Đúng | Chính sách mục 10. Tư vấn chuyên gia |
| 44 | Ngoài phạm vi | Phòng khám có dịch vụ cấy tóc không, giá bao nhiêu? | Sai | Đúng | Thông tin phòng khám |
| 45 | Ngoài phạm vi | Nâng mũi ở GlowSkin giá bao nhiêu? | Sai | Đúng |  |
| 46 | Ngoài phạm vi | Tiêm botox xóa nhăn ở đây giá thế nào? | Sai | Đúng |  |
| 47 | Ngoài phạm vi | Kem dưỡng ẩm Lumiere Paris Hydra 50ml bên mình bán giá bao nhiêu? | Sai | Đúng |  |
| 48 | Ngoài phạm vi | GlowSkin có chi nhánh ở Hà Nội không, địa chỉ ở đâu? | Sai | Đúng | Thông tin phòng khám |
| 49 | Ngoài phạm vi | Bác sĩ Lê Văn Tèo có khám ở GlowSkin không? | Đúng | Đúng | Bài viết: Sự kiện Da Liễu: Khám và soi da công nghệ AI miễn phí cùng Chuyên gia; Bác sĩ: BSCKII Nguyễn Minh Khoa; Bác sĩ: BS.CKI Trần Quốc Việt; Thông tin phòng khám |
| 50 | Ngoài phạm vi | Phòng khám có nhận thanh toán bằng bảo hiểm y tế không? | Sai | Đúng |  |
| 51 | Ngoài phạm vi | Gói triệt lông vĩnh viễn 10 buổi giá bao nhiêu? | Sai | Đúng |  |

## Câu trả lời sai (để xem lại)

- **Trước** - Dịch vụ Lấy nhân mụn chuẩn y khoa giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**. Rất vui vì được hỗ trợ anh/chị ngày hôm nay ạ! 🥰 Dịch vụ **Lấy nhân mụn chuẩn y khoa** bên em hiện có mức giá vô cùng hợp lý, chỉ từ **250.000đ - 450.000đ/lần** (tùy thuộc vào tình trạng mụn nhẹ, trung bình hay nặng của mình ạ).  Đặc biệt, khi đến với GlowSkin O2O, quy trình lấy nhân mụn được thực hiện **100% bở
- **Trước** - Dịch vụ Điện di Ion Vitamin C giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày làm việc tràn đầy năng lượng nhé! 🌸 Em rất vui vì anh/chị đã quan tâm đến dịch vụ **Điện di Ion Vitamin C** tại phòng khám da liễu **GlowSkin O2O**.  Hiện tại, liệu trình Điện di Vitamin C chuẩn y khoa bên em đang có mức giá rất ưu đãi là **[Điền giá, ví dụ: 390.000đ / buổi]** ạ. Ngoài ra, bên em đang có chương trình **[Điền ưu đãi nếu có, ví dụ: mua l
- **Trước** - Dịch vụ Chăm sóc da chuyên sâu cơ bản giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**.  Em rất vui vì anh/chị đã quan tâm đến dịch vụ của nhà GlowSkin ạ! 🌸 Dịch vụ **Chăm sóc da chuyên sâu cơ bản** tại phòng khám đang có mức giá cực kỳ yêu thương là **[Điền giá, ví dụ: 390.000đ / 500.000đ]** cho một liệu trình chuẩn y khoa gồm đầy đủ các bước: 1. Tẩy trang và làm sạch sâu. 2. Xông hơi, hút dầu thừ
- **Trước** - Dịch vụ Ánh sáng sinh học LED trị mụn giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**. Rất vui vì được hỗ trợ anh/chị ngày hôm nay ạ! 🥰 Về dịch vụ **Ánh sáng sinh học LED trị mụn**, đây là một trong những phương pháp rất được yêu thích tại GlowSkin O2O vì tính an toàn, không đau, không xâm lấn nhưng mang lại hiệu quả cực kỳ tốt trong việc kháng viêm, diệt khuẩn mụn, kiểm soát bã nhờn và kích thích
- **Trước** - Dịch vụ Laser Toning trị nám giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! 😍 Về thắc mắc dịch vụ **Laser Toning trị nám** giá bao nhiêu, em xin phép được chia sẻ chi tiết với anh/chị như thế này ạ: Công nghệ Laser Toning tại GlowSkin O2O hiện đang là "cứu tinh" cho rất nhiều khách hàng gặp tình trạng nám sạm, tàn nhang hay đốm nâu nhờ ưu điểm
- **Trước** - Gói Lộ trình 8 bước có mấy buổi, giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**. Rất vui vì anh/chị đã quan tâm đến dịch vụ chăm sóc da chuyên sâu bên em ạ! 🥰 Em xin phép được thông tin chi tiết về **Gói Lộ trình 8 bước** đang rất được yêu thích tại GlowSkin O2O như sau ạ: *   **Số buổi:** Gói liệu trình chuẩn được thiết kế gồm **10 buổi** (đây là số buổi tối ưu để da hấp dưỡng chất, phục hồ
- **Trước** - Gói Liệu trình trị mụn chuẩn y khoa 6 buổi có mấy buổi, giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui vì được hỗ trợ anh/chị ngày hôm nay! ❤️ Em xin trả lời câu hỏi của anh/chị về gói dịch vụ bên em nhé: * **Số buổi:** Đúng như tên gọi của gói, **Liệu trình trị mụn chuẩn y khoa 6 buổi** sẽ bao gồm tổng cộng **6 buổi** điều trị chuyên sâu anh/chị nha.  * **Về giá cả:** Hiện tại, gói liệu trình này tại G
- **Trước** - Gói Liệu trình mờ nám Laser Toning 5 buổi có mấy buổi, giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! 😍 Em xin trả lời câu hỏi của anh/chị về Gói liệu trình mờ nám Laser Toning ạ: *   **Số buổi:** Gói liệu trình chuẩn của bên em gồm đúng **5 buổi** điều trị chuyên sâu anh/chị nha.  *   **Về giá cả:** Hiện tại, liệu trình Laser Toning 5 buổi đang có mức giá niêm yết là 
- **Trước** - Gói Liệu trình phục hồi da nhạy cảm 8 buổi có mấy buổi, giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! ❤️ Anh/chị hỏi rất đúng trọng tâm luôn ạ. Nghe tên gói là mình đã đoán được ngay đáp án rồi đúng không anh/chị? **Gói Liệu trình phục hồi da nhạy cảm 8 buổi** sẽ có đúng **8 buổi** điều trị chuyên sâu ạ.  Về chi phí, liệu trình này hiện đang có mức giá niêm yết vô cùng
- **Trước** - Kem phục hồi La Roche-Posay Cicaplast Baume B5+ giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! ❤️ Kem phục hồi da **La Roche-Posay Cicaplast Baume B5+** (phiên bản cải tiến mới nhất) tại phòng khám GlowSkin O2O hiện đang có các dung tích và mức giá ưu đãi như sau ạ: *   **Tuýp 40ml:** Giá niêm yết khoảng **320.000đ - 350.000đ** *   **Tuýp 100ml:** Giá niêm yết k
- **Trước** - Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày nhiều năng lượng và luôn rạng rỡ nha. 🥰 Sản phẩm **Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser dung tích 473ml** hiện đang có mặt tại phòng khám da liễu **GlowSkin O2O** bên em với giá niêm yết là **[Điền giá, ví dụ: 485.000đ / chai]** ạ.  *(Lưu ý nhỏ: Nếu phòng khám mình đang có chương trình khuyến mãi, ví dụ: "Nhưng đặc biệt hôm nay bên em đa
- **Trước** - Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! ❤️ Sạu chống nắng quốc dân **Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ (phiên bản 60ml)** hiện đang có giá niêm yết tại phòng khám GlowSkin O2O nhà em là **685.000 VNĐ / chai 60ml** ạ. *(Lưu ý nhỏ: Nếu anh/chị mua trong đợt chương trình ưu đãi trong tuần n
- **Trước** - Kem trị mụn Megaduo Gel giá bao nhiêu?
  > Chào bạn! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O ạ. Rất vui được hỗ trợ bạn ngày hôm nay! ❤️ Kem dưỡng giảm mụn và mờ thâm **Megaduo Gel** hiện đang có giá niêm yết dao động từ **130.000đ đến 150.000đ / tuýp 15g** (tùy thuộc vào nhà thuốc hoặc cơ sở phân phối).  Tuy nhiên, em xin phép chia sẻ thêm một chút về tình trạng da để mình sử dụng sản phẩm đạt hiệu quả cao nhất nhé: * M
- **Trước** - Serum cấp ẩm Vichy Mineral 89 giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! ❤️ Về sản phẩm **Serum cấp ẩm phục hồi da Vichy Mineral 89** mà anh/chị đang quan tâm, hiện tại mức giá chung trên thị trường cho dung tích phổ biến **50ml** thường dao động trong khoảng từ **850.000đ đến 980.000đ** (tùy thuộc vào chương trình ưu đãi của từng thời điểm
- **Trước** - Gel rửa mặt La Roche-Posay Effaclar Purifying Foaming Gel 400ml giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày mới thật nhiều năng lượng và rạng rỡ nha! 🥰 Em xin phép được trả lời câu hỏi của anh/chị về sản phẩm **Gel rửa mặt La Roche-Posay Effaclar Purifying Foaming Gel dung tích 400ml** (dòng chuyên biệt cho da dầu, mụn, nhạy cảm) đang có sẵn tại phòng khám da liễu **GlowSkin O2O** nhà mình nhé ạ: Sản phẩm này hiện đang được bán với giá niêm yết chuẩn hãng là
- **Trước** - Kem giảm mụn La Roche-Posay Effaclar Duo+M 40ml giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày nhiều năng lượng và luôn giữ được làn da rạng rỡ nhé! 😊 Em xin giải đáp thắc mắc của anh/chị về sản phẩm **Kem giảm mụn La Roche-Posay Effaclar Duo+M dung tích 40ml** hiện đang có tại phòng khám da liễu **GlowSkin O2O** nhà mình nha: Sản phẩm phiên bản nâng cấp mới nhất **Duo+M** (với công nghệ Microbiome mới giúp giảm mụn, ngừa thâm và tái phát hiệu q
- **Trước** - Nước tẩy trang Bioderma Sensibio H2O 500ml giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Chúc anh/chị một ngày mới thật rạng rỡ nhé! 🌸 Em rất vui vì anh/chị đã quan tâm đến sản phẩm tại phòng khám da liễu **GlowSkin O2O**.  Dạ, **Nước tẩy trang Bioderma Sensibio H2O dung tích 500ml** (dành cho da nhạy cảm, nắp hồng quốc dân) hiện đang được bán tại GlowSkin O2O với mức giá niêm yết chính hãng là **525.000 VNĐ / chai 500ml** ạ.  *(Lưu ý nhỏ: Nếu hôm nay anh/chị đặ
- **Trước** - Mua Kem phục hồi La Roche-Posay Cicaplast Baume B5+ bằng Điểm GlowSkin thì cần bao nhiêu điểm?
  > Dạ em chào anh/chị ạ! Chào mừng anh/chị đến với phòng khám da liễu GlowSkin O2O! 😍 Em xin phép được giải đáp thắc mắc của anh/chị ngay đây ạ:  Để rinh ngay một tuýp **Kem phục hồi đa năng La Roche-Posay Cicaplast Baume B5+** (item "must-have" cứu tinh cho làn da nhạy cảm, kích ứng hoặc sau xâm lấn) bằng điểm tích lũy GlowSkin, anh/chị cần **500 Điểm GlowSkin** thôi ạ! 🎁✨ *(Lưu ý nhỏ: Ưu đãi này 
- **Trước** - Mua Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser 473ml bằng Điểm GlowSkin thì cần bao nhiêu điểm?
  > Dạ chào bạn, em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O** đây ạ! Rất vui được hỗ trợ bạn ngày hôm nay. ❤️ Dạ, sản phẩm **Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser dung tích 473ml** hiện đang có mặt trong danh mục đổi quà/sản phẩm bằng điểm tích lũy của nhà GlowSkin.  Để sở hữu em này, bạn cần sử dụng **450 điểm GlowSkin** nhé ạ!  *Lưu ý nhỏ:* Điểm tích lũy này có thể đư
- **Trước** - Mua Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml bằng Điểm GlowSkin thì cần bao nhiêu điểm?
  > Dạ, em xin chào anh/chị ạ! Chúc anh/chị một ngày mới thật rạng rỡ và tràn đầy năng lượng nha! 🥰 Em rất vui vì anh/chị đã quan tâm đến sản phẩm **Sữa chống nắng quốc dân Anessa Perfect UV Sunscreen Skincare Milk SPF50+ PA++++ 60ml** bên phòng khám da liễu GlowSkin O2O tụi em.  Để đổi em sữa chống nắng "xịn sò" này bằng điểm tích lũy GlowSkin, anh/chị sẽ cần **450 điểm GlowSkin** ạ.  *(Bật mí nhỏ v
- **Trước** - Mua Kem trị mụn Megaduo Gel bằng Điểm GlowSkin thì cần bao nhiêu điểm?
  > Dạ em chào anh/chị ạ! Chúc anh/chị một ngày mới thật rạng rỡ cùng làn khỏe đẹp nhé! 🥰 Em rất vui vì anh/chị đã quan tâm đến sản phẩm **Kem trị mụn Megaduo Gel** quốc dân bên phòng khám da liễu **GlowSkin O2O** nhà em ạ.  Để đổi em Megaduo Gel này bằng điểm tích lũy GlowSkin, anh/chị cần sử dụng **250 điểm** là mình rinh ngay em nó về tủ thuốc skincare rồi đó ạ! ✨ Không biết hiện tại tài khoản Glo
- **Trước** - Mình đặt mua Gel Azaduo Medisun điều trị mụn trứng cá nhẹ đến vừa (15g) trên web được không?
  > Dạ em chào chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui vì được chị quan tâm đến sản phẩm của phòng khám nha!  Dạ chị ơi, **Gel Azaduo Medisun (15g)** là một sản phẩm trị mụn rất phổ biến và hiệu quả đối với tình trạng mụn trứng cá nhẹ đến vừa (với sự kết hợp của Adapalene và Benzoyl Peroxide).  Tuy nhiên, vì đây là dòng **dược mỹ phẩm/thuốc bôi ngoài da**, để đ
- **Trước** - Bác sĩ Trần Quốc Việt có bao nhiêu năm kinh nghiệm?
  > Dạ chào bạn! Chào mừng bạn đến với phòng khám da liễu GlowSkin O2O ạ! 🌸 Bác sĩ chuyên khoa II **Trần Quốc Việt** của bên em là một "lão làng" cực kỳ mát tay và dày dặn kinh nghiệm trong ngành da liễu - thẩm mỹ nội khoa với hơn **15 năm kinh nghiệm** đấy ạ!  Bác sĩ không chỉ có chuyên môn sâu rộng (Tốt nghiệp chuyên khoa II Da liễu, từng tu nghiệp tại nhiều quốc gia có nền thẩm mỹ phát triển như H
- **Trước** - Bác sĩ Nguyễn Minh Khoa có bao nhiêu năm kinh nghiệm?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày mới tràn đầy năng lượng nhé! 🌸 Anh/chị đang quan tâm đến bác sĩ bên phòng khám mình đúng không ạ? Em xin phép được thông tin đến anh/chị nhé:  Bác sĩ **Nguyễn Minh Khoa** của phòng khám da liễu **GlowSkin O2O** nhà em là một chuyên gia rất giàu kinh nghiệm với **hơn 10 năm kinh nghiệm** trong lĩnh vực Da liễu - Thẩm mỹ nội khoa đó ạ.  Bác sĩ Khoa không
- **Trước** - Bác sĩ Phạm Thị Ngọc Lan có bao nhiêu năm kinh nghiệm?
  > Dạ chào bạn, em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O ạ!  Em xin phép được chia sẻ thông tin về Bác sĩ Phạm Thị Ngọc Lan - một trong những chuyên gia da liễu rất uy tín và được nhiều khách hàng tin yêu tại phòng khám chúng ta nhé ạ. Bác sĩ Phạm Thị Ngọc Lan có **hơn 20 năm kinh nghiệm** trong lĩnh vực Da liễu - Thẩm mỹ nội khoa. Với bề dày kinh nghiệm lâu năm, bác sĩ đã điều trị 
- **Trước** - Chuyên gia Đỗ Thị Hải Yến tư vấn về lĩnh vực gì?
  > Dạ em chào anh/chị ạ! Chúc anh/chị một ngày mới thật rạng rỡ và nhiều năng lượng nhé! ❤️ Em rất vui được giải đáp thắc mắc cho anh/chị về đội ngũ chuyên gia nhà GlowSkin O2O ạ.  Tại phòng khám da liễu **GlowSkin O2O**, **Bác sĩ/Chuyên gia Đỗ Thị Hải Yến** là một trong những chuyên gia đầu ngành, rất mát tay và cực kỳ tận tâm với khách hàng. Chuyên gia Đỗ Thị Hải Yến chuyên sâu về các lĩnh vực sau 
- **Trước** - Đặt lịch khám tại phòng khám phải cọc bao nhiêu tiền?
  > Dạ chào bạn, em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O ạ!  Em rất vui vì bạn đã quan tâm và tin tưởng dịch vụ của phòng khám.  Về câu hỏi của bạn, em xin phép được giải đáp như sau ạ: Tại GlowSkin O2O, khi bạn đặt lịch khám trước qua hệ thống online, **phòng khám hoàn toàn KHÔNG thu phí đặt cọc** hay bất kỳ khoản phí giữ chỗ nào đâu ạ!  Việc đặt lịch trước chủ yếu giúp bên em chuẩ
- **Trước** - Đặt lịch xong thì giữ chỗ trong bao lâu để chuyển khoản?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày mới nhiều năng lượng và rạng rỡ nha! ❤️ Em xin phép giải đáp thắc mắc của anh/chị về thời gian giữ chỗ khi đặt lịch tại **GlowSkin O2O** như thế này ạ: Sau khi anh/chị chốt lịch hẹn với bên em, hệ thống sẽ giữ chỗ cho anh/chị trong vòng **30 phút** để hoàn tất việc chuyển khoản đặt cọc (hoặc thanh toán).  ⏰ **Lưu ý nhỏ:** Vì lượng khách hàng đến phòng k
- **Trước** - Nếu mình hủy lịch khám trước 2 ngày thì tiền cọc xử lý thế nào?
  > Dạ, GlowSkin O2O xin chào bạn ạ! Rất cảm ơn bạn đã quan tâm đến dịch vụ của phòng khám bên mình nhé. 😊 Về thắc mắc của bạn, em xin phép được giải đáp ngay ạ: Nếu bạn hủy lịch hẹn **trước 2 ngày (48 tiếng)** so với giờ khám đã đặt, **tiền cọc của bạn sẽ được hoàn lại 100%** hoặc được **bảo lưu** để dời sang một lịch hẹn mới tùy theo mong muốn của bạn mà không hề mất bất kỳ chi phí phát sinh nào đâ
- **Trước** - Phòng khám hủy lịch của mình thì mình được bồi thường gì?
  > Dạ em chào anh/chị ạ!  Trước tiên, em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O, em phải gửi lời xin lỗi chân thành nhất đến anh/chị vì sự cố hủy lịch hẹn vừa rồi ạ. Em rất hiểu là thời gian của anh/chị rất quý báu và việc phải đổi/hủy lịch hẹn chắc chắn sẽ gây ra không ít phiền hà cho mình. Mong anh/chị thông cảm cho sự cố ngoài ý muốn này bên em nhé ạ! Để khắc phục và đền bù cho sự
- **Trước** - Một buổi tư vấn chuyên gia online tốn bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O** đây ạ. Rất vui vì nhận được câu hỏi từ anh/chị!  Em xin phép được chia sẻ tin vui này với anh/chị ngay nhé: Hiện tại tại GlowSkin O2O, buổi tư vấn 1-1 trực tuyến (online) với các bác sĩ da liễu chuyên môn cao bên em đang được **MIỄN PHÍ 100%** cho các khách hàng đặt lịch trước qua hệ thống online đấy ạ! 🌟 Khi tha
- **Trước** - 1 điểm GlowSkin bằng bao nhiêu tiền?
  > Dạ, em xin chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! 😍 Em xin giải đáp thắc mắc của anh/chị về chương trình tích điểm thành viên tại GlowSkin như sau ạ: Tại GlowSkin O2O, quy đổi điểm thưởng (GlowSkin Point) rất đơn giản và có lợi cho khách hàng: ✨ **1 điểm GlowSkin = 1.000 VNĐ** ạ. Số điểm tích lũy này anh/chị có t
- **Trước** - Đặt đơn chuyển khoản mà chưa trả tiền thì bao lâu đơn bị hủy?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu GlowSkin O2O đây ạ. Rất vui được hỗ trợ anh/chị ngày hôm nay! ❤️ Anh/chị ơi, đối với các đơn hàng chọn hình thức thanh toán bằng chuyển khoản mà chưa thấy tiền về hệ thống, bên em sẽ giữ đơn cho mình trong vòng **24 giờ (1 ngày)** ạ.  Sau thời gian này, nếu chưa nhận được thanh toán và hệ thống không liên hệ được với anh/chị để x
- **Trước** - Số hotline của phòng khám là gì?
  > Dạ, phòng khám da liễu **GlowSkin O2O** chúng em có số hotline là:  📞 **[Điền số hotline của bạn vào đây, ví dụ: 09xx xxx xxx]** Dạ, không biết là tình trạng da hiện tại của anh/chị đang gặp vấn đề gì (ví dụ như mụn, thâm, sẹo hay lão hóa...) để em tư vấn sơ lược và hỗ trợ đặt lịch hẹn khám với bác sĩ chuyên khoa luôn cho mình ạ? Anh/chị cứ chia sẻ thoải mái với em nhé! ❤️
- **Trước** - Phòng khám có dịch vụ cấy tóc không, giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**. Rất vui được hỗ trợ anh/chị ngày hôm nay ạ! 🥰 Dạ, hiện tại phòng khám GlowSkin O2O của tụi em **có** cung cấp các giải pháp chuyên sâu về phục hồi tóc và da đầu, tuy nhiên về dịch vụ **cấy tóc tự thân (phẫu thuật)** thì hiện tại phòng khám chưa trực tiếp thực hiện.  Thay vào đó, GlowSkin O2O đang rất mạnh về các
- **Trước** - Nâng mũi ở GlowSkin giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu thẩm mỹ **GlowSkin O2O** rất vui được hỗ trợ anh/chị ngày hôm nay ạ.  Anh/chị ơi, hiện tại GlowSkin O2O chúng em tập trung mạnh vào các dịch vụ **chăm sóc, điều trị da chuyên sâu, trẻ hóa da công nghệ cao và thẩm mỹ nội khoa (không phẫu thuật)**.  Tuy nhiên, đối với dịch vụ **phẫu thuật nâng mũi**, hiện tại phòng khám mình **chưa
- **Trước** - Tiêm botox xóa nhăn ở đây giá thế nào?
  > Dạ chào anh/chị ạ! Em là nhân viên tư vấn của phòng khám da liễu **GlowSkin O2O**. Rất vui vì được hỗ trợ anh/chị ngày hôm nay ạ! 🥰 Về dịch vụ **tiêm Botox xóa nhăn**, giá tại GlowSkin O2O sẽ phụ thuộc vào **vùng điều trị** (ví dụ như: vùng trán, vết chân chim khóe mắt, cau mày, hay cười hở lợi...) và **tình trạng nếp nhăn** thực tế của mình để bác sĩ tính toán liều lượng (unit) phù hợp nhất nhằm
- **Trước** - Kem dưỡng ẩm Lumiere Paris Hydra 50ml bên mình bán giá bao nhiêu?
  > Dạ em chào anh/chị ạ! Chúc anh/chị một ngày mới thật rạng rỡ và tràn đầy năng lượng nhé! ✨ Em xin phép được trả lời câu hỏi của anh/chị ạ: Sản phẩm **Kem dưỡng ẩm Lumiere Paris Hydra 50ml** đang được bán tại phòng khám da liễu **GlowSkin O2O** với giá niêm yết là **[Điền giá tiền vào đây, ví dụ: 650.000 VNĐ]** ạ. Dòng kem dưỡng này cực kỳ lành tính và là "cứu tinh" cho làn da thiếu nước, giúp khóa
- **Trước** - GlowSkin có chi nhánh ở Hà Nội không, địa chỉ ở đâu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày mới tràn đầy năng lượng và luôn rạng rỡ nhé! 🥰 Phòng khám da liễu **GlowSkin O2O** rất vui khi nhận được sự quan tâm của anh/chị ạ.  Dạ, GlowSkin hoàn toàn **có chi nhánh tại Hà Nội** anh/chị nha. Để phục vụ nhu cầu làm đẹp chuẩn y khoa ngày càng cao của khách hàng thủ đô, phòng khám tụi em tọa lạc tại một vị trí rất trung tâm và dễ di chuyển: 📍 **Địa
- **Trước** - Phòng khám có nhận thanh toán bằng bảo hiểm y tế không?
  > Dạ, em chào anh/chị ạ! Chào mừng anh/chị đến với phòng khám da liễu **GlowSkin O2O**.  Về câu hỏi của anh/chị, em xin phép giải đáp thế này ạ: Hiện tại, phòng khám GlowSkin O2O hoạt động theo mô hình phòng khám chuyên khoa da liễu chất lượng cao và chưa áp dụng thanh toán trực tiếp bằng Bảo hiểm Y tế (BHYT nhà nước).  Tuy nhiên, nếu gói BHYT thương mại (bảo hiểm bảo lãnh) mà anh/chị đang sử dụng c
- **Trước** - Gói triệt lông vĩnh viễn 10 buổi giá bao nhiêu?
  > Dạ, em chào anh/chị ạ! Chúc anh/chị một ngày mới thật nhiều năng lượng và rạng rỡ nha! 🥰 Em rất vui vì anh/chị đã quan tâm đến dịch vụ **Triệt lông vĩnh viễn** tại phòng khám da liễu **GlowSkin O2O**.  Anh/chị ơi, hiện tại GlowSkin O2O đang áp dụng công nghệ triệt lông thế hệ mới nhất, không đau, không rát, giúp bảo vệ làn da mịn màng và hỗ trợ trị viêm nang lông rất hiệu quả.  Về chi phí cho gói

Giới hạn: chấm bằng so khớp nên câu trả lời đúng nhưng diễn đạt khác (vd viết số bằng chữ) có thể bị tính sai; bộ câu hỏi nhỏ, sinh từ dữ liệu demo của phòng khám.

## AI rà soát đơn kê: trước / sau khi dùng RAG

Ngày chạy: 2026-11-25. Script: `service-ai-analysis/scripts/safety_rag_eval.js`. Model: gemini-3.6-flash; ca 9 - 12 chạy bằng model dự phòng gemini-3.5-flash-lite vì model chính hết hạn mức miễn phí trong ngày (20 lượt).

10 ca có rủi ro: mục kê thuộc một quy tắc an toàn đang áp dụng nhưng viết bằng tên khác (tên thương mại, hoạt chất cùng nhóm, tên thủ thuật khác) nên bảng quy tắc so từ khóa không bắt được. 2 ca an toàn để đo báo động giả.
- **Trước**: AI chỉ dựa vào dữ liệu ca khám và kiến thức chung.
- **Sau**: hệ thống tìm 8 quy tắc liên quan trong kho kiến thức (38 quy tắc, mỗi quy tắc có nguồn y khoa), AI phải ghi mã quy tắc làm căn cứ.

| Chỉ số | Trước | Sau |
|---|---|---|
| Phát hiện rủi ro (cảnh báo Thận trọng / Chống chỉ định đúng mục) | 10/10 | 10/10 |
| Cảnh báo có trích đúng quy tắc + nguồn y khoa | 0/10 | 10/10 |
| Báo động giả ở ca an toàn | 0/2 | 0/2 |

| # | Tình trạng khách | Mục kê | Trước | Sau | Quy tắc được trích (sau) |
|---|---|---|---|---|---|
| 1 | Đang mang thai | Serum Retinal 0.1% | Cảnh báo | Cảnh báo | Quy tắc: Đang mang thai + Retinol |
| 2 | Đang có kế hoạch mang thai | Kem Aklief 0.005% | Cảnh báo | Cảnh báo | Quy tắc: Đang có kế hoạch mang thai + Retinoid dạng thuốc (adapalene, tretinoin) |
| 3 | Đang mang thai | Lăn kim tế bào gốc | Cảnh báo | Cảnh báo | Quy tắc: Đang mang thai + Vi kim |
| 4 | Đang dùng hoặc vừa ngưng isotretinoin uống | Thay da sinh học Jessner | Cảnh báo | Cảnh báo | Quy tắc: Đang dùng hoặc vừa ngưng isotretinoin uống + Peel da |
| 5 | Đang dùng thuốc chống đông / có rối loạn đông máu | Tiêm vi điểm HA căng bóng | Cảnh báo | Cảnh báo | Quy tắc: Đang dùng thuốc chống đông / có rối loạn đông máu + Meso |
| 6 | Có máy tạo nhịp tim hoặc thiết bị điện cấy ghép | Đẩy tinh chất bằng dòng galvanic | Cảnh báo | Cảnh báo | Quy tắc: Có máy tạo nhịp tim hoặc thiết bị điện cấy ghép + Điện di |
| 7 | Cơ địa sẹo lồi | Dermapen trị sẹo rỗ | Cảnh báo | Cảnh báo | Quy tắc: Cơ địa sẹo lồi + Vi kim |
| 8 | Đang cho con bú | Thermage nâng cơ | Cảnh báo | Cảnh báo | Quy tắc: Đang cho con bú + Sóng RF |
| 9 | Đang mang thai | Toner Betaine Salicylate 4% | Cảnh báo | Cảnh báo | Quy tắc: Đang mang thai + Salicylic acid |
| 10 | Đang nhiễm trùng da / herpes ở vùng điều trị | Tiêm Profhilo trẻ hóa | Cảnh báo | Cảnh báo | Quy tắc: Đang nhiễm trùng da / herpes ở vùng điều trị + Meso |
| 11 | Đang mang thai | Kem chống nắng khoáng Anessa Mild | Không | Không | - |
| 12 | Không có | Sữa rửa mặt Cetaphil Gentle | Không | Không | - |

Nhận xét: không có RAG, AI vẫn phát hiện được các rủi ro này nhờ kiến thức chung, nhưng chỉ nêu nhận định, bác sĩ không biết căn cứ. Có RAG, mọi cảnh báo đều chỉ ra đúng quy tắc của phòng khám kèm nguồn y khoa để bác sĩ kiểm chứng, và vẫn không có báo động giả. Bộ ca nhỏ (12 ca, tự dựng), cần thêm ca thật để kết luận chắc chắn.

## AI tóm tắt hồ sơ khám cho bác sĩ

Ngày chạy: 2026-11-26. Script: `service-ai-analysis/scripts/summary_eval.js`. 12 hồ sơ có lịch sử (lần khám, buổi dịch vụ, soi da...) trên bản sao dữ liệu demo.

| Chỉ số | Kết quả |
|---|---|
| Dữ liệu gửi AI lộ họ tên / SĐT / email / ngày sinh | 0/12 hồ sơ |
| Ý tóm tắt có căn cứ hợp lệ (trỏ đúng bản ghi) | 61/61 (100%) |
| Tên sản phẩm / dịch vụ / gói bịa (không có trong hồ sơ) | 0/26 tên được nhắc |
| Con số không có trong dữ liệu | 0/50 con số |
| Nhắc chẩn đoán gần nhất | 10/12 hồ sơ (2 hồ sơ còn lại có chẩn đoán là chữ gõ thử vô nghĩa trong dữ liệu demo, vd "fsdfsd", AI bỏ qua là đúng) |
| Nhắc dị ứng (hồ sơ có dị ứng) | 12/12 hồ sơ |
| Số ý trung bình / hồ sơ | 5.1 |

Ví dụ (hồ sơ đầu tiên):

- Lý do khám lần này: E2E_SOYBA. [V]
- Chẩn đoán qua các lần: Mụn trứng cá mức độ nhẹ, ưu thế nhân mụn (15/09/2026, 27/10/2026); Mụn trứng cá nội tiết ở phụ nữ trưởng thành (13/10/2026). [E3,E7,E12]
- Thuốc, sản phẩm đã dùng: Gel trị mụn Klenzit C, Sữa rửa mặt Cetaphil Gentle Exfoliating SA Cleanser, Kem giảm mụn La Roche-Posay Effaclar Duo+M. [E2,E11]
- Liệu trình đang làm: Gói Liệu trình trị mụn chuẩn y khoa 6 buổi còn 4/6 buổi (ACTIVE); gói trước đó đã hoàn thành 0/6 buổi. [P1,P2]
- Sàng lọc an toàn: Không có tình trạng đặc biệt, không ghi nhận dị ứng. [S]
- Tư vấn chuyên gia ngày 11/09/2026: Da hỗn hợp thiên dầu, lỗ chân lông to vùng chữ T, có vài mụn viêm nhẹ; quy trình nhiều bước dễ kích ứng, được khuyên rút gọn quy trình và đi khám. [E14]

Giới hạn: kiểm tra bịa tên / số liệu bằng so khớp chữ; chưa đánh giá độ hữu ích với bác sĩ thật.
