# Kịch bản test theo sơ đồ BPMN

Mỗi sơ đồ trong `docs/bpmn/` có một phần bên dưới. Mỗi nhánh rẽ (hình thoi) và mỗi sự kiện (thời gian, nhận tin) trong sơ đồ là một ca test. Đi hết các ca của một phần là đã đi hết mọi đường của sơ đồ đó.

Cách đọc bảng: **Ca** là mã ca test, **Nhánh trong sơ đồ** là đường đi tương ứng trên hình, **Kết quả đúng** là điều phải thấy được trên màn hình. Ca nào không đạt thì chụp màn hình và ghi lại mã ca.

---

## 0. Chuẩn bị

### 0.1. Chạy hệ thống

1. Docker Desktop đang chạy, có đủ 6 container `o2o_db_*`.
2. Chạy backend (gateway và các service) và 2 frontend.
3. Trang nhân viên: http://localhost:3000. Trang khách: http://localhost:3001.

### 0.2. Tài khoản

| Vai trò | Tài khoản | Mật khẩu |
|---|---|---|
| Quản lý chung | `quanly@gmail.com` | mật khẩu nhóm đã đặt |
| Bác sĩ | `bacsi1@gmail.com`, `bacsi2@gmail.com`, `bacsi3@glowskin.demo` | nhóm đặt / `Demo@123` |
| CSKH | `tuvan1@gmail.com`, `tuvan2@gmail.com` | mật khẩu nhóm đã đặt |
| Kỹ thuật viên | `ktv1@gmail.com`, `ktv2@glowskin.demo` | nhóm đặt / `Demo@123` |
| Nhân viên bán hàng | `banhang1@gmail.com` | mật khẩu nhóm đã đặt |
| Chuyên gia | `chuyengia1@gmail.com` (dinh dưỡng), `chuyengia2@glowskin.demo` (mỹ phẩm) | nhóm đặt / `Demo@123` |
| Khách cũ (đã khám) | `phuc.lh3@glowskin.demo` | `Demo@123` |
| Khách đang đi liệu trình | `tam.htt8@glowskin.demo` | `Demo@123` |
| Khách có yêu cầu hoàn trả | `khang.lm11@glowskin.demo` | `Demo@123` |
| Khách mới | tự đăng ký ở trang khách | tự đặt |

Tài khoản `@glowskin.demo` là dữ liệu demo (xem `devops/seed-demo/README.md`). Dữ liệu demo tính mốc theo ngày tạo: trước buổi demo chạy lệnh làm mới ở mục 0.6.

### 0.3. Giả lập tiền vào (SePay)

SePay không gọi được về máy cá nhân. Sau khi trang hiện mã QR, giả lập ngân hàng báo có tiền:

```
node devops/gia-lap-chuyen-khoan.js "<nội dung dưới mã QR>" <số tiền>
```

| Thanh toán | Nội dung | Ví dụ |
|---|---|---|
| Cọc lịch khám | `O2O xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "O2O 1a2b3c" 50000` |
| Cọc tư vấn | `TV xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "TV 1a2b3c" 50000` |
| Đơn mỹ phẩm | `SP xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "SP 1a2b3c" 472000` |

Muốn test chuyển thừa hoặc thiếu thì nhập số tiền lớn hơn hoặc nhỏ hơn số trên trang.

### 0.4. Giả lập GHN báo trạng thái

GHN thật cũng không gọi được về máy cá nhân. Sau khi đơn đã có mã vận đơn:

```
node devops/gia-lap-ghn.js <mã vận đơn> <trạng thái> banhang1@gmail.com <mật khẩu>
```

| Trạng thái | Ý nghĩa |
|---|---|
| `picked` | Shipper đã lấy hàng |
| `delivered` | Giao thành công (đơn giao hàng) hoặc hàng hoàn trả đã về kho |
| `cancel` | GHN hủy vận đơn |
| `returned` | GHN hoàn hàng về kho (đơn giao) hoặc không lấy được hàng (đơn hoàn trả) |

Nếu `service-commerce/.env` có `GHN_WEBHOOK_SECRET` thì bỏ email, mật khẩu ở cuối lệnh.

> **Lưu ý:** bấm "Tạo đơn - Gửi GHN" hoặc "Tạo đơn GHN lấy hàng" là tạo **vận đơn thật** trên GHN. Sau khi test xong, vào trang quản lý GHN hủy các vận đơn đó.

