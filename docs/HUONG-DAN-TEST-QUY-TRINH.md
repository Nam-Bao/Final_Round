# Hướng dẫn test toàn bộ quy trình GlowSkin theo từng vai trò

Tài liệu đi theo **một câu chuyện liền mạch**: quản lý thiết lập → khách đặt lịch → CSKH đón khách → bác sĩ khám → CSKH thu tiền → KTV làm dịch vụ (trừ vật tư) → quản lý xem báo cáo, duyệt nhập hàng, tính lương. Làm theo đúng thứ tự để dữ liệu bước trước dùng được cho bước sau.

- Web khách hàng: **http://localhost:3001**
- Trang quản trị (nhân viên): **http://localhost:3000**
- Mẹo: mở mỗi vai trò ở **một cửa sổ ẩn danh / trình duyệt khác** để đăng nhập nhiều tài khoản cùng lúc.

---

## 0. Chuẩn bị

### 0.1. Tài khoản

| Vai trò | Email | Mật khẩu | Đăng nhập ở |
|---|---|---|---|
| Admin | `abc@gmail.com` | (mật khẩu nhóm đã đặt) | 3000 |
| Quản lý chung (GEN_MANAGER) | `quanly@gmail.com` | (mật khẩu nhóm đã đặt) | 3000 |
| Bác sĩ | `bacsi@gmail.com` (BS. Nguyễn Điền Thịnh), `bacsi1@gmail.com`, `bacsi2@gmail.com` | (mật khẩu nhóm đã đặt) | 3000 |
| CSKH (CONSULTANT) | `cskh.test@test.local` | `TestGlow@2026` | 3000 |
| Kỹ thuật viên | `ktv.test@test.local` | `TestGlow@2026` | 3000 |
| Nhân viên bán hàng (SALES) | **chưa có** – Admin tạo ở bước 1.1 | | 3000 |
| Chuyên gia tư vấn (6 người) | `tuvan.dalieu@test.local`, `tuvan.dinhduong@test.local`, `tuvan.mypham@test.local` (+ `...2@test.local`) | `TestGlow@2026` | 3000 |
| Khách hàng (12 người) | `thuha.test@test.local`, `minhanh.test@test.local`, `quocbao.test@test.local`, ... | `TestGlow@2026` | 3001 |

Tài khoản `@test.local` là dữ liệu test, xoá sạch bằng `node devops/xoa-du-lieu-test.js --xoa` (lưu ý: lệnh này xoá cả 6 chuyên gia và tài khoản test bạn tạo thêm có đuôi `@test.local`).

### 0.2. Thanh toán khi test trên máy cá nhân

SePay **không gọi được về localhost**, nên sau khi trang hiện mã QR, giả lập "đã nhận tiền" bằng lệnh (ở thư mục `Final_Round`):

```
node devops/gia-lap-chuyen-khoan.js "<nội dung chuyển khoản hiện dưới mã QR>" <số tiền>
```

| Thanh toán | Nội dung | Ví dụ |
|---|---|---|
| Cọc lịch khám | `O2O xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "O2O 1A2B3C" 100000` |
| Cọc tư vấn chuyên gia | `TV xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "TV 1A2B3C" 50000` |
| Đơn mỹ phẩm chuyển khoản | `SP xxxxxx` | `node devops/gia-lap-chuyen-khoan.js "SP 1A2B3C" 450000` |

Vài giây sau trang thanh toán tự chuyển sang "Đã thanh toán". Mọi khoản tiền vào đều được ghi sổ ở **Báo cáo → Đối soát tiền vào** (xem 5.6): chuyển thiếu hoặc sai mã thì lịch không tự xác nhận mà khoản tiền nằm ở mục **Chưa xử lý**. Muốn thử chuyển khoản thật thì mã QR đã là tài khoản TPBank thật (Nguyen Dien Thinh), nhưng webhook thật chỉ chạy khi hệ thống có địa chỉ public.

### 0.3. ⚠️ Lưu ý về GHN (giao hàng)

