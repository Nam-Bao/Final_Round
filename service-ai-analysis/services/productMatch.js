// Gợi ý sản phẩm sau khi soi da THEO QUY TẮC (không cần AI):
// nhóm Roboflow phát hiện -> "vấn đề da" -> sản phẩm có nhãn đó (ProductDetail.concerns, quản lý gắn ở trang Kho & Sản phẩm).
// Gemini chỉ chọn trong danh sách ứng viên này; Gemini lỗi / hết lượt thì trang khách vẫn có sản phẩm + lời khuyên mẫu.

// Nhóm Roboflow (config/aiConfig.json) -> vấn đề da (service-commerce/utils/concerns.js)
const GROUP_CONCERN = {
  inflammatory: 'Mụn viêm',
  comedone: 'Mụn đầu đen/đầu trắng',
  pih: 'Thâm sau mụn',
  pigment_region: 'Nám/tàn nhang',
};
// Bước cơ bản ai cũng cần, thêm vào cuối danh sách để đủ một quy trình
const BASICS = ['Làm sạch', 'Chống nắng'];
const MAX_CANDIDATES = 10;

const concernsOf = (groups = []) => [...new Set(groups.map((g) => GROUP_CONCERN[g.group]).filter(Boolean))];

// Điểm: mỗi vấn đề khớp +3, mỗi bước cơ bản +1. Sản phẩm không khớp gì thì bỏ.
const pickCandidates = (catalog = [], concerns = []) => catalog
  .map((p) => {
    const tags = p.concerns || [];
    const matched = concerns.filter((c) => tags.includes(c));
    const basics = BASICS.filter((c) => tags.includes(c));
    return { ...p, matched, basics, score: matched.length * 3 + basics.length };
  })
  .filter((p) => p.score > 0)
  .sort((a, b) => b.score - a.score || a.price - b.price)
  .slice(0, MAX_CANDIDATES);

const toCard = (p, reason) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image, reason });
const ruleReason = (p) => (p.matched.length ? `Hỗ trợ: ${p.matched.join(', ').toLowerCase()}` : `Bước cơ bản: ${p.basics.join(', ').toLowerCase()}`);

// Lời khuyên mẫu theo vấn đề (dùng khi Gemini không chạy được)
const TIPS = {
  'Mụn viêm': [
    ['skincare', 'Không nặn, cạy mụn viêm để tránh để lại thâm và sẹo.'],
    ['lifestyle', 'Thay vỏ gối 2 - 3 lần/tuần, lau màn hình điện thoại thường xuyên.'],
    ['diet', 'Hạn chế đồ ngọt, sữa béo và đồ chiên nhiều dầu mỡ.'],
  ],
  'Mụn đầu đen/đầu trắng': [
    ['skincare', 'Làm sạch kỹ buổi tối, tẩy trang nếu có trang điểm hoặc dùng kem chống nắng.'],
    ['lifestyle', 'Tránh sờ tay lên mặt, buộc gọn tóc khi ngủ và tập thể dục.'],
  ],
  'Thâm sau mụn': [
    ['skincare', 'Thoa kem chống nắng mỗi ngày, kể cả trời râm, để vết thâm mờ nhanh hơn.'],
    ['diet', 'Ăn nhiều rau xanh và trái cây giàu vitamin C.'],
  ],
  'Nám/tàn nhang': [
    ['skincare', 'Chống nắng phổ rộng, thoa lại sau 2 - 3 giờ khi ở ngoài trời.'],
    ['lifestyle', 'Đội mũ rộng vành, đeo khẩu trang khi ra nắng; hạn chế ra ngoài 10 - 15 giờ.'],
  ],
};
const BASIC_TIPS = [
  ['skincare', 'Rửa mặt bằng sữa rửa mặt dịu nhẹ 2 lần/ngày, không chà xát mạnh.'],
  ['lifestyle', 'Ngủ đủ 7 - 8 tiếng và hạn chế thức khuya.'],
  ['diet', 'Uống đủ 1,5 - 2 lít nước mỗi ngày.'],
];
const ruleTips = (concerns) => {
  const seen = new Set();
  return [...concerns.flatMap((c) => TIPS[c] || []), ...BASIC_TIPS]
    .filter(([, tip]) => !seen.has(tip) && seen.add(tip))
    .slice(0, 7)
    .map(([category, tip]) => ({ category, tip }));
};

// Kết quả chỉ theo quy tắc (Gemini không chạy được)
const ruleAdvice = (concerns, candidates) => ({
  source: 'rules',
  customer_summary: concerns.length
    ? `Ảnh của bạn có dấu hiệu: ${concerns.join(', ').toLowerCase()}. Dưới đây là một số lưu ý chăm sóc và sản phẩm phù hợp.`
    : 'Dưới đây là một số lưu ý chăm sóc da cơ bản. Hãy chụp lại ảnh rõ nét, đủ sáng nếu muốn AI nhận diện chính xác hơn.',
  care_tips: ruleTips(concerns),
  products: candidates.slice(0, 3).map((p) => toCard(p, ruleReason(p))),
});

module.exports = { GROUP_CONCERN, concernsOf, pickCandidates, toCard, ruleReason, ruleAdvice };