### 0.5. Chế độ demo: rút ngắn thời gian chờ

Các mốc chờ của nghiệp vụ đọc từ `.env`. Để trống là quy định thật; khi demo đặt ngắn lại để không phải chờ. Thêm vào `.env`, **khởi động lại service-booking / service-commerce**, demo xong xóa đi. Giao diện tự lấy cùng giá trị từ server nên nút bấm luôn khớp.

| Biến | Thật | Demo gợi ý | Ca test |
|---|---|---|---|
| `PAYMENT_HOLD_MINUTES` (booking) | 15 phút | `2` | 1.7, 1.8, 4.5 |
| `ORDER_PAYMENT_HOLD_MINUTES` (commerce) | 15 phút | `2` | 5.5 |
| `NO_SHOW_GRACE_MINUTES` (booking) | 15 phút | `1` | 2.4 |
| `RESCHEDULE_MIN_HOURS` (booking) | 24 giờ | `1` | 2.2, 2.3 |
| `CONSULT_ROOM_CLOSE_MINUTES` (booking) | 45 phút | `5` | 4.7 |
| `CONSULT_MIN_SESSION_MINUTES` (booking) | 5 phút | `1` | 4.6 |
| `CONSULT_RESULT_DEADLINE_HOURS` (booking) | 24 giờ | `0.2` (12 phút) | 4.8 |
| `ATTENDANCE_QR_TTL_SECONDS` (booking) | 20 giây | `60` | 8.1, 8.2 |
| `ATTENDANCE_EXPLAIN_HOURS` (booking) | 24 giờ | `0.2` (12 phút) | 8.4, 8.6 |

Kiểm tra giá trị đang áp dụng: mở http://localhost:4000/api/booking/config/timing.

Giờ ca làm việc (08:00 - 12:00, 13:00 - 17:00) không đổi được: các ca cần bác sĩ, nhân viên đang trong ca (khách đến thẳng, mời vào phòng, chấm công) phải demo trong giờ đó.

### 0.6. Làm mới dữ liệu demo theo ngày hôm nay

Trước buổi demo (backend đang chạy), ở thư mục gốc dự án:

```
node devops/seed-demo/lam-moi.js
```

Lệnh sao lưu database, xóa dữ liệu demo cũ cùng những gì phát sinh từ nó trong lúc demo, tạo lại dữ liệu 3 tháng tính tới hôm nay và lập bảng lương. Sau đó các mục "hôm nay", "3 ngày tới" lại có dữ liệu.

---

## 1. Đặt lịch khám online và thanh toán cọc (sơ đồ 01)

Người test: khách (trang 3001, menu **Đặt lịch**), CSKH (trang 3000, **Đối soát tiền vào**).

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 1.1 | Khung giờ còn trống? → Không | Khách chọn bác sĩ, ngày, rồi chọn giờ đã có người đặt | Giờ đó bị khóa (xám), không bấm được; muốn đặt phải chọn giờ khác |
| 1.2 | Hồ sơ đã từng khám? → Rồi | Đăng nhập `phuc.lh3@glowskin.demo`, đặt lịch cho hồ sơ "Bản thân" | Không có bước thanh toán, phí khám 0đ, lịch hiện ngay ở **Sổ lịch khám** trạng thái đã xác nhận |
| 1.3 | Lần đầu → Chuyển khoản → Số tiền đủ | Khách mới đặt lịch khám trực tiếp, trang hiện QR 50.000đ. Chạy giả lập đúng nội dung, đúng 50.000 | Vài giây sau trang báo đã thanh toán; Sổ lịch khám: đã xác nhận; **Đối soát tiền vào**: giao dịch đã khớp tự động |
| 1.4 | Lần đầu, khám online | Như 1.3 nhưng chọn **Khám online** | Số tiền là 100.000đ (trả trước toàn bộ phí khám) |
| 1.5 | Số tiền → Thừa | Như 1.3 nhưng giả lập 80.000 | Lịch vẫn được xác nhận; Đối soát có dòng **chuyển thừa** chờ CSKH hoàn phần dư. CSKH bấm **Xử lý**, nhập mã giao dịch hoàn tiền → dòng chuyển sang đã xử lý |
| 1.6 | Số tiền → Thiếu | Như 1.3 nhưng giả lập 20.000 | Lịch vẫn chờ thanh toán; Đối soát có dòng **chuyển thiếu** để CSKH liên hệ khách |
| 1.7 | Hết giờ giữ chỗ | Đặt lịch, không thanh toán, đợi hết thời gian giữ chỗ (mục 0.5) | Lịch tự biến mất, giờ đó trống lại cho người khác đặt |
| 1.8 | Tiền về sau khi hết giữ chỗ | Sau ca 1.7, chạy giả lập với mã lịch cũ | Đối soát có dòng **chưa khớp**, lý do không còn lịch chờ thanh toán; CSKH xử lý hoàn tiền |
| 1.9 | (phụ) Khách rời trang thanh toán | Đặt lịch, tới trang QR thì bấm quay lại / đóng trang | Lịch giữ chỗ bị xóa, giờ trống lại |

