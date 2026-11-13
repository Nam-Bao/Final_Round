// Sản phẩm thay thế khi bác sĩ kê đơn - chọn THEO QUY TẮC, không phải AI:
// 1) Sản phẩm trong đơn bị cảnh báo (bảng quy tắc, hoặc AI nêu mức Thận trọng / Chống chỉ định)
// 2) Ứng viên = sản phẩm còn hàng, có bảng thành phần, cùng ít nhất 1 "vấn đề da xử lý được" (ProductDetail.concerns)
// 3) Bỏ ứng viên mà bảng quy tắc vẫn cảnh báo với tình trạng của khách (thai kỳ, dị ứng...)
// 4) Xếp theo số lần bác sĩ phòng khám đã kê cho chẩn đoán tương tự, rồi theo số vấn đề trùng
const { ingredientsOf, evaluate } = require('./safetyRules');

const MAX_PER_ITEM = 2;
const STOP = new Set(['mức', 'độ', 'do', 'và', 'có', 'ở', 'hai', 'bên', 'nhẹ', 'vừa', 'nặng', 'trung', 'bình', 'thông', 'thường', 'của', 'các', 'theo', 'dõi', 'sau']);
const words = (s) => [...new Set(String(s || '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w)))];

// Chẩn đoán tương tự: trùng >= 1/2 số từ khóa của chẩn đoán ngắn hơn
const similarDiagnosis = (a, b) => {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return false;
  const hit = B.filter((w) => A.includes(w)).length;
  return hit / Math.min(A.length, B.length) >= 0.5;
};

// rows: [{ diagnosis, prescribed_medicines }] các ca đã khám. Không có chẩn đoán hiện tại thì đếm trên tất cả ca
const historyCounts = (rows, diagnosis) => {
  const counts = {};
  for (const row of rows) {
    if (diagnosis && !similarDiagnosis(diagnosis, row.diagnosis)) continue;
    for (const m of row.prescribed_medicines || []) {
      const id = typeof m === 'string' ? m : m?.product_id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    }
  }
  return counts;
};

const isSafeFor = (product, { flags, allergies }) => evaluate({
  flags, allergies,
  items: [{ name: product.name, targets: ingredientsOf(product.ingredients), text: `${product.name} ${product.ingredients || ''}` }],
}).every((w) => w.severity === 'INFO');

// flagged: sản phẩm trong đơn cần thay [{ id, name, concerns }]; catalog: đã bỏ các sản phẩm đang có trong đơn
const findAlternatives = ({ flagged, catalog, patient, history, hasDiagnosis }) => {
  const out = [];
  const used = new Set();
  for (const item of flagged) {
    const tags = item.concerns || [];
    if (!tags.length) continue; // sản phẩm chưa gắn nhãn vấn đề da => không biết thay bằng gì
    const picks = catalog
      .map((c) => ({ c, shared: (c.concerns || []).filter((t) => tags.includes(t)), times: history[c.id] || 0 }))
      .filter(({ c, shared }) => shared.length && !used.has(c.id) && isSafeFor(c, patient))
      .sort((a, b) => b.times - a.times || b.shared.length - a.shared.length || a.c.price - b.c.price)
      .slice(0, MAX_PER_ITEM);
    for (const { c, shared, times } of picks) {
      used.add(c.id);
      out.push({
        replaces: item.name, product_id: c.id, name: c.name, price: c.price, prescription: c.prescription,
        shared_concerns: shared, history_count: times,
        reason: `Cùng xử lý: ${shared.join(', ').toLowerCase()}. Không vướng cảnh báo nào với tình trạng của khách.`
          + (times ? ` Bác sĩ phòng khám đã kê ${times} lần cho chẩn đoán ${hasDiagnosis ? 'tương tự' : 'các ca trước'}.` : ''),
      });
    }
  }
  return out;
};

module.exports = { similarDiagnosis, historyCounts, findAlternatives };
