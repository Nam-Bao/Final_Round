// Nội dung dữ liệu demo: con người, danh mục, chuyên môn, bài viết
const EMAIL_DOMAIN = 'glowskin.demo';
const PASSWORD = 'Demo@123';

// ---- Khách hàng (tên, giới tính, năm sinh)
const CUSTOMERS = [
  ['Nguyễn Ngọc Anh', 'FEMALE', 1998], ['Trần Thị Minh Thư', 'FEMALE', 2001], ['Lê Hoàng Phúc', 'MALE', 1999], ['Phạm Thu Trang', 'FEMALE', 1995],
  ['Võ Thị Kim Ngân', 'FEMALE', 1992], ['Đặng Gia Hân', 'FEMALE', 2003], ['Bùi Quang Huy', 'MALE', 1997], ['Hồ Thị Thanh Tâm', 'FEMALE', 1988],
  ['Ngô Mỹ Duyên', 'FEMALE', 2000], ['Dương Bảo Ngọc', 'FEMALE', 2002], ['Lý Minh Khang', 'MALE', 2004], ['Trịnh Thị Hồng Nhung', 'FEMALE', 1986],
  ['Phan Thị Ngọc Hân', 'FEMALE', 1994], ['Huỳnh Tấn Đạt', 'MALE', 1996], ['Mai Thị Thùy Linh', 'FEMALE', 1999], ['Đỗ Khánh Vy', 'FEMALE', 2005],
  ['Tạ Thị Lan Hương', 'FEMALE', 1983], ['Châu Ngọc Quỳnh', 'FEMALE', 1997], ['Lâm Gia Bảo', 'MALE', 2002], ['Vũ Thị Phương Thảo', 'FEMALE', 1990],
  ['Cao Thị Yến Nhi', 'FEMALE', 2001], ['Kiều Minh Tuấn', 'MALE', 1993], ['Đinh Thị Mai Anh', 'FEMALE', 1996], ['Tô Hải Yến', 'FEMALE', 1989],
  ['La Thị Cẩm Tú', 'FEMALE', 1998], ['Quách Thiện Nhân', 'MALE', 2000], ['Lưu Ngọc Diệp', 'FEMALE', 2003], ['Hà Thị Thu Hiền', 'FEMALE', 1985],
  ['Trương Bích Ngọc', 'FEMALE', 1994], ['Nguyễn Hữu Thắng', 'MALE', 1991], ['Phùng Thị Khánh Linh', 'FEMALE', 1999], ['Thái Ngọc Trâm', 'FEMALE', 2002],
  ['Lê Thị Diễm My', 'FEMALE', 1993], ['Võ Minh Quân', 'MALE', 1998], ['Đoàn Thị Như Ý', 'FEMALE', 2000], ['Nguyễn Thị Bảo Trân', 'FEMALE', 1997],
];

