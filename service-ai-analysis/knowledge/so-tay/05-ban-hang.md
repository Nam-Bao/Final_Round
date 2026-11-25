<!--
vai-tro: SALES, GEN_MANAGER, ADMIN
Quy trình của nhân viên bán hàng (NVBH).
-->

## Xử lý đơn hàng online
- Quản lý đơn hàng: đơn COD và đơn trả bằng điểm vào Chờ duyệt ngay; đơn chuyển khoản chỉ vào khi hệ thống đã nhận tiền.
- Duyệt đơn → đóng gói, kiểm tra khối lượng → Tạo đơn - Gửi GHN để lấy mã vận đơn. Trạng thái sau đó cập nhật theo GHN (đã lấy hàng, đang giao, giao thành công).
- Đơn trả bằng Điểm GlowSkin: GHN không thu hộ.

## Hủy đơn hàng
- Mở đơn chưa giao xong → Hủy → chọn bên yêu cầu (Phòng khám hoặc Khách), lý do ít nhất 10 ký tự → Xác nhận hủy. Đơn hủy thì cộng lại tồn kho.
- Voucher được trả lượt khi phòng khám hủy, GHN hủy hoặc lỗi vận chuyển; khách yêu cầu hủy hoặc không nhận hàng thì không trả lượt.
- Đơn đã chuyển khoản: vào tab Chờ hoàn tiền, chuyển khoản cho khách rồi nhập mã giao dịch. Đơn trả bằng điểm: hệ thống tự hoàn điểm.
- Khách tự hủy được trên web khi đơn chưa giao cho GHN; đơn đã chuyển khoản thì khách chọn hoàn tiền (khách nhập tài khoản, hiện trong đơn) hoặc hoàn điểm 1:1.
- GHN hoàn hàng về kho: tab Cần xem xét, chọn Lỗi vận chuyển hoặc Khách không nhận.

## Hoàn / trả hàng và đổi hàng
- Khách gửi yêu cầu trong 7 ngày kể từ khi đơn Đã nhận. Lý do được nhận: hàng móp vỡ rò rỉ, giao sai, sản phẩm lỗi, hết hạn. Không nhận trả vì đổi ý. Mỗi đơn chỉ yêu cầu một lần.
- Duyệt (hoặc Từ chối kèm lý do) trong 24 giờ làm việc → Tạo đơn GHN lấy hàng (phòng khám trả phí). Lấy hàng thất bại thì tạo lại.
- Kho nhận hàng → kiểm tra: Không đạt thì từ chối kèm lý do; Đạt thì xử lý theo lựa chọn của khách.
- Đổi hàng (mặc định): tạo đơn giao hàng đổi 0đ. Hết hàng: đổi sản phẩm khác có tổng giá trị không vượt hàng khách trả, phần chênh còn lại được cộng thành Điểm GlowSkin cho khách; hoặc Chuyển sang hoàn tiền nếu khách đồng ý.
- Hàng khuyến mãi: không hoàn tiền, lỗi thì chỉ đổi đúng sản phẩm đó (hết hàng thì đổi sản phẩm tương đương không vượt giá đã trả, khách không đồng ý mới hoàn tiền).
- Hoàn tiền: chuyển khoản theo tài khoản khách khai, nhập mã giao dịch; chọn nhập lại kho nếu hàng còn bán được. Đơn trả bằng điểm thì hoàn điểm, không cần mã giao dịch.

## Bán tại quầy
- Quản lý đơn hàng → Tạo đơn mới. Thuốc kê đơn không có trong danh sách (chỉ bán theo đơn bác sĩ).
- Đơn có sản phẩm chứa hoạt chất cần lưu ý: khung Sàng lọc an toàn bắt buộc. Hỏi khách (mang thai, có kế hoạch mang thai, cho con bú, dị ứng), tick Đã hỏi khách. Có Chống chỉ định thì bỏ sản phẩm hoặc tư vấn rồi tick "Đã tư vấn, khách vẫn muốn mua".
- Thanh toán: tiền mặt, chuyển khoản hoặc Điểm GlowSkin (đủ điểm cho cả đơn theo giá niêm yết, không kèm voucher). Nhận tại quầy thì đơn hoàn thành ngay; in hóa đơn bán lẻ A5.
- Áp voucher cho khách: bắt buộc tải ảnh xác thực.
- Nút Gợi ý sản phẩm theo nhu cầu (AI): nhập nhu cầu, ngân sách, tình trạng khách để được gợi ý tối đa 3 sản phẩm còn hàng, đã lọc theo quy tắc an toàn. Sản phẩm thêm vào đơn vẫn qua bước sàng lọc.

## Giá và điểm khi bán
- Mỗi sản phẩm có giá niêm yết; giá khuyến mãi online áp dụng trong thời gian ưu đãi.
- Trả bằng điểm luôn tính theo giá niêm yết, làm tròn lên (1 điểm = 100đ).
- Voucher không cộng dồn với giá khuyến mãi, không trừ vào phí vận chuyển; mỗi đơn một mã.