## 2. Hủy, đổi lịch và khách không đến (sơ đồ 02)

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 2.1 | Yêu cầu → Hủy lịch | Khách vào **Sổ lịch khám**, lịch đã cọc → **Hủy lịch** | Hệ thống hỏi xác nhận mất cọc; đồng ý thì lịch "Đã hủy". Quản lý xem **Báo cáo doanh thu**: mục cọc bị mất tăng đúng số tiền cọc |
| 2.2 | Đổi lịch → Được | Lịch còn hơn 24 giờ, chưa đổi lần nào → **Đổi lịch** → chọn ngày giờ mới → xác nhận | Lịch sang giờ mới, không mất cọc; nút Đổi lịch không còn (chỉ đổi 1 lần) |
| 2.3 | Đổi lịch → Không được | Thử đổi lịch còn dưới 24 giờ, hoặc lịch vừa đổi ở ca 2.2 | Không đổi được, hệ thống báo liên hệ CSKH |
| 2.4 | Quá giờ hẹn 15 phút → Khách không đến | CSKH vào **Quản lý lịch hẹn**, mở lịch đã quá giờ hẹn 15 phút → **Khách không đến** | Lịch chuyển "Khách không đến", giữ cọc. Chưa đủ 15 phút thì không có nút này |
| 2.5 | Bác sĩ vắng, sự cố → Hủy và hoàn cọc | CSKH mở lịch đã cọc → **Hủy Lịch** → chọn bên yêu cầu **Phòng khám**, lý do ≥ 10 ký tự | Lịch hiện ở khối **Chờ hoàn cọc** bên phải. Bấm **Đã chuyển khoản hoàn cọc**, nhập mã giao dịch → lịch rời khối, khách thấy đã hoàn cọc |
| 2.6 | (phụ) Bác sĩ xin nghỉ đột xuất | Bác sĩ gửi đơn nghỉ ở **Lịch làm việc của tôi**; quản lý duyệt ở **Lịch làm việc** | Khách trong ca đó chuyển sang tab **Xử lý dời lịch** ở Không gian tư vấn để CSKH đổi giờ |

## 3. Tiếp nhận và khám tại phòng khám (sơ đồ 03)