GHN đang dùng **token thật (môi trường production)**. Khi NVBH **duyệt đơn giao hàng**, hệ thống **tạo vận đơn thật** trên GHN. Khi test:
- Ưu tiên đơn **nhận tại quầy**, hoặc
- Nếu lỡ tạo vận đơn thì vào trang quản lý GHN (khachhang.ghn.vn) **huỷ vận đơn** ngay.
Phần **tính phí ship** thì an toàn (chỉ hỏi giá, không tạo đơn).

---

## 1. Admin – thiết lập hệ thống (http://localhost:3000, `abc@gmail.com`)

### 1.1. Quản lý người dùng
- [ ] Menu **Hệ thống → Quản lý người dùng** → **Tạo tài khoản**: tạo tài khoản NVBH, ví dụ `nvbh.test@test.local`, mật khẩu `TestGlow@2026`, vai trò **SALES**.
- [ ] Menu **Hệ thống → Hồ sơ nhân sự**: mở hồ sơ một bác sĩ, xem / sửa thông tin nhân sự và chuyên môn (học vấn, bằng cấp, kinh nghiệm, quá trình công tác hiện ở trang Đội ngũ bác sĩ bên web khách).
- [ ] Mở hồ sơ một chuyên gia: lĩnh vực tư vấn, thù lao / buổi (nội bộ, khách không thấy).
- [ ] Nhân viên chưa có hồ sơ hiện nhãn **Chưa có hồ sơ**; giấy tờ sắp hết hạn hiện nhãn **Hết hạn**. Trang này có CCCD, tài khoản ngân hàng, mã số thuế nên chỉ Admin và Quản lý mở được.

### 1.2. Kho & Sản phẩm, vật tư
- [ ] **Kho hàng → Kho & Sản phẩm**: chọn 1 mỹ phẩm → **Thông tin web**: xem thành phần, bật / tắt bán web, **Giảm (%)** + thời gian áp dụng (vd 15% trong 7 ngày). Cột Giá bán hiện nhãn "Online -15%".
- [ ] **Kho hàng → Vật tư & Định mức → Tồn kho vật tư**: 10 vật tư thật (xuất xứ, nhà sản xuất, số công bố, link nguồn), cột **Hạn gần nhất**; bấm **Thông tin** để sửa tồn tối thiểu.
- [ ] Tab **Định mức theo dịch vụ**: sửa định mức 1 dịch vụ (vd Lấy nhân mụn).

### 1.3. Website
- [ ] **Marketing & Website → Quản lý trang**: banner, popup, tin tức; duyệt bài bác sĩ gửi (xem bước 4.3).

---

## 2. Quản lý chung – vận hành (`quanly@gmail.com`)

### 2.1. Xếp ca làm (BẮT BUỘC trước khi khách đặt lịch)
Hiện chỉ BS. Hiếu và BS. Khang có ca đến 07/11; BS. Thịnh, CSKH, KTV chưa có ca.
- [ ] **Nhân sự → Lịch làm việc**: xếp ca **hôm nay và vài ngày tới** cho: 1 bác sĩ, `CSKH Test`, `KTV Test`, NVBH vừa tạo. Lịch khám chỉ có **ca sáng (08:00–12:00) và chiều (13:00–17:00)**, mỗi lượt **30 phút**.
- [ ] (Nếu muốn test chấm công) xếp ca **trùng giờ đang test**.

### 2.2. Máy chấm công
- [ ] Mở **http://localhost:3000/kiosk** trên một máy / tab riêng (máy tính bảng đặt ở quầy): đăng nhập bằng email + mật khẩu **quản lý**, đặt tên máy → máy hiện **mã QR chấm công** (tự đổi liên tục).
- [ ] **Nhân sự → Chấm công nhân viên**: thấy máy vừa kích hoạt trong mục **Máy chấm công**.

### 2.3. Mức lương
- [ ] **Lương → Mức lương ca**: nhập mức lương / ca (4 giờ) cho từng nhân viên, chọn ngày áp dụng, ghi lý do.

### 2.4. Dịch vụ, gói, khuyến mãi
- [ ] **Dịch vụ → Dịch vụ spa lẻ / Gói lộ trình**: xem 13 dịch vụ, 6 gói.
- [ ] **Marketing & Website → Mã khuyến mãi**: tạo 1 mã giảm giá để khách dùng ở bước 3.

