/*
 * postprocess.js - phần xử lý kết quả Roboflow dùng CHUNG cho app (controller) và scripts/evaluate.js.
 * Sửa ở đây (hoặc trong config/aiConfig.json) thì cả hai cùng đổi, nên số đo luôn khớp với app.
 */
const config = require('../config/aiConfig.json');

const CLASSES = config.classes;
const key = (c) => String(c).trim().toLowerCase();

const GROUP_OF = Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, v.group]));
const MAX_AREA = Object.fromEntries(
  Object.entries(CLASSES).filter(([, v]) => v.maxArea != null && v.maxArea < 1).map(([k, v]) => [k, v.maxArea])
);

// Các cách gom class để so sánh khi đánh giá (evaluate.js). App dùng chế độ 'g2'.
const G1 = { nodule: 'nodule+cyst', cyst: 'nodule+cyst', melasma: 'melasma+freckles', freckles: 'melasma+freckles' };
const MODES = {
  raw: { label: '12 class gốc', map: (c) => c },
  g1: { label: '10 class (nodule+cyst, melasma+freckles)', map: (c) => G1[c] || c },
  g2: {
    label: '6 nhóm (inflammatory=papule/pustule/nodule/cyst, comedone=blackhead/whitehead, pih, pigment_region=melasma/freckles, dark_circle, surface=wrinkle/skin-pore)',
    map: (c) => GROUP_OF[c] || c,
  },
};

const iou = (a, b) => {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

// Cùng nhóm trùng > 50% hoặc khác nhóm trùng > 80% thì giữ box có độ tin cậy cao hơn
const dedupe = (items) => {
  const sorted = [...items].sort((a, b) => b.conf - a.conf);
  const kept = [];
  for (const it of sorted) {
    const dup = kept.some((k) => iou(k.box, it.box) > (k.cls === it.cls ? 0.5 : 0.8));
    if (!dup) kept.push(it);
  }
  return kept;
};

// Roboflow trả tọa độ tâm (x, y, width, height); đổi sang góc trên-trái
const fromRoboflow = (p) => ({
  class: p.class,
  confidence: p.confidence,
  left: p.x - p.width / 2,
  top: p.y - p.height / 2,
  width: p.width,
  height: p.height,
});

/*
 * preds: [{ class, confidence (0-1), left, top, width, height }] theo đơn vị pixel của ảnh (w x h)
 * mode:  'raw' | 'g1' | 'g2'
 * opts:  minConf (mặc định 10, đơn vị %), useMaxArea (true), dropDisabled (false: bỏ class tắt/không biết),
 *        dropped (mảng để ghi lý do bỏ box, dùng khi gỡ lỗi)
 * trả về: [{ cls (class hoặc nhóm theo mode), raw (class gốc), conf (%), box }]
 */
function postprocess(preds, w, h, mode, opts = {}) {
  const { minConf = config.fetchConf, useMaxArea = true, dropDisabled = false, dropped = null } = opts;
  const area = w * h;
  const out = [];
  for (const p of preds) {
    const conf = p.confidence * 100;
    if (conf < minConf) continue;
    const raw = key(p.class);
    const info = CLASSES[raw];
    if (dropDisabled && (!info || info.enabled === false)) {
      dropped?.push(`${p.class}:${Math.round(conf)}% (class không dùng)`);
      continue;
    }
    const ratio = (p.width * p.height) / area;
    if (useMaxArea && MAX_AREA[raw] && ratio > MAX_AREA[raw]) {
      dropped?.push(`${p.class}:${Math.round(conf)}% (box chiếm ${(ratio * 100).toFixed(1)}% ảnh)`);
      continue;
    }
    out.push({
      cls: MODES[mode].map(raw),
      raw,
      conf,
      box: { left: p.left, top: p.top, width: p.width, height: p.height },
    });
  }
  return dedupe(out);
}

module.exports = { config, CLASSES, GROUP_OF, MAX_AREA, MODES, iou, dedupe, fromRoboflow, postprocess, key };