Cần một lịch hẹn **hôm nay**: CSKH tạo ở **Quản lý lịch hẹn → Tạo Lịch Mới**, hoặc khách tự đặt giờ còn trống trong hôm nay.

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 3.1 | Đã đặt lịch hôm nay → Rồi | CSKH vào **Không gian tư vấn**, tab **Khách đặt hôm nay** → chọn khách → sàng lọc an toàn, nhập lý do khám, thói quen chăm sóc da → lưu | Khách rời danh sách, vào hàng chờ của bác sĩ đã đặt |
| 3.2 | Chưa đặt → Tìm hoặc tạo hồ sơ | **Tiếp nhận khách tại quầy** → nhập SĐT chưa có trong hệ thống → tạo hồ sơ mới | Khách vào tab **Danh sách chờ**, không thu cọc; hóa đơn ghi sẵn phí khám 100.000đ chưa thu |
| 3.3 | Khách cũ đến thẳng | Như 3.2 nhưng nhập SĐT của khách đã từng khám | Khách vào Danh sách chờ, phí khám 0đ |
| 3.4 | Khách còn chờ? → Không | Ở Danh sách chờ, chọn khách → báo khách đã rời đi | Khách rời danh sách, không phát sinh phí |
| 3.5 | Khách còn chờ? → Có → Chuyển cho bác sĩ | Chọn khách ở Danh sách chờ → xem tình trạng bác sĩ → mời vào phòng. Thử chọn bác sĩ đang khám hoặc sắp hết ca | Có cảnh báo cần xác nhận trước khi chuyển; xác nhận xong khách vào hàng chờ bác sĩ |
| 3.6 | Bác sĩ khám xong khách trước → Bắt đầu khám | Bác sĩ vào **Không gian khám bệnh** → chọn khách đầu hàng chờ → **Bắt đầu khám**. Thử bắt đầu khách thứ hai khi chưa xong khách đầu | Mỗi lúc chỉ khám 1 khách; **Trả về hàng chờ** đưa khách về lại hàng chờ |
| 3.7 | Có cảnh báo chống chỉ định? → Không | Nhập chẩn đoán, ghi chú, hẹn tái khám, kê dịch vụ, gói, sản phẩm → **Hoàn tất khám** | Khách chuyển sang chờ thu tiền; bệnh án hiện trong **Tra cứu Sổ y bạ** |
| 3.8 | Có cảnh báo chống chỉ định? → Có | Khám hồ sơ đã khai **có kế hoạch mang thai** (`thao.vtp20@glowskin.demo`), kê **Gel trị mụn Klenzit C (Adapalene)** | Hiện cảnh báo **chống chỉ định**; muốn giữ phải ghi lý do, hoặc sửa đơn bỏ sản phẩm đó |
| 3.8b | Cảnh báo mức thấp | Khám hồ sơ **đang cho con bú** (`tam.htt8@glowskin.demo`), kê Klenzit C hoặc **Điện di Ion Vitamin C** | Chỉ hiện lưu ý / thận trọng, vẫn hoàn tất khám được mà không cần ghi lý do |
| 3.9 | Chốt hóa đơn | CSKH vào **Thu tiền khách** → chọn khách → kiểm tra dịch vụ, gói, sản phẩm → nhập voucher (ví dụ `GLOWSKIN10` cho mỹ phẩm) → **Áp dụng** → thu tiền | Hóa đơn trừ đúng tiền cọc và cọc tư vấn (nếu có); số phải thu = tổng - cọc - giảm giá |
| 3.10 | Có dịch vụ hoặc gói? → Có | Thu tiền cho khách có gói liệu trình | Kỹ thuật viên thấy khách ở **Không gian kỹ thuật viên** (buổi 1); khách thấy gói ở **Gói liệu trình** |
| 3.11 | Có dịch vụ hoặc gói? → Không | Thu tiền cho khách chỉ khám và mua sản phẩm | Hoàn tất; đơn mỹ phẩm tại quầy hiện ở tab **Đơn tại quầy** của nhân viên bán hàng |

## 4. Tư vấn chuyên gia online (sơ đồ 04)

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 4.1 | Mở ca tư vấn | Quản lý vào **Tư vấn chuyên gia → Ca tư vấn** → chọn chuyên gia, ngày, ca → **Mở ca** | Khách thấy giờ trống của chuyên gia ở trang **Tư vấn chuyên gia** |
| 4.2 | Hợp lệ? → Không | Khách chọn giờ trùng với lịch khám hoặc lịch tư vấn khác của chính mình | Bị chặn, phải chọn giờ khác |
| 4.3 | Hợp lệ → Đủ cọc | Khách chọn lĩnh vực, chuyên gia, giờ, nhập câu hỏi → thanh toán → giả lập `TV xxxxxx` 50.000 | Lịch tư vấn đã xác nhận; chuyên gia thấy ở **Không gian chuyên gia** |
| 4.4 | Đủ cọc? → Thiếu | Như 4.3 nhưng giả lập số tiền nhỏ hơn | Lịch chưa xác nhận; Đối soát có dòng chuyển thiếu |
| 4.5 | Hết giờ giữ chỗ | Đặt nhưng không thanh toán, đợi hết giờ giữ chỗ | Lịch tư vấn bị hủy, giờ trống lại |
| 4.6 | Ai đã vào phòng? → Cả hai | Đến giờ hẹn: khách vào phòng từ Sổ lịch khám, chuyên gia bấm **Vào phòng tư vấn**. Sau ít nhất 5 phút chuyên gia nhập nhận định, lời khuyên, gợi ý sản phẩm → **Gửi cho khách** | Lịch hoàn thành; khách xem kết quả trong Sổ lịch khám. Nếu chuyên gia khuyên đi khám, lần khám sau hóa đơn trừ 50.000đ cọc tư vấn (thấy ở ca 3.9) |
| 4.7 | Ai đã vào phòng? → Khách vắng | Chỉ chuyên gia vào phòng; đợi phòng đóng (45 phút sau giờ hẹn) | Lịch "Khách vắng", khách mất cọc |
| 4.8 | Chuyên gia vắng / quá 24 giờ chưa gửi kết quả | Khách vào phòng, chuyên gia không vào (hoặc không gửi kết quả trong 24 giờ) | Lịch chuyển chờ hoàn cọc; quản lý / CSKH bấm **Đã hoàn cọc** và nhập mã giao dịch |