---

## 3. Khách hàng (http://localhost:3001, `thuha.test@test.local`)

### 3.1. Xem & tìm kiếm
- [ ] Trang chủ: 3 mục **Đang giảm giá / Mới lên kệ / Bán chạy**; nhãn **MỚI** (10 sản phẩm mới nhất), **GIẢM X%**.
- [ ] Ô **tìm kiếm** trên thanh menu: gõ không dấu "chong nang", "tham nam", "thinh" → gợi ý theo nhóm; Enter → trang `/tim-kiem`.
- [ ] **Mỹ phẩm**: các tab Tất cả / Mới / Bán chạy / Đang giảm giá; mở 1 sản phẩm → tab **Thành phần** (hoạt chất + nồng độ, bảng INCI). Thuốc kê đơn (Klenzit C) **vẫn hiện trên web để khách tra cứu** nhưng không có nút thêm giỏ / mua ngay: chỉ có nút **Tư vấn ngay** dẫn tới đặt lịch khám; bác sĩ kê trong buổi khám.
- [ ] **Đội ngũ bác sĩ** → **Hồ sơ**. Chân trang: **bản đồ** + nút **Chỉ đường**.

### 3.2. Sàng lọc da AI
- [ ] **Sàng lọc AI**: đồng ý chính sách ảnh, tải ảnh khuôn mặt → AI khoanh vùng mụn / thâm; chatbot tư vấn (Gemini).
- [ ] **Chưa đăng nhập** (cửa sổ ẩn danh): vào **Sàng lọc AI** được, quét **1 lần** (theo IP, 24 giờ); lần 2 báo phải đăng nhập. Đăng nhập thì được **3 lượt / ngày**.
- [ ] **Chưa đăng nhập** vẫn chat với **chatbot AI**; bấm chat CSKH thì được nhắc đăng nhập. Đăng nhập rồi mới có nút **Gặp bộ phận CSKH**.
- [ ] Dưới kết quả có **Nhận xét tham khảo** do Gemini viết cho khách: mô tả theo vùng da, mục **Bạn nên lưu ý** (chăm sóc da / thói quen sinh hoạt / ăn uống) và **Sản phẩm phù hợp tại GlowSkin**. Bấm sản phẩm → mở đúng trang sản phẩm.
  - Sản phẩm được **lọc theo quy tắc** trước: vấn đề da AI phát hiện (mụn viêm, mụn đầu đen/trắng, thâm, nám) khớp với nhãn **Vấn đề da xử lý được** của sản phẩm (đang bán trên web, còn hàng), thêm bước làm sạch / chống nắng. Gemini chỉ chọn tối đa 3 trong danh sách đó.
  - Gemini lỗi / hết lượt: vẫn có lời khuyên mẫu và sản phẩm theo quy tắc.
  - Quản lý gắn nhãn ở **Kho & Sản phẩm → Thông tin bán web → Vấn đề da xử lý được**; sản phẩm cũ được hệ thống gắn nhãn ban đầu khi khởi động service-commerce.

### 3.3. Mua mỹ phẩm online
- [ ] Thêm 2 sản phẩm (1 đang giảm giá, 1 giá thường) vào giỏ → giỏ hiện giá đã giảm + giá gốc gạch ngang.
- [ ] Thanh toán: chọn Tỉnh / Quận / Phường → **phí ship GHN** tự tính; nhập mã giảm giá (bước 2.4). Mã **không cộng dồn với khuyến mãi**: chỉ tính trên sản phẩm giá thường; giỏ toàn hàng đang giảm giá thì báo không áp dụng.
- [ ] Chọn **Chuyển khoản**: hiện QR TPBank, nội dung `SP xxxxxx` → giả lập (mục 0.2) → đơn chuyển "Đã thanh toán". Hoặc chọn **COD**.
- [ ] **Hồ sơ của tôi → Đơn hàng Mỹ phẩm**: theo dõi đơn.