// Ghép thêm tên khách để đủ lượng khách của một phòng khám (không trùng với danh sách trên)
const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const FEMALE_NAMES = ['Thị Thu Hà', 'Ngọc Hân', 'Thanh Vân', 'Thùy Dung', 'Bảo Anh', 'Mỹ Linh', 'Thị Hồng Gấm', 'Phương Anh', 'Khánh Huyền', 'Thị Ngọc Bích', 'Minh Châu', 'Hoài Thương', 'Thị Kim Oanh', 'Quỳnh Như', 'Tường Vi', 'Thị Mai Phương', 'Thảo Nguyên', 'Hải Đường'];
const MALE_NAMES = ['Minh Trí', 'Quốc Bảo', 'Thành Đạt', 'Gia Huy', 'Đức Anh', 'Hoàng Long', 'Tuấn Kiệt', 'Văn Hiếu'];
const extraCustomers = (count, pick, int) => {
  const used = new Set(CUSTOMERS.map(([n]) => n));
  const out = [];
  while (out.length < count) {
    const female = out.length % 4 !== 3;
    const name = `${pick(SURNAMES)} ${pick(female ? FEMALE_NAMES : MALE_NAMES)}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push([name, female ? 'FEMALE' : 'MALE', int(1984, 2006)]);
  }
  return out;
};

// Người thân được khách đặt lịch hộ
const RELATIVES = [
  ['Con', 'Nguyễn Minh Đức', 'MALE', 2010], ['Mẹ', 'Trần Thị Hoa', 'FEMALE', 1968], ['Con', 'Phạm Bảo Châu', 'FEMALE', 2011],
  ['Chồng', 'Lê Văn Thành', 'MALE', 1985], ['Mẹ', 'Lê Thị Mai', 'FEMALE', 1965], ['Em gái', 'Võ Thị Mỹ Tiên', 'FEMALE', 2006],
];

const STREETS = [
  ['Nguyễn Thị Minh Khai', 'Phường Đa Kao, Quận 1'], ['Lê Văn Sỹ', 'Phường 13, Quận 3'], ['Cách Mạng Tháng Tám', 'Phường 11, Quận 3'],
  ['Phan Xích Long', 'Phường 2, Quận Phú Nhuận'], ['Hoàng Văn Thụ', 'Phường 4, Quận Tân Bình'], ['Cộng Hòa', 'Phường 13, Quận Tân Bình'],
  ['Quang Trung', 'Phường 10, Quận Gò Vấp'], ['Nguyễn Văn Lượng', 'Phường 17, Quận Gò Vấp'], ['Điện Biên Phủ', 'Phường 25, Quận Bình Thạnh'],
  ['Xô Viết Nghệ Tĩnh', 'Phường 21, Quận Bình Thạnh'], ['Nguyễn Thị Thập', 'Phường Tân Phong, Quận 7'], ['Lê Văn Việt', 'Phường Hiệp Phú, TP. Thủ Đức'],
  ['Võ Văn Ngân', 'Phường Linh Chiểu, TP. Thủ Đức'], ['Sư Vạn Hạnh', 'Phường 12, Quận 10'], ['Lũy Bán Bích', 'Phường Tân Thới Hòa, Quận Tân Phú'],
];

// ---- Nhân viên mới
const NEW_STAFF = [
  {
    key: 'D3', email: 'bacsi3', role: 'DOCTOR', name: 'Trần Quốc Việt', gender: 'MALE', dob: '1986-04-12', phone: '0908112356',
    doctor: {
      title: 'BS.CKI', specialty: 'Da liễu - Laser thẩm mỹ', workplace: 'Phòng khám Da liễu GlowSkin', experience_years: 11, license_number: '004871/HCM-CCHN',
      bio: 'Bác sĩ chuyên khoa I Da liễu, nhiều năm điều trị nám, tăng sắc tố và sẹo mụn bằng laser và peel hóa học.',
      education: [{ year: 2010, degree: 'Bác sĩ Đa khoa', school: 'Đại học Y Dược TP.HCM' }, { year: 2015, degree: 'Chuyên khoa I Da liễu', school: 'Đại học Y khoa Phạm Ngọc Thạch' }],
      work_history: [{ from: 2011, to: 2019, place: 'Bệnh viện Da Liễu TP.HCM', position: 'Bác sĩ điều trị' }, { from: 2019, to: 2026, place: 'Phòng khám Da liễu GlowSkin', position: 'Bác sĩ Da liễu' }],
      certificates: ['Chứng chỉ Laser trong Da liễu - 2017', 'Chứng chỉ Peel hóa học - 2018'], expertise: ['Điều trị nám, tàn nhang', 'Laser thẩm mỹ', 'Sẹo rỗ sau mụn'],
    },
    position: 'Bác sĩ Da liễu', education_level: 'Chuyên khoa I Da liễu',
  },
  { key: 'K2', email: 'ktv2', role: 'TECHNICIAN', name: 'Lê Thị Thanh Trúc', gender: 'FEMALE', dob: '1997-09-03', phone: '0937215486', position: 'Kỹ thuật viên chăm sóc da', education_level: 'Trung cấp Y sĩ' },
  {
    key: 'E2', email: 'chuyengia2', role: 'EXPERT', name: 'Nguyễn Hoàng Thảo Vy', gender: 'FEMALE', dob: '1990-11-21', phone: '0912678430',
    doctor: {
      title: 'DS.CKI', specialty: 'Chuyên gia Mỹ phẩm', workplace: 'Viện Mỹ phẩm và Da liễu ứng dụng', experience_years: 9, license_number: '021345/HCM-CCHND',
      bio: 'Dược sĩ chuyên khoa I, tư vấn chọn mỹ phẩm theo loại da, đọc bảng thành phần và xây dựng quy trình chăm sóc da tại nhà.',
      education: [{ year: 2013, degree: 'Dược sĩ Đại học', school: 'Đại học Y Dược TP.HCM' }, { year: 2018, degree: 'Dược sĩ Chuyên khoa I', school: 'Đại học Y Dược TP.HCM' }],
      work_history: [{ from: 2013, to: 2018, place: 'Công ty Dược mỹ phẩm L.', position: 'Dược sĩ nghiên cứu sản phẩm' }, { from: 2018, to: 2026, place: 'Viện Mỹ phẩm và Da liễu ứng dụng', position: 'Chuyên gia tư vấn' }],
      certificates: ['Chứng chỉ Hóa mỹ phẩm - 2016'], expertise: ['Chọn mỹ phẩm theo loại da', 'Phân tích bảng thành phần', 'Quy trình skincare tối giản'],
      consult_field: 'COSMETICS', session_fee: 150000,
    },
    position: 'Chuyên gia tư vấn mỹ phẩm', education_level: 'Dược sĩ Chuyên khoa I',
  },
];

// ---- Dịch vụ lẻ mới (bổ sung cho 3 dịch vụ đang có)
const NEW_SERVICES = [
  {
    key: 'BASIC_CARE', name: 'Chăm sóc da chuyên sâu cơ bản', category: 'basic', duration_minutes: 60, price: 350000,
    description: 'Làm sạch sâu, tẩy tế bào chết dịu nhẹ, xông hơi, đắp mặt nạ phục hồi theo loại da.',
    includes: ['Tẩy trang, rửa mặt', 'Tẩy tế bào chết enzyme', 'Xông hơi', 'Mặt nạ phục hồi'], procedure_steps: ['Thăm da', 'Làm sạch', 'Tẩy tế bào chết', 'Xông hơi', 'Đắp mặt nạ', 'Thoa kem dưỡng và chống nắng'],
    suitable_for: ['Da thường', 'Da khô', 'Da hỗn hợp'], aftercare: ['Dùng kem chống nắng mỗi ngày', 'Không tẩy tế bào chết trong 3 ngày'],
  },
  {
    key: 'LED', name: 'Ánh sáng sinh học LED trị mụn', category: 'basic', duration_minutes: 30, price: 250000,
    description: 'Chiếu ánh sáng xanh và đỏ hỗ trợ giảm vi khuẩn gây mụn và giảm viêm, dùng kèm liệu trình điều trị mụn.',
    includes: ['Làm sạch da', 'Chiếu LED xanh - đỏ 20 phút'], procedure_steps: ['Làm sạch', 'Bảo vệ mắt', 'Chiếu LED', 'Thoa kem làm dịu'],
    suitable_for: ['Da mụn viêm nhẹ đến trung bình'], aftercare: ['Không nặn mụn tại nhà', 'Dùng sản phẩm theo chỉ định bác sĩ'],
  },
  {
    key: 'LASER_TONING', name: 'Laser Toning trị nám', category: 'laser', duration_minutes: 45, price: 1500000,
    description: 'Laser Nd:YAG năng lượng thấp làm mờ sắc tố nám, thâm theo nhiều buổi, ít nghỉ dưỡng.',
    includes: ['Ủ tê', 'Laser Toning toàn mặt', 'Mặt nạ làm dịu'], procedure_steps: ['Làm sạch', 'Ủ tê 20 phút', 'Bắn laser', 'Đắp mặt nạ làm dịu', 'Thoa chống nắng'],
    suitable_for: ['Nám mảng', 'Tăng sắc tố sau viêm'], aftercare: ['Chống nắng kỹ, che chắn khi ra ngoài', 'Tránh xông hơi 1 tuần'],
  },
];

// ---- Gói liệu trình mới
const NEW_PACKAGES = [
  { key: 'ACNE6', name: 'Liệu trình trị mụn chuẩn y khoa 6 buổi', price: 3600000, promotional_price: 3200000, total_sessions: 6, interval_days: 7, validity_days: 90, description: 'Kết hợp lấy nhân mụn, ánh sáng LED và chăm sóc phục hồi, tái khám đánh giá sau 4 tuần.', included_products: ['Gel trị mụn theo chỉ định bác sĩ'] },
  { key: 'MELASMA5', name: 'Liệu trình mờ nám Laser Toning 5 buổi', price: 7000000, promotional_price: 6200000, total_sessions: 5, interval_days: 14, validity_days: 120, description: '5 buổi Laser Toning cách nhau 2 tuần, kết hợp kem chống nắng và serum làm sáng.', included_products: ['Kem chống nắng phổ rộng'] },
  { key: 'BARRIER8', name: 'Liệu trình phục hồi da nhạy cảm 8 buổi', price: 4400000, promotional_price: 3900000, total_sessions: 8, interval_days: 7, validity_days: 120, description: 'Dành cho da yếu, da nhiễm corticoid: làm dịu, cấp ẩm, củng cố hàng rào bảo vệ da.', included_products: ['Kem phục hồi B5'] },
];

// ---- Sản phẩm mới
const NEW_PRODUCTS = [
  { key: 'EFFACLAR', name: 'Kem giảm mụn La Roche-Posay Effaclar Duo+ 40ml', price: 465000, weight: 100, category: 'Sản phẩm đặc trị', brand: 'La Roche-Posay', origin: 'Pháp', capacity: '40ml', skin_types: ['Da dầu', 'Da mụn'], stock: 42, short: 'Kem giảm mụn, giảm thâm sau mụn cho da dầu mụn.', ingredients: 'Niacinamide, LHA, Salicylic Acid, Piroctone Olamine', usage: 'Thoa lớp mỏng lên vùng da mụn 1 - 2 lần/ngày sau khi làm sạch.', warnings: 'Tránh vùng mắt. Ngưng dùng nếu kích ứng kéo dài.' },
  { key: 'BIODERMA', name: 'Nước tẩy trang Bioderma Sensibio H2O 500ml', price: 435000, weight: 550, category: 'Sữa Rửa Mặt', brand: 'Bioderma', origin: 'Pháp', capacity: '500ml', skin_types: ['Da nhạy cảm', 'Mọi loại da'], stock: 36, short: 'Nước tẩy trang dịu nhẹ cho da nhạy cảm.', ingredients: 'Micellar water, Cucumis Sativus Fruit Extract', usage: 'Thấm bông tẩy trang, lau nhẹ toàn mặt, không cần rửa lại.', warnings: 'Chỉ dùng ngoài da.' },
  { key: 'EUCERIN', name: 'Tinh chất giảm thâm nám Eucerin Spotless Brightening 30ml', price: 990000, weight: 100, category: 'Dược mỹ phẩm chăm sóc da', brand: 'Eucerin', origin: 'Đức', capacity: '30ml', skin_types: ['Da nám', 'Da xỉn màu'], stock: 18, short: 'Tinh chất làm mờ đốm nâu và thâm nám.', ingredients: 'Thiamidol, Hyaluronic Acid, Licochalcone A', usage: 'Dùng sáng và tối sau bước làm sạch, kết hợp chống nắng ban ngày.', warnings: 'Không dùng trên vùng da tổn thương.' },
  { key: 'KLENZIT', name: 'Gel trị mụn Klenzit C (Adapalene 0.1% + Clindamycin 1%) 15g', price: 145000, weight: 50, category: 'Sản phẩm đặc trị', brand: 'Glenmark', origin: 'Ấn Độ', capacity: '15g', skin_types: ['Da mụn viêm'], stock: 60, prescription: true, short: 'Thuốc bôi trị mụn, bán theo chỉ định của bác sĩ.', ingredients: 'Adapalene 0.1%, Clindamycin 1%', usage: 'Thoa lớp mỏng lên vùng mụn 1 lần buổi tối theo hướng dẫn của bác sĩ.', warnings: 'Không dùng cho phụ nữ có thai. Có thể gây khô, bong tróc giai đoạn đầu.' },
];

// ---- Vật tư mới (dùng cho định mức của các dịch vụ)
const NEW_MATERIALS = [
  { key: 'MASK', name: 'Mặt nạ giấy phục hồi B5', unit: 'miếng', pack_size: 10, pack_label: 'Hộp 10 miếng', price: 12000, min_stock: 40, supplier: 'Công ty TNHH Thiết bị Y tế Minh An', manufacturer: 'Dermacos Hàn Quốc', origin: 'Hàn Quốc' },
  { key: 'NITRILE', name: 'Găng tay nitrile không bột', unit: 'đôi', pack_size: 50, pack_label: 'Hộp 50 đôi', price: 3000, min_stock: 100, supplier: 'Công ty TNHH Thiết bị Y tế Minh An', manufacturer: 'Vglove', origin: 'Việt Nam' },
  { key: 'COTTON', name: 'Bông tẩy trang y tế', unit: 'miếng', pack_size: 100, pack_label: 'Túi 100 miếng', price: 400, min_stock: 300, supplier: 'Công ty CP Bông Bạch Tuyết', manufacturer: 'Bạch Tuyết', origin: 'Việt Nam' },
  { key: 'NEEDLE', name: 'Kim lấy nhân mụn vô trùng', unit: 'cây', pack_size: 100, pack_label: 'Hộp 100 cây', price: 1500, min_stock: 150, supplier: 'Công ty TNHH Thiết bị Y tế Minh An', manufacturer: 'Kim Trung', origin: 'Việt Nam' },
  { key: 'NUMBING', name: 'Kem ủ tê EMLA 5%', unit: 'gram', pack_size: 30, pack_label: 'Tuýp 30g', price: 6000, min_stock: 90, supplier: 'Nhà thuốc Phòng khám', manufacturer: 'Aspen', origin: 'Thụy Điển' },
  { key: 'PEEL', name: 'Dung dịch peel Mandelic 30%', unit: 'ml', pack_size: 30, pack_label: 'Chai 30ml', price: 25000, min_stock: 60, supplier: 'Công ty TNHH Dược mỹ phẩm Thiên Phúc', manufacturer: 'Dr. Belter', origin: 'Đức' },
];

// Định mức vật tư cho 1 buổi (theo tên dịch vụ / gói)
const NORMS = {
  'Lấy nhân mụn chuẩn y khoa': { NITRILE: 1, COTTON: 8, NEEDLE: 3, MASK: 1 },
  'Peel da sinh học mờ thâm': { NITRILE: 1, COTTON: 6, PEEL: 3, MASK: 1 },
  'Điện di Ion Vitamin C': { NITRILE: 1, COTTON: 6, MASK: 1 },
  'Chăm sóc da chuyên sâu cơ bản': { NITRILE: 1, COTTON: 8, MASK: 1 },
  'Ánh sáng sinh học LED trị mụn': { COTTON: 4 },
  'Laser Toning trị nám': { NITRILE: 1, COTTON: 6, NUMBING: 5, MASK: 1 },
  'Liệu trình trị mụn chuẩn y khoa 6 buổi': { NITRILE: 1, COTTON: 8, NEEDLE: 3, MASK: 1 },
  'Liệu trình mờ nám Laser Toning 5 buổi': { NITRILE: 1, COTTON: 6, NUMBING: 5, MASK: 1 },
  'Liệu trình phục hồi da nhạy cảm 8 buổi': { NITRILE: 1, COTTON: 6, MASK: 1 },
};

// ---- Hồ sơ bệnh theo nhóm vấn đề da
const CONDITIONS = {
  ACNE: {
    reasons: ['Nổi mụn viêm vùng má và cằm khoảng 3 tháng nay', 'Mụn đầu đen, mụn ẩn nhiều ở trán và mũi', 'Mụn viêm tái đi tái lại trước kỳ kinh'],
    skincare: ['Sữa rửa mặt tạo bọt, kem dưỡng ẩm', 'Chỉ rửa mặt bằng nước, chưa dùng sản phẩm gì', 'Tự mua kem trị mụn ngoài tiệm'],
    symptoms: ['Mụn viêm, mụn mủ rải rác hai má, da đổ dầu nhiều', 'Mụn đầu đen và mụn ẩn vùng chữ T, lỗ chân lông to', 'Mụn sẩn đỏ vùng cằm, đau khi chạm'],
    diagnoses: ['Mụn trứng cá thông thường mức độ trung bình (Acne vulgaris)', 'Mụn trứng cá mức độ nhẹ, ưu thế nhân mụn', 'Mụn trứng cá nội tiết ở phụ nữ trưởng thành'],
    notes: ['Điều trị kết hợp lấy nhân mụn và LED, dùng gel Adapalene buổi tối. Không tự nặn mụn, rửa mặt 2 lần/ngày, chống nắng hằng ngày.', 'Bôi thuốc theo hướng dẫn, giai đoạn đầu da có thể khô và bong nhẹ. Tái khám sau 4 tuần để đánh giá đáp ứng.'],
    pkg: 'ACNE6', services: ['Lấy nhân mụn chuẩn y khoa', 'Ánh sáng sinh học LED trị mụn'], products: ['KLENZIT', 'EFFACLAR', 'CETAPHIL', 'MEGADUO'],
  },
  MELASMA: {
    reasons: ['Nám mảng hai bên gò má, sậm màu hơn sau mùa hè', 'Đốm nâu xuất hiện sau sinh con', 'Da xỉn màu, nhiều đốm thâm'],
    skincare: ['Kem dưỡng trắng, chống nắng không đều', 'Có dùng kem trộn trước đây', 'Serum vitamin C, kem chống nắng'],
    symptoms: ['Dát nâu đối xứng hai gò má, ranh giới không rõ', 'Dát nâu sậm vùng gò má và trán', 'Tăng sắc tố rải rác sau mụn'],
    diagnoses: ['Nám hỗn hợp hai bên gò má (Melasma)', 'Nám mảng thượng bì', 'Tăng sắc tố sau viêm (PIH)'],
    notes: ['Nám là bệnh mạn tính, cần chống nắng nghiêm ngặt và điều trị duy trì. Laser Toning 2 tuần/lần kết hợp serum làm sáng.', 'Tránh nắng, che chắn khi ra ngoài, không dùng kem trộn. Đánh giá lại sau 3 buổi laser.'],
    pkg: 'MELASMA5', services: ['Laser Toning trị nám', 'Peel da sinh học mờ thâm'], products: ['ANESSA', 'EUCERIN', 'VICHY'],
  },
  BARRIER: {
    reasons: ['Da đỏ, rát, châm chích khi dùng mỹ phẩm', 'Từng dùng kem có corticoid, nay da mỏng và đỏ', 'Da khô bong tróc, ngứa nhẹ'],
    skincare: ['Dùng nhiều sản phẩm treatment cùng lúc', 'Kem trộn không rõ nguồn gốc 1 năm', 'Sữa rửa mặt có hạt, toner cồn'],
    symptoms: ['Da đỏ lan tỏa, giãn mao mạch, châm chích', 'Da mỏng, đỏ, nổi sẩn nhỏ hai má', 'Da khô, bong vảy, ngứa nhẹ'],
    diagnoses: ['Viêm da do lạm dụng corticoid bôi', 'Da nhạy cảm, hàng rào bảo vệ da suy yếu', 'Viêm da cơ địa mức độ nhẹ'],
    notes: ['Ngưng toàn bộ sản phẩm treatment, chỉ dùng sữa rửa mặt dịu nhẹ, kem phục hồi và chống nắng. Liệu trình làm dịu 1 tuần/lần.', 'Không tự ý bôi thuốc có corticoid. Da sẽ hồi phục dần sau 6 - 8 tuần.'],
    pkg: 'BARRIER8', services: ['Chăm sóc da chuyên sâu cơ bản', 'Điện di Ion Vitamin C'], products: ['B5', 'CETAPHIL', 'BIODERMA'],
  },
};

const CONSULT_QUESTIONS = {
  COSMETICS: ['Da dầu mụn nên dùng sữa rửa mặt và kem chống nắng nào?', 'Em đang dùng retinol, có dùng chung vitamin C được không?', 'Muốn xây dựng quy trình skincare tối giản cho da hỗn hợp', 'Da nhạy cảm, dùng tẩy tế bào chết hóa học có ổn không?'],
  NUTRITION: ['Ăn nhiều đồ ngọt có làm mụn nặng hơn không?', 'Chế độ ăn nào giúp da bớt khô và xỉn màu?', 'Em hay thức khuya, da sạm và nổi mụn, nên điều chỉnh thế nào?'],
};
const CONSULT_RESULTS = {
  COSMETICS: {
    assessment: 'Da hỗn hợp thiên dầu, lỗ chân lông to vùng chữ T, có vài mụn viêm nhẹ. Quy trình hiện tại nhiều bước và dùng chồng hoạt chất nên da dễ kích ứng.',
    advice: 'Rút gọn quy trình còn: làm sạch dịu nhẹ, một sản phẩm đặc trị buổi tối, kem dưỡng ẩm mỏng nhẹ và kem chống nắng phổ rộng mỗi sáng. Không dùng retinol và AHA/BHA cùng một tối.',
    lifestyle: 'Thay vỏ gối 2 lần/tuần, không chạm tay lên mặt, ngủ trước 23 giờ.',
    follow_up: 'Theo dõi 4 tuần. Nếu mụn viêm tăng nên đặt lịch khám bác sĩ da liễu.',
  },
  NUTRITION: {
    assessment: 'Chế độ ăn nhiều đường và sữa, ít rau, ngủ muộn thường xuyên. Đây là các yếu tố có thể làm mụn viêm nặng hơn.',
    advice: 'Giảm đồ uống có đường và trà sữa, ưu tiên rau xanh, cá, các loại hạt. Uống đủ 1,5 - 2 lít nước mỗi ngày.',
    lifestyle: 'Ngủ đủ 7 - 8 tiếng, vận động 30 phút mỗi ngày, hạn chế căng thẳng.',
    follow_up: 'Ghi nhật ký ăn uống 2 tuần để đánh giá lại.',
  },
};

const REVIEW_COMMENTS = {
  5: ['Bác sĩ khám kỹ, giải thích rõ tình trạng da và cách chăm sóc.', 'Sau 1 tháng da giảm mụn rõ, rất hài lòng.', 'Phòng khám sạch sẽ, đúng giờ hẹn, nhân viên dễ thương.', 'Tư vấn tận tình, không ép mua thêm dịch vụ.'],
  4: ['Bác sĩ tư vấn tốt, chờ hơi lâu một chút.', 'Hiệu quả ổn, mong có thêm khung giờ buổi tối.', 'Dịch vụ tốt, giá hợp lý.'],
  3: ['Da có cải thiện nhưng chậm hơn mình nghĩ.', 'Đến đúng giờ nhưng vẫn phải chờ khá lâu.'],
};
const PRODUCT_COMMENTS = ['Đóng gói cẩn thận, hàng chính hãng.', 'Dùng 2 tuần thấy da dịu hơn.', 'Giao hàng nhanh, sẽ mua lại.', 'Sản phẩm dùng ổn, thấm nhanh.'];

const ARTICLES = [
  {
    title: 'Mụn trứng cá ở người trưởng thành: nguyên nhân và cách điều trị đúng', type: 'KNOWLEDGE', author: 'D1', tags: ['mụn', 'mụn nội tiết', 'adapalene'],
    summary: 'Mụn không chỉ xuất hiện ở tuổi dậy thì. Bài viết giải thích vì sao người trưởng thành vẫn bị mụn và các bước điều trị theo hướng dẫn da liễu.',
    content: 'Mụn trứng cá ở người trưởng thành thường gặp ở nữ giới sau 25 tuổi, tập trung vùng cằm và quai hàm.\n\nNguyên nhân thường gặp:\n- Thay đổi nội tiết theo chu kỳ kinh nguyệt\n- Căng thẳng, thiếu ngủ\n- Dùng mỹ phẩm gây bít tắc lỗ chân lông\n\nHướng điều trị:\n- Mụn nhẹ: thuốc bôi chứa adapalene hoặc benzoyl peroxide\n- Mụn trung bình: kết hợp thuốc bôi, lấy nhân mụn đúng kỹ thuật và ánh sáng sinh học\n- Mụn nặng hoặc để lại sẹo: cần bác sĩ thăm khám để cân nhắc thuốc uống\n\nLưu ý: không tự nặn mụn tại nhà và luôn dùng kem chống nắng vì nhiều thuốc trị mụn làm da nhạy cảm với ánh nắng.',
    sources: ['Hiệp hội Da liễu Hoa Kỳ (AAD) - Hướng dẫn điều trị mụn trứng cá, 2024'],
  },
  {
    title: 'Nám da: vì sao dễ tái phát và cách kiểm soát lâu dài', type: 'KNOWLEDGE', author: 'D3', tags: ['nám', 'laser toning', 'chống nắng'],
    summary: 'Nám là bệnh lý sắc tố mạn tính. Hiểu đúng cơ chế giúp bạn kiên trì điều trị và hạn chế tái phát.',
    content: 'Nám xuất hiện khi tế bào sắc tố hoạt động quá mức dưới tác động của ánh nắng, nội tiết và di truyền.\n\nVì sao nám dễ tái phát:\n- Ánh nắng và ánh sáng nhìn thấy kích thích sắc tố trở lại\n- Nội tiết thay đổi khi mang thai hoặc dùng thuốc tránh thai\n\nKiểm soát nám gồm 3 phần:\n- Chống nắng phổ rộng mỗi ngày, thoa lại sau 2 - 3 giờ khi ở ngoài trời\n- Hoạt chất làm sáng như thiamidol, niacinamide, tranexamic acid\n- Laser Toning hoặc peel nhẹ theo liệu trình do bác sĩ chỉ định\n\nTuyệt đối không dùng kem trộn chứa corticoid hoặc thủy ngân vì có thể làm da mỏng, giãn mạch và nám nặng hơn.',
    sources: ['Tạp chí Da liễu Việt Nam - Cập nhật điều trị nám, 2023'],
  },
  {
    title: 'Da nhiễm corticoid: dấu hiệu nhận biết và lộ trình phục hồi', type: 'SKINCARE', author: 'D2', tags: ['corticoid', 'phục hồi da', 'da nhạy cảm'],
    summary: 'Dùng kem trộn lâu ngày khiến da mỏng, đỏ và dễ kích ứng. Đây là lộ trình phục hồi an toàn được bác sĩ khuyến nghị.',
    content: 'Da nhiễm corticoid thường do dùng kem trộn hoặc thuốc bôi chứa corticoid kéo dài mà không có chỉ định.\n\nDấu hiệu thường gặp:\n- Da mỏng, đỏ, thấy rõ mạch máu\n- Nóng rát, châm chích khi dùng mỹ phẩm\n- Nổi sẩn đỏ, mụn li ti khi ngưng thuốc\n\nLộ trình phục hồi:\n- Ngưng dần sản phẩm chứa corticoid dưới sự theo dõi của bác sĩ\n- Chỉ giữ 3 bước: làm sạch dịu nhẹ, kem phục hồi, chống nắng\n- Kết hợp các buổi làm dịu, cấp ẩm tại phòng khám\n\nThời gian phục hồi thường từ 2 đến 3 tháng tùy mức độ. Hãy kiên nhẫn và không tự ý dùng thêm sản phẩm treatment.',
    sources: ['Bệnh viện Da Liễu TP.HCM - Tài liệu tư vấn người bệnh'],
  },
  {
    title: 'GlowSkin ra mắt dịch vụ tư vấn chuyên gia mỹ phẩm qua video', type: 'EVENT', author: null, tags: ['tư vấn online', 'chuyên gia'],
    summary: 'Khách hàng có thể đặt lịch gặp chuyên gia mỹ phẩm và dinh dưỡng qua video ngay trên website, cọc được trừ vào phí khám nếu cần khám tiếp.',
    content: 'Từ tháng này, GlowSkin mở thêm dịch vụ tư vấn chuyên gia qua video call.\n\nBạn có thể:\n- Chọn lĩnh vực: Mỹ phẩm hoặc Dinh dưỡng\n- Chọn chuyên gia và khung giờ còn trống, kể cả buổi tối\n- Nhận kết quả tư vấn và gợi ý sản phẩm ngay sau buổi gặp\n\nTiền cọc tư vấn được trừ vào phí khám nếu chuyên gia khuyên bạn gặp bác sĩ da liễu trong vòng 30 ngày.',
    sources: [],
  },
];

const PENDING_SUBMISSION = {
  author: 'D2', type: 'RESEARCH', title: 'Đánh giá đáp ứng điều trị mụn bằng Adapalene 0.1% tại phòng khám trong 12 tuần',
  summary: 'Tổng hợp kết quả theo dõi người bệnh mụn mức độ nhẹ đến trung bình dùng Adapalene 0.1% kết hợp chăm sóc tại phòng khám.',
  content: 'Mục tiêu: đánh giá mức giảm số lượng tổn thương mụn sau 12 tuần điều trị.\n\nĐối tượng: người bệnh mụn mức độ nhẹ đến trung bình đến khám tại phòng khám.\n\nPhương pháp: bôi Adapalene 0.1% buổi tối, kết hợp lấy nhân mụn và ánh sáng sinh học mỗi tuần. Đánh giá số lượng tổn thương tại tuần 0, 4, 8 và 12.\n\nKết quả sơ bộ: phần lớn người bệnh giảm rõ tổn thương viêm sau 8 tuần, tác dụng phụ thường gặp là khô và bong da nhẹ trong 2 tuần đầu.\n\nKết luận: phác đồ phù hợp cho mụn mức độ nhẹ đến trung bình, cần hướng dẫn kỹ người bệnh về dưỡng ẩm và chống nắng.',
  tags: ['nghiên cứu', 'adapalene', 'mụn'], sources: ['Số liệu theo dõi nội bộ phòng khám GlowSkin'],
};

module.exports = { extraCustomers, EMAIL_DOMAIN, PASSWORD, CUSTOMERS, RELATIVES, STREETS, NEW_STAFF, NEW_SERVICES, NEW_PACKAGES, NEW_PRODUCTS, NEW_MATERIALS, NORMS, CONDITIONS, CONSULT_QUESTIONS, CONSULT_RESULTS, REVIEW_COMMENTS, PRODUCT_COMMENTS, ARTICLES, PENDING_SUBMISSION };