Ca 4.7 và 4.8 phải chờ thời gian thật. Trong dữ liệu demo đã có sẵn lịch "Khách vắng" và "Chuyên gia vắng (đã hoàn cọc)" để xem kết quả ở **Tư vấn chuyên gia → Lịch tư vấn**.

## 5. Mua mỹ phẩm online (sơ đồ 05)

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 5.1 | Cách thanh toán → COD | Khách vào **Mỹ phẩm** → thêm vào giỏ → nhập địa chỉ → chọn thanh toán khi nhận hàng → đặt | Phí ship GHN được tính; đơn "Chờ duyệt"; tồn kho sản phẩm giảm |
| 5.2 | Voucher | Như 5.1, đơn từ 300.000đ, nhập `GLOWSKIN10` | Giảm 10% (tối đa 50.000đ); lượt dùng mã tăng 1 |
| 5.3 | VietQR → Số tiền đủ | Chọn chuyển khoản → giả lập `SP xxxxxx` đúng số tiền (gồm phí ship) | Đơn "Đã thanh toán - chờ duyệt" ở trang nhân viên bán hàng |
| 5.4 | Số tiền → Thừa / Thiếu | Giả lập lớn hơn / nhỏ hơn | Thừa: đơn đã thanh toán, Đối soát ghi phần dư. Thiếu: đơn vẫn chờ, Đối soát ghi chuyển thiếu |
| 5.5 | Quá 15 phút chưa trả | Chọn chuyển khoản, không trả, đợi hết giờ (mục 0.5) | Đơn tự hủy, tồn kho cộng lại, voucher được trả lượt |
| 5.6 | Duyệt? → Có → Đóng gói → Giao | Nhân viên bán hàng duyệt đơn → đóng gói → **Tạo đơn - Gửi GHN** → giả lập `picked` | Đơn có mã vận đơn, chuyển "Đang giao hàng"; khách thấy "Đang giao" |
| 5.7 | GHN báo → Giao thành công | Giả lập `delivered` (hoặc nút giả lập giao thành công trên trang) | Đơn "Hoàn thành"; khách đánh giá sản phẩm được; báo cáo doanh thu mỹ phẩm tăng |
| 5.8 | Duyệt? → Không | Nhân viên hủy đơn | Sang sơ đồ 06 |
| 5.9 | GHN hủy hoặc hoàn hàng | Giả lập `cancel` / `returned` | Sang sơ đồ 06 (ca 6.3, 6.4) |

## 6. Hủy đơn mỹ phẩm (sơ đồ 06)

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 6.1 | Bên yêu cầu → Phòng khám | Nhân viên bán hàng mở đơn chưa giao xong → hủy → chọn **Phòng khám**, lý do ≥ 10 ký tự → **Xác nhận hủy** | Đơn "Đã hủy", cộng kho, trả lượt voucher. Đơn đã chuyển khoản → vào tab **Chờ hoàn tiền**, nhập mã giao dịch để hoàn tất |
| 6.2 | Bên yêu cầu → Khách | Như 6.1 nhưng chọn **Khách** | Đơn hủy, cộng kho, **không** trả lượt voucher; đơn đã chuyển khoản vẫn phải hoàn tiền |
| 6.3 | GHN hủy vận đơn | Đơn đã có mã vận đơn → giả lập `cancel` | Đơn hủy, cộng kho, trả lượt voucher, bên hủy là đơn vị vận chuyển |
| 6.4 | GHN hoàn hàng → Lỗi vận chuyển | Đơn có voucher, đang giao → giả lập `returned` → tab **Cần xem xét** → chọn **Lỗi vận chuyển** | Trả lượt voucher; đơn đã chuyển khoản sang Chờ hoàn tiền |
| 6.5 | GHN hoàn hàng → Khách không nhận | Như 6.4 nhưng chọn **Khách không nhận** | Không trả lượt voucher; đơn đã chuyển khoản sang Chờ hoàn tiền |
| 6.6 | Đơn đã chuyển khoản? → Không | Hủy đơn COD | Đơn hủy, không có bước hoàn tiền |