### 3.4. Đặt lịch khám
- [ ] **Đặt lịch → Đặt lịch khám**: chọn hồ sơ người khám, hình thức **tại phòng khám** (hoặc **online qua video**), bác sĩ có ca (bước 2.1), ngày giờ.
- [ ] Trang thanh toán cọc: QR nội dung `O2O xxxxxx` → giả lập → lịch chuyển **Đã xác nhận**.
- [ ] **Sổ lịch khám**: thấy lịch; thử **huỷ** 1 lịch khác (khách tự huỷ = mất cọc, theo chính sách).
- [ ] Bấm **Đổi lịch** ở một lịch: chỉ đổi được **1 lần** và trước giờ khám **ít nhất 24 giờ**.
- [ ] Có lịch khám / tư vấn trong 24 giờ tới: web hiện **banner nhắc lịch**.
- [ ] Hồ sơ người khám đã từng khám (khách cũ): được **miễn cọc và miễn phí khám**, lịch xác nhận luôn.

### 3.5. Đặt lịch tư vấn chuyên gia
- [ ] **Đặt lịch → Tư vấn chuyên gia**: chọn lĩnh vực (Da liễu / Dinh dưỡng / Mỹ phẩm), chuyên gia, khung giờ (mỗi buổi **45 phút**, có cả ca tối 18:00–21:00), câu hỏi. Không đặt được nếu trùng giờ với lịch khám / tư vấn khác của chính khách.
- [ ] Cọc **50.000đ** QR `TV xxxxxx` → giả lập → lịch xác nhận. Cọc này **được trừ vào phí khám** nếu đi khám trong 30 ngày.

---

## 4. Nhân viên trong ngày khám (http://localhost:3000)

### 4.1. CSKH đón khách (`cskh.test@test.local`)
- [ ] **Không gian tư vấn** → tab **Khách đặt hôm nay**: chọn khách có lịch hôm nay → nhập triệu chứng, chụp / tải ảnh da trước khám → lưu (hồ sơ chuyển cho bác sĩ).
- [ ] Khung **Sàng lọc an toàn**: hỏi khách (mang thai, thuốc đang dùng, sẹo lồi, máy tạo nhịp, dị ứng...) → **Xác nhận đã hỏi khách**. CSKH hoặc bác sĩ hỏi đều được, nhưng phải hỏi lại **mỗi lần khám**.
- [ ] **Khách đến thẳng, không đặt trước:** bấm **Tiếp nhận khách tại quầy** → tìm theo số điện thoại, chưa có thì tạo hồ sơ (không cần email) → **Đưa vào danh sách chờ**. Không cọc, phí khám thu sau khi khám; khách cũ miễn phí. Khách chưa có tài khoản được cấp **mã hồ sơ**.
- [ ] Tab **Danh sách chờ**: chọn khách, xem tình trạng bác sĩ → **Mời Khách Vào Phòng**. Bác sĩ đang khám, đã có khách chờ, sắp có khách hẹn hoặc sắp hết ca thì hệ thống cảnh báo và CSKH phải xác nhận. Khách chờ lâu bỏ về: bấm **Khách đã rời đi** (không phát sinh tiền).
- [ ] Khách vừa tiếp nhận tại quầy: đăng ký tài khoản ở web (3001), nhập **Mã hồ sơ tại phòng khám** để gắn hồ sơ.
- [ ] Tab **Gọi thăm hỏi**: ghi nhật ký gọi điện sau điều trị.
- [ ] **Quản lý lịch hẹn**: đổi lịch, huỷ lịch do phòng khám (= hoàn cọc), xác nhận đã hoàn cọc.
- [ ] Quá giờ hẹn **15 phút** mà khách chưa đến: mở lịch → **Khách không đến** (khách mất cọc như tự huỷ; cọc tư vấn đã gắn được trả lại). Chưa đủ 15 phút thì không có nút này.
- [ ] **Hồ sơ khách hàng**: xem lịch sử khám.

