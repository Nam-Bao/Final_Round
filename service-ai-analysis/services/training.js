// Dữ liệu huấn luyện lại model khoanh vùng từ kết quả bác sĩ xác nhận (giai đoạn 1: xếp loại + xuất COCO).
// Model khoanh vùng học từ việc MỌI tổn thương trên ảnh đều có khung: nốt có trên ảnh mà không có khung sẽ dạy model
// "chỗ này là da thường". Vì vậy chỉ dùng lượt soi ĐỦ NHÃN:
//   - khách đồng ý (consent.allow_training) và chưa rút lại;
//   - bác sĩ không xác nhận quá nhanh "tất cả đúng" (review.low_effort);
//   - với mỗi nhóm bác sĩ kết luận "Có": không còn số nốt bỏ sót và mọi khung AI của nhóm đó đã được bác sĩ chấm.
// Nhãn dùng: khung AI bác sĩ chọn Đúng / Sai loại (theo loại đúng) + khung bác sĩ khoanh thêm. Khung AI chưa chấm không dùng.
const pp = require('./postprocess');

const cfg = pp.config;
const GROUPS = Object.keys(cfg.groups);

const eligibility = (doc) => {
  const consent = doc.consent || {};
  const review = doc.review || {};
  if (!consent.allow_training || consent.withdrawn_at) {
    if (consent.withdrawn_at) return { status: 'REMOVED', reason: 'Khách đã rút lại đồng ý' };
    return { status: 'NOT_ELIGIBLE', reason: doc.source === 'clinic' && !consent.training_answer ? 'Bác sĩ chưa hỏi khách có cho dùng ảnh cải thiện AI' : 'Khách không đồng ý dùng ảnh để huấn luyện' };
  }
  if (review.status !== 'CONFIRMED') return { status: 'NOT_ELIGIBLE', reason: 'Chưa được bác sĩ xác nhận' };
  if (review.low_effort) return { status: 'NOT_ELIGIBLE', reason: 'Xác nhận quá nhanh (dưới 15 giây, tất cả "Đúng")' };
  const issues = doc.parsed_metrics?.issues || [];
  const verdicts = new Set((review.boxes || []).map((b) => b.index));
  const missing = [];
  for (const g of GROUPS) {
    if (!review.groups?.[g]) continue;
    const missed = (review.missed_images || [review.missed || {}]).reduce((n, m) => n + (m?.[g] || 0), 0);
    const unchecked = issues.filter((it, i) => it.group === g && !verdicts.has(i + 1)).length;
    if (missed || unchecked) missing.push(`${cfg.groups[g].vi}${missed ? `: ${missed} nốt bỏ sót chưa khoanh` : ''}${unchecked ? `${missed ? ',' : ':'} ${unchecked} khung AI chưa chấm` : ''}`);
  }
  if (missing.length) return { status: 'NOT_ELIGIBLE', reason: `Thiếu nhãn (${missing.join('; ')})` };
  return { status: 'QUEUED', reason: null };
};

// Nhãn cuối cùng của từng ảnh: [{ image_index, raw_class, bounding_box }]
const labelsOf = (doc) => {
  const review = doc.review || {};
  const issues = doc.parsed_metrics?.issues || [];
  const byIndex = new Map((review.boxes || []).map((b) => [b.index, b]));
  const out = [];
  issues.forEach((it, i) => {
    const v = byIndex.get(i + 1);
    if (!v || v.verdict === 'NOT_LESION' || !it.bounding_box) return;
    out.push({ image_index: it.image_index || 0, raw_class: v.verdict === 'WRONG_CLASS' ? v.corrected_class : it.raw_class, bounding_box: it.bounding_box });
  });
  (review.added_boxes || []).forEach((a) => out.push({ image_index: a.image_index || 0, raw_class: a.raw_class, bounding_box: a.bounding_box }));
  return out;
};

// Danh mục class COCO: các class đang dùng của app (tên giống Roboflow để đưa lên lại được)
const ROBOFLOW_NAME = { pih: 'PIH', melasma: 'Melasma' }; // tên class gốc trong project Roboflow (app dùng chữ thường)
const CATEGORIES = Object.entries(cfg.classes).filter(([, c]) => c.enabled !== false).map(([key, c], i) => ({ id: i + 1, name: ROBOFLOW_NAME[key] || key, key, supercategory: c.group }));

module.exports = { eligibility, labelsOf, CATEGORIES };