## 7. Hoàn / trả hàng (sơ đồ 07)

Có sẵn: `khang.lm11@glowskin.demo` có một yêu cầu đang chờ duyệt.

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 7.1 | Gửi yêu cầu | Khách vào **Đơn hàng**, đơn hoàn thành trong 7 ngày → yêu cầu hoàn trả → chọn sản phẩm, lý do, ảnh, tài khoản nhận tiền | Yêu cầu "Chờ duyệt"; nhân viên thấy ở **Hoàn / trả hàng**. Đơn quá 7 ngày không có nút này |
| 7.2 | Duyệt? → Không | Nhân viên → **Từ chối**, ghi lý do | Khách thấy "Yêu cầu bị từ chối" kèm lý do |
| 7.3 | Duyệt? → Có → Tạo đơn lấy hàng | **Duyệt yêu cầu** → **Tạo đơn GHN lấy hàng** | Trạng thái "GHN đang lấy hàng", có mã vận đơn |
| 7.4 | Lấy hàng thất bại | Giả lập `returned` (hoặc `cancel`) với mã vận đơn lấy hàng | Quay về "Đã duyệt - chờ tạo GHN" để tạo lại đơn lấy hàng |
| 7.5 | Đã lấy về kho | Giả lập `delivered` | "Kho đã nhận - chờ kiểm tra" |
| 7.6 | Hàng hợp lệ? → Không | **Không đạt - Từ chối**, ghi lý do | Yêu cầu bị từ chối, không hoàn tiền |
| 7.7 | Hợp lệ → Còn bán lại được | **Đạt - Ghi nhận hoàn tiền**, chọn nhập lại kho, nhập mã giao dịch | "Đã hoàn tiền"; tồn kho sản phẩm tăng; báo cáo doanh thu trừ phần tiền hàng đã hoàn |
| 7.8 | Hợp lệ → Không bán lại được | Như 7.7 nhưng không nhập lại kho | "Đã hoàn tiền"; tồn kho không đổi |

## 8. Chấm công nhân viên (sơ đồ 08)

Chuẩn bị:
1. Quản lý vào **Chấm công nhân viên → Máy chấm công → Mở trang máy chấm công**, kích hoạt thiết bị.
2. Nhân viên phải có ca hôm nay (quản lý xếp ở **Lịch làm việc**).

Mã QR chỉ sống 20 giây. Khi test trên một máy: dùng điện thoại chụp mã QR trên màn hình máy chấm công, rồi trong 20 giây giơ ảnh đó trước webcam ở trang **Chấm công** của nhân viên.

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 8.1 | Kết quả → Hợp lệ → Không vi phạm | Trong khoảng 20 phút trước đến 10 phút sau giờ vào ca: máy chấm công bấm hiện mã, nhân viên quét → chụp ảnh khuôn mặt | Ca hiện "Đúng giờ" |
| 8.2 | Kết quả → Mã hết hạn | Quét mã đã hiện quá 20 giây | Báo mã hết hạn, phải quét mã mới |
| 8.3 | Kết quả → Ngoài giờ | Quét khi không có ca đang mở | Báo không có ca đang mở |
| 8.4 | Có vi phạm → Giải trình | Vào ca muộn quá thời gian mở mã; nhân viên gửi giải trình (lý do, cam kết) trong 24 giờ | Quản lý thấy ở **Chấm công nhân viên** chờ duyệt |
| 8.5 | Chấp nhận? → Có / Không | Quản lý **Duyệt** hoặc **Từ chối** giải trình | Duyệt: không tính vi phạm. Từ chối: giữ vi phạm, tính vào lương |
| 8.6 | Hết ca không chấm công | Nhân viên không quét suốt ca, không giải trình trong 24 giờ | Hệ thống tự ghi vắng ca đó |
| 8.7 | (phụ) Ra ca, về sớm | Quét mã ra ca trong 30 phút sau giờ kết thúc ca; muốn về sớm thì gửi đơn xin về sớm | Ra ca hợp lệ; về sớm được quản lý duyệt mới không tính vi phạm |