### 4.2. Bác sĩ khám (`bacsi...@gmail.com` – bác sĩ khách đã chọn)
- [ ] **Không gian khám bệnh**: khách đã check-in hiện trong hàng chờ kèm **Thứ tự** (trang tự cập nhật mỗi 30 giây). Mở hồ sơ chỉ để xem, chưa đổi trạng thái.
- [ ] Bấm **Bắt đầu khám** (mỗi bác sĩ chỉ khám 1 khách một lúc; bấm nhầm thì **Trả về hàng chờ**) → ghi chẩn đoán, **kê dịch vụ / gói / mỹ phẩm (có số lượng)** → **Hoàn tất khám** (lịch chuyển "Chờ thu tiền"). Chưa bấm Bắt đầu khám thì không lưu được bệnh án.
- [ ] Tab **Lộ trình & Kê đơn** có khung **Sàng lọc an toàn**. Chọn dịch vụ / gói / sản phẩm thì cảnh báo hiện ngay kèm nguồn (xem 7.7). Không kê gì thì không cần sàng lọc.
- [ ] Lịch **khám online**: sau khi **Bắt đầu khám**, bấm **Vào phòng khám online** (video ZEGOCLOUD mở ở **tab riêng** để vừa gọi vừa ghi bệnh án) cùng lúc khách bấm **Vào phòng khám online** ở web khách (Sổ lịch khám).

### 4.3. Bác sĩ viết bài
- [ ] **Bài viết của tôi**: viết bài (loại Nghiên cứu / Kiến thức / Chăm sóc da) → gửi duyệt → Quản lý / Admin duyệt ở **Quản lý trang** → bài hiện ở Tin tức.

### 4.4. CSKH thu tiền (`cskh.test@test.local`)
- [ ] **Thu tiền khách**: chọn khách vừa khám → hoá đơn = phí khám + dịch vụ / gói + mỹ phẩm − giảm giá − **tiền cọc đã đóng** − **cọc tư vấn** (nếu có) → **Chốt Hóa Đơn** (tiền mặt / chuyển khoản).
- [ ] Kết quả: mỹ phẩm thành đơn tại quầy (trừ kho), gói / dịch vụ tạo **buổi trị liệu hôm nay** giao cho KTV đang trực.

### 4.5. Kỹ thuật viên làm dịch vụ (`ktv.test@test.local`)
- [ ] **Không gian kỹ thuật**: chọn buổi đang chờ → **Bắt đầu làm dịch vụ**.
- [ ] Tab đang làm: tải ảnh sau dịch vụ, bảng **Vật tư đã dùng** điền sẵn theo **định mức** → sửa số thực dùng (thử dùng **vượt** 1 vật tư: **bắt buộc ghi lý do**; thử ghi **thấp hơn** định mức: có cảnh báo cho quản lý) → **Hoàn thành**.
- [ ] Kết quả: kho vật tư tự trừ theo lô (lô hết hạn trước xuất trước, lô đã hết hạn không xuất); vật tư xuống dưới tồn tối thiểu → thông báo "Đã báo quản lý nhập hàng".

### 4.6. Chuyên gia tư vấn (`tuvan.dalieu@test.local` – chuyên gia khách đã đặt)
- [ ] Đăng nhập chỉ thấy **Lịch tư vấn của tôi**. Chuyên gia vào phòng được trước giờ hẹn 15 phút, khách vào **đúng giờ hẹn**; video mở ở tab riêng.
- [ ] Khách: **Sổ lịch khám** → mục tư vấn chuyên gia → **Vào phòng tư vấn**.
- [ ] Sau khi cả 2 bên vào phòng **ít nhất 5 phút**: chuyên gia nhập **Kết quả tư vấn** (nhận định, lời khuyên, sinh hoạt, hẹn theo dõi) → **Gửi cho khách**. Buổi chỉ **Hoàn thành** khi đã gửi kết quả; quá **24 giờ** không gửi thì khách được hoàn cọc và chuyên gia không có thù lao.
- [ ] Khách xem **Kết quả tư vấn**, rồi đánh giá. Lịch còn trên 24 giờ: thử **Đổi lịch** (1 lần).

