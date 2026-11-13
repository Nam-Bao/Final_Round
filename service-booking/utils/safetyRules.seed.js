// DỮ LIỆU KHỞI TẠO của bảng quy tắc chống chỉ định (bản đã đọc nguồn trực tiếp, trước khi chuyển sang database).
// Chỉ dùng 1 lần: booking khởi động thấy bảng SafetyRules trống thì nạp các quy tắc này với trạng thái "Đang áp dụng".
// Sau đó quy tắc được quản lý ở trang "Quy tắc an toàn" (quản lý soạn -> bác sĩ xem xét -> quản lý duyệt).

const SOURCES = {
  EMA_RETINOID: { label: 'EMA: Retinoid-containing medicinal products (2018)', url: 'https://www.ema.europa.eu/en/medicines/human/referrals/retinoid-containing-medicinal-products' },
  LY_2022: { label: 'Ly S. et al. Treatment of Acne Vulgaris During Pregnancy and Lactation. Dermatol Ther 2022', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9823189/' },
  MOTHERTOBABY: { label: 'MotherToBaby: Topical Tretinoin (2024)', url: 'https://mothertobaby.org/fact-sheets/tretinoin-retin-a-pregnancy/' },
  DAILYMED_ADAPALENE: { label: 'DailyMed: Adapalene gel 0.3% (nhãn thuốc 6/2024)', url: 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=a3b6f3c3-d615-4b00-a76f-134b75e30a50&type=display' },
  TRIVEDI_2017: { label: 'A review of the safety of cosmetic procedures during pregnancy and lactation. Int J Womens Dermatol 2017', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5418954/' },
  CASTILLO_2018: { label: 'Castillo DE, Keri JE. Chemical peels in the treatment of acne. Clin Cosmet Investig Dermatol 2018', url: 'https://www.dovepress.com/chemical-peels-in-the-treatment-of-acne-patient-selection-and-perspect-peer-reviewed-fulltext-article-CCID' },
  SPRING_2017: { label: 'Spring LK et al. Isotretinoin and Timing of Procedural Interventions. JAMA Dermatol 2017', url: 'https://pubmed.ncbi.nlm.nih.gov/28658462/' },
  STATPEARLS_MICRONEEDLING: { label: 'StatPearls: Microneedling (2022)', url: 'https://www.ncbi.nlm.nih.gov/sites/books/NBK459344/' },
  MICRONEEDLING_REVIEW: { label: 'Microneedling in Dermatology: A Comprehensive Review (PMC11499218)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11499218/' },
  MESO_CONSENSUS: { label: 'International Consensus Guidelines on Mesotherapy. J Clin Med 2025', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12250733/' },
  THERMAGE: { label: 'Thermage CPT/FLX: thông tin an toàn của nhà sản xuất', url: 'https://www.thermage.com/hcp/' },
  IONTO_TRIAL: { label: 'Tap Water Iontophoresis, thử nghiệm lâm sàng. Ann Dermatol 2017 (tiêu chí loại trừ)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5705354/' },
  CLINIC: { label: 'Quy định dịch vụ của phòng khám (mục "Không phù hợp với")', url: null },
  KLENZIT_C_LEAFLET: { label: 'Tờ hướng dẫn sử dụng Gel Klenzit-C (Adapalene + Clindamycin phosphat), Glenmark, PE55139 VN - mục Chống chỉ định', url: null },
};

// Đối tượng: hoạt chất (tìm trong bảng thành phần) và thủ thuật (tìm trong tên dịch vụ / tên + mô tả gói).
// Từ khóa so theo nguyên từ, bỏ dấu, không phân biệt hoa thường; "*" ở cuối = khớp cả từ dài hơn (peel* khớp peeling).
// excludes: cụm bị bỏ qua trước khi so (Capryloyl Salicylic Acid là dẫn xuất khác hoạt chất). all_of: phải có đủ các từ khóa.
const TARGETS = [
  { code: 'RETINOID_DRUG', kind: 'INGREDIENT', label: 'Retinoid dạng thuốc (adapalene, tretinoin)', keywords: ['adapalene', 'tretinoin'] },
  { code: 'RETINOL', kind: 'INGREDIENT', label: 'Retinol', keywords: ['retinol', 'retinal', 'retinyl'] },
  { code: 'SALICYLIC_ACID', kind: 'INGREDIENT', label: 'Salicylic acid', keywords: ['salicylic acid'], excludes: ['capryloyl salicylic acid'] },
  { code: 'ADAPALENE_CLINDAMYCIN', kind: 'INGREDIENT', label: 'Phối hợp Adapalene + Clindamycin dạng bôi', keywords: ['adapalene', 'clindamycin'], all_of: true },
  { code: 'PEEL', kind: 'PROCEDURE', label: 'Peel da', keywords: ['peel*'] },
  { code: 'LASER', kind: 'PROCEDURE', label: 'Laser', keywords: ['laser*'] },
  { code: 'MICRONEEDLING', kind: 'PROCEDURE', label: 'Vi kim', keywords: ['vi kim'] },
  { code: 'MESO', kind: 'PROCEDURE', label: 'Meso', keywords: ['meso'] },
  { code: 'RF', kind: 'PROCEDURE', label: 'Sóng RF', keywords: ['sóng rf', 'rf'] },
  { code: 'IONTOPHORESIS', kind: 'PROCEDURE', label: 'Điện di', keywords: ['điện di'] },
];

const rule = (flag, target, severity, message, ...sources) => ({ flag, target, severity, message, sources });

const RULES = [
  // Mang thai
  rule('PREGNANT', 'RETINOID_DRUG', 'CONTRAINDICATED', 'Retinoid bôi chống chỉ định khi mang thai.', 'EMA_RETINOID', 'LY_2022'),
  rule('PREGNANT', 'RETINOL', 'CAUTION', 'Phần lớn chuyên gia khuyên tránh mọi retinoid bôi trong thai kỳ.', 'LY_2022', 'MOTHERTOBABY'),
  rule('PREGNANT', 'SALICYLIC_ACID', 'CAUTION', 'Tránh bôi salicylic acid trên diện rộng, kéo dài khi mang thai.', 'LY_2022'),
  rule('PREGNANT', 'PEEL', 'CONTRAINDICATED', 'Dịch vụ peel của phòng khám không áp dụng cho phụ nữ mang thai; an toàn của peel trong thai kỳ chưa đủ bằng chứng.', 'CLINIC', 'CASTILLO_2018'),
  rule('PREGNANT', 'LASER', 'CONTRAINDICATED', 'Laser thẩm mỹ không được chỉ định khi mang thai do thiếu dữ liệu an toàn.', 'TRIVEDI_2017'),
  rule('PREGNANT', 'MICRONEEDLING', 'CAUTION', 'An toàn của vi kim khi mang thai chưa được xác lập, nên hoãn tới sau sinh.', 'MICRONEEDLING_REVIEW'),
  rule('PREGNANT', 'MESO', 'CONTRAINDICATED', 'Dịch vụ meso của phòng khám không áp dụng cho phụ nữ mang thai.', 'CLINIC'),
  rule('PREGNANT', 'RF', 'CONTRAINDICATED', 'Dịch vụ RF của phòng khám không áp dụng cho phụ nữ mang thai; nhà sản xuất thiết bị RF chưa nghiên cứu trên nhóm này.', 'CLINIC', 'THERMAGE'),
  rule('PREGNANT', 'IONTOPHORESIS', 'CAUTION', 'Thiếu dữ liệu an toàn: thử nghiệm điện di loại trừ phụ nữ mang thai.', 'IONTO_TRIAL'),
  // Có kế hoạch mang thai
  rule('PLANNING_PREGNANCY', 'RETINOID_DRUG', 'CONTRAINDICATED', 'Retinoid bôi chống chỉ định ở phụ nữ có kế hoạch mang thai.', 'EMA_RETINOID'),
  rule('PLANNING_PREGNANCY', 'RETINOL', 'CAUTION', 'Dữ liệu với tretinoin: có thể được khuyên ngưng 1 tháng trước khi có thai. Cân nhắc tương tự với retinol.', 'MOTHERTOBABY'),
  // Cho con bú
  rule('BREASTFEEDING', 'RETINOID_DRUG', 'INFO', 'Dùng trên diện nhỏ, thời gian ngắn nhất; không bôi vùng ngực.', 'DAILYMED_ADAPALENE', 'LY_2022'),
  rule('BREASTFEEDING', 'RETINOL', 'INFO', 'Không bôi vùng ngực.', 'LY_2022'),
  rule('BREASTFEEDING', 'ADAPALENE_CLINDAMYCIN', 'CONTRAINDICATED', 'Nhãn thuốc phối hợp Adapalene + Clindamycin ghi chống chỉ định cho phụ nữ đang cho con bú (chưa rõ thuốc có vào sữa mẹ không).', 'KLENZIT_C_LEAFLET'),
  rule('BREASTFEEDING', 'MESO', 'CONTRAINDICATED', 'Dịch vụ meso của phòng khám không áp dụng khi đang cho con bú.', 'CLINIC'),
  rule('BREASTFEEDING', 'RF', 'CAUTION', 'Nhà sản xuất thiết bị RF chưa nghiên cứu trên người đang cho con bú.', 'THERMAGE'),
  rule('BREASTFEEDING', 'IONTOPHORESIS', 'CAUTION', 'Thiếu dữ liệu an toàn: thử nghiệm điện di loại trừ phụ nữ cho con bú.', 'IONTO_TRIAL'),
  // Isotretinoin uống
  rule('ISOTRETINOIN', 'PEEL', 'CAUTION', 'Quy định phòng khám chưa peel khi đang dùng thuốc trị mụn đường uống. Tổng quan 2017 chưa đủ bằng chứng buộc hoãn peel nông, bác sĩ cân nhắc từng ca.', 'CLINIC', 'SPRING_2017'),
  rule('ISOTRETINOIN', 'LASER', 'INFO', 'Tổng quan 2017: chưa đủ bằng chứng buộc hoãn laser không bóc tách; laser bóc tách toàn phần thì không khuyến cáo.', 'SPRING_2017'),
  rule('ISOTRETINOIN', 'MESO', 'CAUTION', 'Thuốc làm thay đổi quá trình lành da là chống chỉ định của meso theo đồng thuận quốc tế; bác sĩ đánh giá isotretinoin có thuộc nhóm này với khách không.', 'MESO_CONSENSUS'),
  // Đông máu
  rule('ANTICOAGULANT', 'MICRONEEDLING', 'CONTRAINDICATED', 'Người có rối loạn đông máu hoặc dùng thuốc chống đông nên tránh vi kim.', 'MICRONEEDLING_REVIEW'),
  rule('ANTICOAGULANT', 'MESO', 'CAUTION', 'Có thể chảy máu kéo dài và tụ máu tại vị trí tiêm.', 'MESO_CONSENSUS'),
  // Sẹo lồi
  rule('KELOID', 'MICRONEEDLING', 'CONTRAINDICATED', 'Không phù hợp với cơ địa sẹo lồi.', 'CLINIC', 'STATPEARLS_MICRONEEDLING'),
  rule('KELOID', 'MESO', 'CONTRAINDICATED', 'Cơ địa sẹo lồi, sẹo phì đại là chống chỉ định của meso.', 'MESO_CONSENSUS'),
  // Nhiễm trùng, mụn viêm
  rule('ACTIVE_INFECTION', 'PEEL', 'CONTRAINDICATED', 'Đang nhiễm khuẩn, nấm hoặc virus là chống chỉ định của peel.', 'CASTILLO_2018'),
  rule('ACTIVE_INFECTION', 'MICRONEEDLING', 'CONTRAINDICATED', 'Nhiễm trùng khu trú, herpes đang hoạt động ở vùng điều trị là chống chỉ định.', 'STATPEARLS_MICRONEEDLING'),
  rule('ACTIVE_INFECTION', 'MESO', 'CONTRAINDICATED', 'Herpes đang hoạt động là chống chỉ định; dịch vụ không áp dụng cho da đang viêm nhiễm.', 'MESO_CONSENSUS', 'CLINIC'),
  rule('ACTIVE_INFECTION', 'RF', 'CAUTION', 'Nhà sản xuất thiết bị RF chưa nghiên cứu trên người có herpes.', 'THERMAGE'),
  rule('ACTIVE_ACNE', 'MICRONEEDLING', 'CONTRAINDICATED', 'Mụn đang hoạt động, nhất là mụn viêm, là chống chỉ định của vi kim.', 'STATPEARLS_MICRONEEDLING', 'CLINIC'),
  // Bệnh nền
  rule('IMMUNOSUPPRESSED', 'MICRONEEDLING', 'CONTRAINDICATED', 'Suy giảm miễn dịch, kể cả đang hoá trị, là chống chỉ định của vi kim.', 'STATPEARLS_MICRONEEDLING'),
  rule('CHRONIC_SKIN', 'MICRONEEDLING', 'CONTRAINDICATED', 'Bệnh da mạn tính mức vừa đến nặng như chàm, vảy nến là chống chỉ định của vi kim.', 'STATPEARLS_MICRONEEDLING'),
  rule('AUTOIMMUNE', 'MESO', 'CONTRAINDICATED', 'Bệnh tự miễn là chống chỉ định của meso.', 'MESO_CONSENSUS'),
  rule('AUTOIMMUNE', 'RF', 'CAUTION', 'Nhà sản xuất thiết bị RF chưa nghiên cứu trên người có bệnh tự miễn.', 'THERMAGE'),
  // Thiết bị cấy ghép
  rule('ELECTRONIC_IMPLANT', 'RF', 'CONTRAINDICATED', 'Sóng RF có thể ảnh hưởng máy tạo nhịp, máy khử rung hoặc thiết bị điện cấy ghép.', 'THERMAGE', 'CLINIC'),
  rule('ELECTRONIC_IMPLANT', 'IONTOPHORESIS', 'CAUTION', 'Thử nghiệm điện di loại trừ người có máy tạo nhịp.', 'IONTO_TRIAL'),
  rule('METAL_IMPLANT_FACE', 'RF', 'CONTRAINDICATED', 'Dịch vụ RF của phòng khám không áp dụng khi có cấy ghép kim loại vùng mặt.', 'CLINIC'),
  rule('METAL_IMPLANT_FACE', 'IONTOPHORESIS', 'CAUTION', 'Thử nghiệm điện di loại trừ người có cấy ghép kim loại.', 'IONTO_TRIAL'),
];

module.exports = { SOURCES, TARGETS, RULES };
