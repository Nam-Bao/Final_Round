// "Vấn đề da xử lý được" của mỹ phẩm (ProductDetail.concerns) - dùng để gợi ý sản phẩm theo quy tắc:
// - Trang soi da AI: nhóm Roboflow phát hiện -> vấn đề tương ứng -> sản phẩm có nhãn đó (service-ai-analysis)
// - Bác sĩ kê đơn: sản phẩm bị cảnh báo -> sản phẩm khác cùng vấn đề, qua được bảng quy tắc (service-booking)
// Quản lý chọn trong trang Kho & Sản phẩm > Thông tin bán web.
const CONCERNS = [
  'Mụn viêm',
  'Mụn đầu đen/đầu trắng',
  'Thâm sau mụn',
  'Nám/tàn nhang',
  'Lỗ chân lông to',
  'Da khô/thiếu ẩm',
  'Da nhạy cảm/kích ứng',
  'Lão hóa/nếp nhăn',
  'Làm sạch',
  'Chống nắng',
];

const sanitizeConcerns = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => CONCERNS.includes(x)))];

// Gắn nhãn ban đầu cho sản phẩm cũ (chưa có nhãn) theo tên, mô tả, công dụng, thành phần - chỉ là gợi ý, quản lý cần xem lại.
// Chỉ dựa vào công dụng / hoạt chất điều trị rõ ràng. Không dùng "loại da phù hợp" ("Da mụn" = hợp với da mụn, không phải trị mụn)
// và không dùng chất phụ có trong rất nhiều sản phẩm (glycerin, hyaluronic, niacinamide...).
const RULES = [
  ['Mụn viêm', /trị mụn|giảm mụn|mụn viêm|acne|benzoyl|adapalene|clindamycin|azelaic|effaclar duo|megaduo|klenzit/i],
  ['Mụn đầu đen/đầu trắng', /đầu đen|đầu trắng|mụn ẩn|salicylic|\bbha\b|\blha\b|adapalene|retinaldehyde|megaduo|effaclar duo/i],
  ['Thâm sau mụn', /thâm|vitamin c|ascorbic|thiamidol|azelaic|tranexamic|arbutin/i],
  ['Nám/tàn nhang', /nám|tàn nhang|thiamidol|tranexamic|arbutin/i],
  ['Lỗ chân lông to', /lỗ chân lông/i],
  ['Da khô/thiếu ẩm', /cấp ẩm|thiếu ẩm|da khô|phục hồi b5|mineral 89/i],
  ['Da nhạy cảm/kích ứng', /nhạy cảm|kích ứng|làm dịu|phục hồi b5|cicaplast|panthenol|madecassoside|sensibio/i],
  ['Lão hóa/nếp nhăn', /lão hóa|nếp nhăn|chống nhăn/i],
  ['Làm sạch', /sữa rửa mặt|tẩy trang|cleanser|micellar|rửa mặt/i],
  ['Chống nắng', /chống nắng|\bspf\b|sunscreen/i],
];
const inferConcerns = (name, detail = {}) => {
  const text = [name, detail.short_description, detail.benefits, detail.ingredients].join(' ');
  return RULES.filter(([, re]) => re.test(text)).map(([c]) => c);
};

module.exports = { CONCERNS, sanitizeConcerns, inferConcerns };