### 4.7. Nhân viên bán hàng (`nvbh.test@test.local`, tạo ở 1.1)
- [ ] **Quản lý đơn hàng**: thấy đơn online của khách (bước 3.3) → duyệt (⚠️ đơn giao hàng tạo vận đơn GHN thật, xem 0.3); tạo đơn **nhận tại quầy** hộ khách.
- [ ] **Hoàn / trả hàng**: xử lý yêu cầu trả hàng của khách.

### 4.8. Chấm công (bác sĩ / CSKH / KTV / NVBH có ca hôm nay)
- [ ] **Cá nhân → Chấm công** → **Quét QR** trên màn hình máy chấm công (bước 2.2) → **Chụp ảnh** khuôn mặt → hoàn tất vào ca. Hết ca chấm ra tương tự.
- [ ] Đi trễ / về sớm → gửi **giải trình**; quên chấm ra / xin về sớm → **yêu cầu**.
- [ ] Camera chỉ chạy trên **https** hoặc **localhost**. Dùng điện thoại cùng Wi-Fi: chạy `npm run dev:mobile` trong `frontend-admin` rồi mở `https://<IP máy tính>:3443`.

---

## 5. Quản lý chung – kiểm soát & báo cáo (`quanly@gmail.com`)

### 5.1. Tổng quan
- [ ] **Tổng quan**: doanh thu hôm nay / tháng, lịch hẹn hôm nay, đơn cần xử lý, đề xuất nhập chờ duyệt, khung **Sắp hết hàng**, biểu đồ 14 ngày.

### 5.2. Vật tư & nhập hàng
- [ ] **Vật tư & Định mức → Lịch sử xuất & Thống kê**: thấy phiếu xuất của buổi KTV vừa làm, vật tư dùng **vượt định mức** tô cam.
- [ ] Tab **Tồn kho vật tư**: trạng thái Đủ dùng / Dưới tồn tối thiểu / Không đủ cho lịch 14 ngày; bấm **Đề xuất nhập**.
- [ ] Tab **Đề xuất nhập hàng**: **Duyệt** (chỉnh số lượng) hoặc **Từ chối** (ghi lý do) → xác nhận hàng về: nhập **thực nhận, số lô, hạn dùng** (giao thiếu phải ghi chú) → tồn kho tự cộng theo lô.
- [ ] Tab **Tồn kho vật tư** → **Lô & Kiểm kê**: xem từng lô; nhập số đếm thực tế (huỷ lô hết hạn = nhập 0) → **Lưu kiểm kê** → tồn kho chỉnh theo và lưu lịch sử chênh lệch.

### 5.3. Báo cáo doanh thu
- [ ] **Báo cáo → Báo cáo doanh thu**: chọn 7 ngày / 30 ngày / tháng này; xem 4 nhóm (Khám bệnh, Dịch vụ & gói, Mỹ phẩm, Tư vấn) + % so với kỳ trước; biểu đồ ↔ bảng; chi tiết 9 nguồn; top dịch vụ / mỹ phẩm; **Xuất CSV**.
- [ ] Đối chiếu: hoá đơn vừa chốt ở 4.4 xuất hiện đúng ngày, đúng nguồn.

### 5.4. Chấm công & lương
- [ ] **Nhân sự → Chấm công nhân viên**: bảng công theo ngày, **duyệt / từ chối giải trình** (từ chối phải ghi ≥ 10 ký tự), báo cáo tháng.
- [ ] **Lương → Bảng lương**: chọn tháng → tạo bảng lương nháp (lương ca × ca có công + thưởng chuyên cần) → thêm khoản cộng / trừ (có lý do) → **Duyệt & khoá**.
- [ ] Nhân viên: **Cá nhân → Phiếu lương** xem phiếu lương tháng.

### 5.5. Tư vấn chuyên gia
- [ ] **Tư vấn chuyên gia**: tab **Lịch tư vấn**, **Ca tư vấn**, **Thống kê thù lao** (xuất CSV).
- [ ] Lịch chưa có cọc: **Xác nhận cọc thủ công** (khách nộp tiền mặt / SePay không báo). Có thể **Ẩn đánh giá** không phù hợp.
- [ ] Tab **Thống kê thù lao**: **Chốt thù lao** tháng (số lượt và mức được lưu cố định) → ghi nhận **đã trả thù lao**.

