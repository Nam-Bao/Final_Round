// CẢNH BÁO CHỐNG CHỈ ĐỊNH KHI KÊ ĐƠN
// Mỗi quy tắc đều có nguồn đã đọc trực tiếp. Không thêm quy tắc nếu chưa có nguồn: đây là dữ liệu y khoa.
// Hệ thống chỉ nhắc, không thay bác sĩ quyết định: bác sĩ vẫn kê được nhưng phải ghi lý do (lưu ở SafetyOverride).

const SEVERITY = { CONTRAINDICATED: 'Chống chỉ định', CAUTION: 'Thận trọng', INFO: 'Lưu ý' };

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
};

// Câu hỏi sàng lọc. Tình trạng thay đổi được (thai kỳ, thuốc...) nên phải xác nhận lại mỗi lần khám
const FLAGS = {
  PREGNANT: 'Đang mang thai',
  PLANNING_PREGNANCY: 'Đang có kế hoạch mang thai',
  BREASTFEEDING: 'Đang cho con bú',
  ISOTRETINOIN: 'Đang dùng hoặc vừa ngưng isotretinoin uống',
  ANTICOAGULANT: 'Đang dùng thuốc chống đông / có rối loạn đông máu',
  KELOID: 'Cơ địa sẹo lồi',
  ACTIVE_INFECTION: 'Đang nhiễm trùng da / herpes ở vùng điều trị',
  ACTIVE_ACNE: 'Đang có mụn viêm ở vùng điều trị',
  IMMUNOSUPPRESSED: 'Suy giảm miễn dịch / đang hoá trị',
  CHRONIC_SKIN: 'Chàm, vảy nến mức vừa đến nặng',
  AUTOIMMUNE: 'Có bệnh tự miễn',
  ELECTRONIC_IMPLANT: 'Có máy tạo nhịp tim hoặc thiết bị điện cấy ghép',
  METAL_IMPLANT_FACE: 'Có cấy ghép kim loại vùng mặt',
};

// Thủ thuật nhận theo tên dịch vụ; gói thì xét cả mô tả vì tên gói không nêu thủ thuật
const PROCEDURES = {
  PEEL: { label: 'Peel da', re: /peel/ },
  LASER: { label: 'Laser', re: /laser/ },
  MICRONEEDLING: { label: 'Vi kim', re: /vi kim/ },
  MESO: { label: 'Meso', re: /\bmeso\b/ },
  RF: { label: 'Sóng RF', re: /song rf|\brf\b/ },
  IONTOPHORESIS: { label: 'Điện di', re: /dien di/ },
};

// Hoạt chất tìm trong bảng thành phần sản phẩm. Bỏ qua dẫn xuất khác hoạt chất (Capryloyl Salicylic Acid, Ethylhexyl Salicylate)
const INGREDIENTS = {
  RETINOID_DRUG: { label: 'Retinoid dạng thuốc (adapalene, tretinoin)', re: /adapalene|tretinoin/ },
  RETINOL: { label: 'Retinol', re: /\bretinol\b|\bretinal\b|\bretinyl\b/ },
  SALICYLIC_ACID: { label: 'Salicylic acid', re: /(?<!capryloyl )salicylic acid/ },
};

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

// Bỏ dấu, chữ thường để so tên dịch vụ và thành phần
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();

const proceduresOf = (text) => Object.keys(PROCEDURES).filter((k) => PROCEDURES[k].re.test(normalize(text)));
const ingredientsOf = (text) => Object.keys(INGREDIENTS).filter((k) => INGREDIENTS[k].re.test(normalize(text)));
const allergyTerms = (text) => String(text || '').split(/[,;\n]/).map((t) => normalize(t).trim()).filter((t) => t.length >= 3);

const toWarning = (r, itemName) => ({
  code: `${r.flag}:${r.target}`, severity: r.severity, severity_label: SEVERITY[r.severity],
  condition: FLAGS[r.flag], item: itemName, message: r.message, sources: r.sources.map((s) => SOURCES[s]),
});

// items: [{ name, targets: ['PEEL', ...], text: 'bảng thành phần' }]
const evaluate = ({ flags = [], allergies = '', items = [] }) => {
  const warnings = [];
  const terms = allergyTerms(allergies);
  for (const item of items) {
    RULES.filter((r) => flags.includes(r.flag) && item.targets.includes(r.target)).forEach((r) => warnings.push(toWarning(r, item.name)));
    const haystack = normalize(item.text);
    terms.filter((t) => haystack.includes(t)).forEach((t) => warnings.push({
      code: `ALLERGY:${t}`, severity: 'CONTRAINDICATED', severity_label: SEVERITY.CONTRAINDICATED, condition: 'Dị ứng đã ghi trong hồ sơ', item: item.name,
      message: `Hồ sơ ghi dị ứng "${t}", sản phẩm có thành phần này.`, sources: [],
    }));
  }
  const rank = { CONTRAINDICATED: 0, CAUTION: 1, INFO: 2 };
  return warnings.sort((a, b) => rank[a.severity] - rank[b.severity]);
};

module.exports = { SEVERITY, FLAGS, RULES, SOURCES, PROCEDURES, INGREDIENTS, proceduresOf, ingredientsOf, evaluate };