## 9. Tính lương hàng tháng (sơ đồ 09)

Dữ liệu demo đã có: tháng 8, 9 đã chi trả; tháng 10 đã duyệt, chờ chi trả; tháng hiện tại đang tính.

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 9.1 | Còn vấn đề? → Có | Quản lý vào **Lương → Bảng lương**, chọn tháng hiện tại | Bước "Chốt công" liệt kê việc còn treo theo nhóm: chờ quản lý duyệt, chờ nhân viên giải trình, ca chưa diễn ra; chưa tạo được bảng lương |
| 9.2 | Duyệt giải trình → tổng hợp lại | Duyệt các giải trình đang chờ ở Chấm công nhân viên, quay lại Bảng lương | Số vấn đề giảm |
| 9.3 | Còn vấn đề? → Không → Tạo bảng lương nháp | Chọn tháng đã xử lý hết vấn đề → tạo bảng lương | Có lương ca, thưởng chuyên cần (ít vi phạm), vi phạm thường / nghiêm trọng của từng người |
| 9.4 | Thêm khoản cộng / trừ | Thêm khoản cộng hoặc trừ kèm lý do cho một nhân viên | Tổng nhận của người đó thay đổi đúng số tiền |
| 9.5 | Duyệt và khóa → Mở phiếu lương | **Duyệt & khóa**; nhân viên đó đăng nhập vào **Phiếu lương** | Nhân viên xem được phiếu lương tháng đó |
| 9.6 | Chuyển lương | Tháng 10 (dữ liệu demo) → **Đã chi trả lương**, nhập mã lệnh chuyển | Bảng lương ghi đã chi trả; không mở khóa được nữa |
| 9.7 | (phụ) Mở khóa | Mở khóa một tháng đã khóa nhưng chưa chi trả, ghi lý do | Về lại bảng nháp; tháng sau đang khóa thì phải mở khóa tháng sau trước |

## 10. Xuất vật tư và nhập kho (sơ đồ 10)

Có sẵn: một đề xuất nhập vật tư chờ duyệt (vật tư sắp chạm mức tối thiểu).

| Ca | Nhánh trong sơ đồ | Thực hiện | Kết quả đúng |
|---|---|---|---|
| 10.1 | Vượt định mức? → Không | Kỹ thuật viên hoàn thành buổi dịch vụ, giữ nguyên số vật tư gợi ý theo định mức | Kho trừ theo lô hạn dùng gần nhất trước; buổi hiện trong **Vật tư & Định mức → Lịch sử xuất & Thống kê** |
| 10.2 | Vượt định mức? → Có | Tăng số vật tư cao hơn định mức | Bắt buộc nhập lý do mới lưu được |
| 10.3 | Dưới tồn tối thiểu → Chưa có đề xuất | Dùng vật tư tới khi xuống dưới mức tối thiểu | Hệ thống tự tạo đề xuất nhập hàng chờ quản lý duyệt |
| 10.4 | Dưới tồn tối thiểu → Đã có đề xuất | Dùng tiếp vật tư đó | Không tạo thêm đề xuất trùng |
| 10.5 | Duyệt? → Không | Quản lý vào **Đề xuất nhập hàng** → **Từ chối** | Đề xuất bị từ chối |
| 10.6 | Duyệt? → Có → Đặt hàng → Nhận hàng | **Duyệt** → ghi nhà cung cấp, ngày dự kiến → **Đã đặt hàng** → khi hàng về **Nhận hàng**, nhập số lô, hạn dùng, giá nhập | Tồn kho tăng, có lô mới trong **Lô & Kiểm kê**; lô đã hết hạn không cho nhập |

---

## Ghi lại kết quả

| Sơ đồ | Số ca | Đạt | Không đạt | Ghi chú |
|---|---|---|---|---|
| 01 Đặt lịch khám | 9 | | | |
| 02 Hủy, đổi lịch | 6 | | | |
| 03 Tiếp nhận và khám | 12 | | | |
| 04 Tư vấn chuyên gia | 8 | | | |
| 05 Mua mỹ phẩm | 9 | | | |
| 06 Hủy đơn | 6 | | | |
| 07 Hoàn trả | 8 | | | |
| 08 Chấm công | 7 | | | |
| 09 Tính lương | 7 | | | |
| 10 Vật tư, nhập kho | 6 | | | |