### 5.6. Đối soát tiền vào (Quản lý / CSKH)
- [ ] Tạo tình huống: chuyển **thiếu tiền** một lịch đang chờ cọc: `node devops/gia-lap-chuyen-khoan.js "O2O xxxxxx" 1000`, hoặc dùng **mã không tồn tại**.
- [ ] **Báo cáo → Đối soát tiền vào**: khoản tiền nằm ở **Chưa xử lý** kèm lý do; khoản đúng nằm ở **Đã khớp tự động**.
- [ ] Bấm **Xử lý** → chọn cách xử lý, ghi nội dung (≥ 10 ký tự). Chọn hoàn tiền thì phải nhập mã giao dịch hoàn. Khoản đã xử lý chuyển sang **Đã xử lý**.

---

## 6. Dọn dữ liệu sau khi test

```
node devops/xoa-du-lieu-test.js        # xem trước sẽ xoá gì
node devops/xoa-du-lieu-test.js --xoa  # xoá thật: lịch, hoá đơn, đơn hàng, phiếu xuất vật tư (hoàn kho)... của tài khoản @test.local
```

Lệnh này chưa xoá dòng trong sổ **Đối soát tiền vào** tạo ra khi giả lập chuyển khoản.

Dữ liệu thật (50 sản phẩm, 10 vật tư, định mức, dịch vụ, gói, bác sĩ) không bị xoá.

---

## 7. Tình huống ngoại lệ

Các câu hỏi "nếu … thì sao?" hay gặp khi demo. Làm **trước** bước dọn dữ liệu ở mục 6.

### 7.1. Đặt lịch và tiền cọc
- [ ] **Giữ chỗ không chuyển cọc:** khách đặt lịch rồi không chuyển tiền. Trong 15 phút, khách khác không đặt được giờ đó. Quá 15 phút, lịch giữ chỗ tự xoá và giờ được nhả.
- [ ] **Hai khách đặt cùng một giờ:** mở 2 trình duyệt, chọn cùng bác sĩ, cùng giờ. Chỉ 1 người đặt được, người sau nhận thông báo "Giờ này vừa có người đặt".
- [ ] **Khách tự huỷ:** Sổ lịch khám → huỷ. Hệ thống hỏi xác nhận mất cọc; huỷ xong thì phòng khám giữ cọc và tiền này vào báo cáo doanh thu.
- [ ] **Phòng khám huỷ:** CSKH mở lịch → **Hủy Lịch**, chọn bên huỷ là phòng khám, ghi lý do (≥ 10 ký tự). Lịch chuyển sang chờ hoàn cọc; CSKH nhập mã giao dịch để xác nhận đã hoàn. Không hoàn được lần 2.
- [ ] **Lịch đã đóng:** lịch đã huỷ, khách không đến, đang khám hoặc đã khám thì không sửa, dời hay đón lại được.

### 7.2. Bác sĩ, chuyên gia vắng
- [ ] **Bác sĩ nghỉ đột xuất:** bác sĩ vào **Lịch làm việc của tôi** gửi đơn nghỉ ca có khách đã đặt → Quản lý duyệt ở **Lịch làm việc** → lịch của khách sang "Cần đổi lịch" → CSKH mở tab **Xử lý dời lịch** và dời sang bác sĩ khác hoặc giờ khác. Lưu ý: chỉ lịch **chưa check-in** mới tự chuyển; khách đã vào hàng chờ thì CSKH xử lý tay.
- [ ] **Chuyên gia không vào phòng:** hết buổi (45 phút sau giờ hẹn) mà chuyên gia chưa vào, lịch chuyển sang chuyên gia vắng và chờ hoàn cọc. CSKH xác nhận đã hoàn ở **Tư vấn chuyên gia**.
- [ ] **Khách không vào phòng tư vấn:** chuyên gia có vào nhưng khách không vào, khách mất cọc.

