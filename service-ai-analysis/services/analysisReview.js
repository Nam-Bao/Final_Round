// Bác sĩ xác nhận / hiệu chỉnh kết quả soi da AI.
// - Mỗi vùng AI khoanh có số thứ tự (vị trí trong parsed_metrics.issues, bắt đầu từ 1). Bác sĩ chọn: Đúng / Sai loại (chọn loại đúng) / Không phải tổn thương.
// - Vùng AI bỏ sót: nhập nhanh số nốt theo nhóm CHO TỪNG ẢNH (missed_images) và / hoặc khoanh thêm vùng (added_boxes).
//   missed = tổng của các ảnh (thống kê); bản ghi cũ chỉ có missed => coi như của ảnh đầu tiên.
// - Bác sĩ kết luận có / không cho cả 4 nhóm; mức độ tính lại theo thang Hayashi (hoặc bác sĩ chốt mức khác).
// Kết quả hiệu chỉnh lưu ở corrected_metrics (khách xem bản này); parsed_metrics giữ nguyên để đo độ chính xác của AI.
const pp = require('./postprocess');

const cfg = pp.config;
const GROUPS = Object.keys(cfg.groups);
const CLASS_OPTIONS = Object.entries(cfg.classes).filter(([, c]) => c.enabled !== false).map(([key, c]) => ({ value: key, label: c.vi, group: c.group }));
const SEVERITIES = [cfg.severity.noLesionLabel, 'Nhẹ', 'Trung bình', 'Nặng'];
const LOW_EFFORT_MS = 15000;

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const hayashi = (n) => {
  const [mild, moderate] = cfg.severity.inflammatoryCount;
  return n <= 0 ? cfg.severity.noLesionLabel : n <= mild ? 'Nhẹ' : n <= moderate ? 'Trung bình' : 'Nặng';
};
const classInfo = (key) => {
  const c = cfg.classes[key];
  return c && c.enabled !== false ? { raw_class: key, group: c.group, issue_name: c.vi } : null;
};

// Kích thước từng ảnh của lượt soi (bản ghi cũ chỉ có 1 ảnh: parsed_metrics.image_size)
const sizesOf = (metrics, images) => (images?.length ? images.map((im) => im.image_size || metrics.image_size) : [metrics.image_size]);

// Kiểm tra dữ liệu bác sĩ gửi, trả về review đã chuẩn hoá
const validate = (metrics, body, images) => {
  const issues = metrics?.issues || [];
  const verdicts = new Map();
  for (const b of Array.isArray(body.boxes) ? body.boxes : []) {
    const index = Number(b?.index);
    if (!Number.isInteger(index) || index < 1 || index > issues.length) throw bad('Số thứ tự vùng không hợp lệ');
    if (!['CORRECT', 'WRONG_CLASS', 'NOT_LESION'].includes(b.verdict)) throw bad(`Vùng ${index}: chọn Đúng / Sai loại / Không phải tổn thương`);
    let corrected = null;
    if (b.verdict === 'WRONG_CLASS') {
      if (!classInfo(b.corrected_class)) throw bad(`Vùng ${index}: chọn loại tổn thương đúng`);
      if (b.corrected_class === issues[index - 1].raw_class) throw bad(`Vùng ${index}: loại đã chọn trùng với AI, hãy chọn "Đúng"`);
      corrected = b.corrected_class;
    }
    verdicts.set(index, { index, verdict: b.verdict, corrected_class: corrected });
  }
  // Bắt buộc trả lời mọi vùng khách nhìn thấy (vùng nhóm không khoanh / ẩn với khách thì tùy chọn)
  const missing = issues.map((it, i) => ({ it, index: i + 1 })).filter(({ it, index }) => it.draw !== false && !verdicts.has(index)).map(({ index }) => index);
  if (missing.length) throw bad(`Chưa xác nhận vùng số ${missing.join(', ')}`);

  const groups = {};
  for (const g of GROUPS) {
    if (typeof body.groups?.[g] !== 'boolean') throw bad(`Chọn có / không cho nhóm "${cfg.groups[g].vi}"`);
    groups[g] = body.groups[g];
  }
  const sizes = sizesOf(metrics, images);
  const rawMissed = Array.isArray(body.missed_images) ? body.missed_images : [body.missed || {}];
  if (rawMissed.length > sizes.length) throw bad('Số nốt bỏ sót: ảnh không hợp lệ');
  const missed = {};
  const missed_images = sizes.map((_, k) => {
    const one = {};
    for (const g of GROUPS) {
      const n = Number(rawMissed[k]?.[g] || 0);
      if (!Number.isInteger(n) || n < 0 || n > 200) throw bad(`Số nốt bỏ sót của nhóm "${cfg.groups[g].vi}" không hợp lệ`);
      if (n) { one[g] = n; missed[g] = (missed[g] || 0) + n; }
    }
    return one;
  });
  const added = (Array.isArray(body.added_boxes) ? body.added_boxes : []).slice(0, 50).map((a, k) => {
    if (!classInfo(a?.raw_class)) throw bad(`Vùng khoanh thêm ${k + 1}: chọn loại tổn thương`);
    const imageIndex = Number(a.image_index || 0);
    if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= sizes.length) throw bad(`Vùng khoanh thêm ${k + 1}: ảnh không hợp lệ`);
    const W = sizes[imageIndex]?.width || 10000; const H = sizes[imageIndex]?.height || 10000;
    const bb = a.bounding_box || {};
    const box = ['left', 'top', 'width', 'height'].reduce((o, key) => ({ ...o, [key]: Number(bb[key]) }), {});
    if (Object.values(box).some((v) => !Number.isFinite(v)) || box.width < 3 || box.height < 3 || box.left < 0 || box.top < 0 || box.left + box.width > W + 1 || box.top + box.height > H + 1) {
      throw bad(`Vùng khoanh thêm ${k + 1} không hợp lệ`);
    }
    return { image_index: imageIndex, raw_class: a.raw_class, bounding_box: box };
  });
  const severity = body.severity ? String(body.severity) : null;
  if (severity && !SEVERITIES.includes(severity)) throw bad('Mức độ không hợp lệ');
  const note = String(body.note || '').trim().slice(0, 1000);
  return { boxes: [...verdicts.values()], groups, missed, missed_images, added_boxes: added, severity, note };
};

