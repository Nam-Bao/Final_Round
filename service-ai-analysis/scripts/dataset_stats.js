#!/usr/bin/env node
/*
 * dataset_stats.js - thống kê dataset COCO để đưa vào báo cáo và chọn ngưỡng
 *
 *   node scripts/dataset_stats.js --train ./data/train/_annotations.coco.json \
 *        --valid ./data/valid/_annotations.coco.json --test ./data/test/_annotations.coco.json
 *
 * In ra: số box/ảnh theo class và theo tập, ảnh trùng tên gốc giữa các tập,
 * kích thước box (tỷ lệ so với ảnh) theo class và ngưỡng maxArea gợi ý (phân vị 99%).
 */
const fs = require('fs');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const FILES = {
  train: opt('train', './data/train/_annotations.coco.json'),
  valid: opt('valid', './data/valid/_annotations.coco.json'),
  test: opt('test', './data/test/_annotations.coco.json'),
};
const SKIP = new Set(['melasma-acne-wrinkle']); // class cha của Roboflow, không có box

const D = {};
for (const [k, f] of Object.entries(FILES)) {
  if (!fs.existsSync(f)) { console.error(`Không thấy ${f}`); process.exit(1); }
  D[k] = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const cats = {};
D.train.categories.forEach((c) => { if (!SKIP.has(c.name)) cats[c.id] = c.name; });
const splits = Object.keys(D);

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const pad = (s, n) => String(s).padStart(n);

console.log('== Số ảnh / số box');
for (const s of splits) console.log(`  ${s.padEnd(6)} ${pad(D[s].images.length, 5)} ảnh, ${pad(D[s].annotations.length, 6)} box`);

console.log('\n== Số box theo class và theo tập (cột cuối: số ảnh chứa class trong test)');
console.log('class'.padEnd(14) + splits.map((s) => pad(s, 8)).join('') + pad('ảnh test', 10));
const cnt = {}, imgsWith = {};
for (const s of splits) {
  cnt[s] = {}; imgsWith[s] = {};
  for (const a of D[s].annotations) {
    cnt[s][a.category_id] = (cnt[s][a.category_id] || 0) + 1;
    (imgsWith[s][a.category_id] ||= new Set()).add(a.image_id);
  }
}
for (const [id, name] of Object.entries(cats)) {
  console.log(name.padEnd(14) + splits.map((s) => pad(cnt[s][id] || 0, 8)).join('') + pad(imgsWith.test[id]?.size || 0, 10));
}
const empty = Object.entries(cats).filter(([id]) => ['valid', 'test'].some((s) => !(cnt[s][id] > 0)));
if (empty.length) console.log(`\n! Class thiếu hoàn toàn trong valid hoặc test (không thể đo): ${empty.map(([, n]) => n).join(', ')}`);

console.log('\n== Ảnh trùng tên gốc giữa các tập (có thể là trùng tên ngẫu nhiên giữa các nguồn)');
const names = {};
for (const s of splits) names[s] = new Set(D[s].images.map((i) => i.extra?.name).filter(Boolean));
for (const [a, b] of [['train', 'valid'], ['train', 'test'], ['valid', 'test']]) {
  const both = [...names[a]].filter((n) => names[b].has(n));
  console.log(`  ${a} & ${b}: ${both.length}${both.length ? '  vd: ' + both.slice(0, 6).join(', ') : ''}`);
}

console.log('\n== Kích thước box / diện tích ảnh (%), gộp mọi tập');
console.log('class'.padEnd(14) + ['n', 'p50', 'p90', 'p99', 'max'].map((h) => pad(h, 8)).join('') + pad('thanh dài', 11) + pad('maxArea gợi ý', 15));
const ratio = {}, longBar = {};
for (const s of splits) {
  const im = Object.fromEntries(D[s].images.map((i) => [i.id, i]));
  for (const a of D[s].annotations) {
    if (!cats[a.category_id]) continue;
    const i = im[a.image_id];
    const [, , w, h] = a.bbox;
    (ratio[a.category_id] ||= []).push((w * h) / (i.width * i.height));
    if (w / Math.max(h, 1e-6) >= 4) longBar[a.category_id] = (longBar[a.category_id] || 0) + 1;
  }
}
const order = Object.entries(cats).sort((a, b) => (ratio[b[0]]?.length || 0) - (ratio[a[0]]?.length || 0));
for (const [id, name] of order) {
  const v = ratio[id] || [];
  if (!v.length) continue;
  const p99 = q(v, 0.99);
  const suggest = Math.min(1, Math.ceil(p99 * 1.3 * 100) / 100);
  console.log(
    name.padEnd(14) + pad(v.length, 8) + pad((q(v, 0.5) * 100).toFixed(2), 8) + pad((q(v, 0.9) * 100).toFixed(2), 8) +
    pad((p99 * 100).toFixed(2), 8) + pad((Math.max(...v) * 100).toFixed(2), 8) + pad(`${longBar[id] || 0}/${v.length}`, 11) + pad(suggest, 15)
  );
}
console.log('\n(maxArea gợi ý = phân vị 99% x 1.3, làm tròn; "thanh dài" = box có rộng/cao >= 4, thường là nhãn vùng như tàn nhang, nếp nhăn)');