### 7.3. Thu tiền và mã giảm giá
- [ ] **Hết hàng lúc thu tiền:** bác sĩ kê số lượng lớn hơn tồn kho. Lúc **Chốt Hóa Đơn**, hệ thống chặn và báo "chỉ còn X trong kho"; lịch vẫn ở trạng thái chờ thu tiền, kho không đổi.
- [ ] **Mã giảm giá không hợp lệ:** thử dùng lại mã đã dùng, mã hết hạn, mã hết lượt, mã sai phạm vi (mã dịch vụ cho đơn mỹ phẩm). Tất cả bị từ chối kèm lý do.

### 7.4. Kho
- [ ] **KTV dùng vật tư khi kho không đủ:** quản lý chỉnh tồn một vật tư còn rất ít bằng **Lô & Kiểm kê** → KTV ghi số dùng lớn hơn tồn. Buổi vẫn hoàn thành, kho về 0 (không âm), phiếu xuất ghi rõ phần thiếu và hệ thống tự tạo đề xuất nhập.

### 7.5. Trả hàng
Chỉ đơn giao qua GHN, đã nhận hàng và trong vòng 7 ngày mới gửi yêu cầu được; đơn tại quầy thì khách mang đến phòng khám. Mỗi đơn chỉ yêu cầu 1 lần.
- [ ] Khách gửi yêu cầu kèm ảnh, số tài khoản nhận tiền → NVBH **Hoàn / trả hàng**: duyệt hoặc từ chối (ghi lý do ≥ 10 ký tự).
- [ ] Duyệt → **Tạo đơn GHN lấy hàng** (⚠️ tạo vận đơn thật, xem 0.3) → nhận hàng → kiểm tra → hoàn tiền (nhập mã giao dịch, chọn có cộng lại kho hay không). Chưa nhận hàng thì chưa hoàn tiền được; không hoàn được lần 2.

### 7.6. Chấm công
- [ ] **Vắng không giải trình:** nhân viên không chấm công và không giải trình trong **24 giờ sau khi hết ca** thì hệ thống tự ghi vắng: không có lương ca đó và **mất thưởng chuyên cần 500.000đ của tháng**, chỉ cần vắng 1 ca.
- [ ] Phần tự ghi vắng chỉ chạy sau khi đã có máy chấm công (bước 2.2), và cần chờ hết hạn 24 giờ nên khó demo trực tiếp. Khi demo, chuẩn bị sẵn một ca từ hôm trước.

### 7.7. Cảnh báo chống chỉ định khi kê đơn
Hệ thống chỉ **nhắc**, quyết định vẫn thuộc về bác sĩ. Có 3 mức: **Chống chỉ định**, **Thận trọng** (đều phải ghi lý do mới kê được) và **Lưu ý** (chỉ hiển thị).
- [ ] **Chưa sàng lọc:** kê dịch vụ khi chưa bấm **Xác nhận đã hỏi khách** hôm nay → hệ thống yêu cầu hỏi hoặc ghi lý do.
- [ ] **Mang thai:** tick "Đang mang thai", kê Laser Toning và Klenzit → 2 cảnh báo Chống chỉ định. Bấm **Hoàn tất khám** → hiện hộp cảnh báo; **Sửa lại đơn** hoặc ghi lý do (≥ 10 ký tự) rồi **Vẫn kê, lưu lý do**. Lý do được lưu kèm cảnh báo đã thấy.
- [ ] **Máy tạo nhịp:** tick "Có máy tạo nhịp...", kê Nâng Cơ Bằng Sóng RF → Chống chỉ định.
- [ ] **Sẹo lồi / chống đông:** kê Vi Kim hoặc gói Trị sẹo rỗ → Chống chỉ định. Gói được nhận ra theo mô tả.
- [ ] **Dị ứng:** ghi "Niacinamide", kê sản phẩm có Niacinamide → Chống chỉ định. Chỉ so theo đúng chữ đã ghi trong bảng thành phần, nên ghi tên hoạt chất.
- [ ] **Cho con bú + Retinol:** chỉ hiện Lưu ý, không cần ghi lý do.
- [ ] **CSKH thêm dịch vụ lúc thu tiền:** dịch vụ ngoài đơn của bác sĩ mà bị Chống chỉ định thì không chốt được hoá đơn.