// Kết quả sau hiệu chỉnh (khách xem)
const corrected = (metrics, review, images) => {
  const verdictOf = new Map((review.boxes || []).map((b) => [b.index, b]));
  const issues = [];
  (metrics.issues || []).forEach((it, i) => {
    const v = verdictOf.get(i + 1);
    if (v?.verdict === 'NOT_LESION') return;
    const base = { ...it, index: i + 1, source: 'ai', verified: !!v };
    if (v?.verdict === 'WRONG_CLASS') {
      const c = classInfo(v.corrected_class);
      issues.push({ ...base, ...c, ai_class: it.raw_class, certainty: 'confirmed', draw: cfg.groups[c.group]?.drawBoxes !== false });
    } else issues.push(v ? { ...base, certainty: 'confirmed' } : base);
  });
  (review.added_boxes || []).forEach((a) => {
    const c = classInfo(a.raw_class);
    issues.push({ ...c, image_index: a.image_index || 0, bounding_box: a.bounding_box, certainty: 'confirmed', confidence: null, source: 'doctor', verified: true, draw: cfg.groups[c.group]?.drawBoxes !== false });
  });
  // Mỗi ảnh: mụn viêm đã xác nhận (AI đúng + bác sĩ khoanh thêm) + số nốt bỏ sót của ảnh đó.
  // Mức độ (thang Hayashi đếm trên NỬA mặt) lấy ảnh nhiều nhất; inflammatory_total là tổng cả lượt soi (để hiển thị).
  const missedOf = (k) => (review.missed_images ? review.missed_images[k]?.inflammatory || 0 : k === 0 ? review.missed?.inflammatory || 0 : 0);
  const perImage = sizesOf(metrics, images).map((_, k) => issues.filter((it) => it.group === 'inflammatory' && it.verified && (it.image_index || 0) === k).length + missedOf(k));
  const inflammatory_count = Math.max(0, ...perImage);
  const inflammatory_total = perImage.reduce((a, b) => a + b, 0);
  const autoSeverity = review.groups.inflammatory === false ? cfg.severity.noLesionLabel : hayashi(inflammatory_count);
  return {
    issues,
    groups: GROUPS.map((g) => ({
      group: g, name: cfg.groups[g].vi, present: review.groups[g], boxes: cfg.groups[g].drawBoxes !== false,
      confirmed: issues.filter((it) => it.group === g && it.verified && it.draw !== false).length, possible: 0, missed: review.missed?.[g] || 0,
      total: review.groups[g] ? issues.filter((it) => it.group === g && it.verified).length + (review.missed?.[g] || 0) : 0, // tổng nốt bác sĩ xác nhận của nhóm (cả lượt)
    })),
    inflammatory_count,
    inflammatory_total,
    inflammatory_per_image: perImage,
    severity: review.severity || autoSeverity,
    severity_auto: autoSeverity,
    severity_scale: cfg.severity.scale,
    image_size: metrics.image_size,
    level: GROUPS.some((g) => review.groups[g]) ? 'detected' : 'none',
    doctor_note: review.note || null,
  };
};

const isLowEffort = (review, durationMs) => durationMs < LOW_EFFORT_MS
  && review.boxes.every((b) => b.verdict === 'CORRECT') && !review.added_boxes.length && !Object.keys(review.missed).length;

module.exports = { validate, corrected, isLowEffort, CLASS_OPTIONS, SEVERITIES, hayashi };
