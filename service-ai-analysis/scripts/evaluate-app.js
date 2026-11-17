#!/usr/bin/env node
/*
 * evaluate-app.js - đo chất lượng phân tích da THEO ĐÚNG LUỒNG CỦA APP (services/postprocess.js + config/aiConfig.json),
 * dùng kết quả Roboflow đã cache (.cache/<model>/, do evaluate.js tạo) => KHÔNG gọi API, chạy lại miễn phí.
 *
 *   node scripts/evaluate-app.js --split test                      # đo với cấu hình hiện tại
 *   node scripts/evaluate-app.js --split valid --tune              # tìm ngưỡng "có vấn đề" + ngưỡng mức độ (chỉ chỉnh trên VALID)
 *   node scripts/evaluate-app.js --split test --gemini .cache/gemini/gemini-3.6-flash/test.jsonl   # so với Gemini (gemini_eval.js)
 *   node scripts/evaluate-app.js --split test --json report.json   # ghi báo cáo
 *
 * Mặc định loại các ảnh trùng với tập train (scripts/leakage/leak-<split>.json, tương quan >= 0.97). --keep-leak để giữ.
 * Mức độ mụn viêm tham chiếu thang Hayashi (đếm tổn thương viêm): 0 | 1-5 nhẹ | 6-20 trung bình | > 20 nặng.
 */
const fs = require('fs');
const path = require('path');
const pp = require('../services/postprocess');

const cfg = pp.config;
const ROOT = path.join(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const has = (name) => process.argv.includes(`--${name}`);
const SPLIT = arg('split', 'test');
const MODEL_DIR = path.join(ROOT, '.cache', arg('model', 'skin-problems-detection-jp4jv/4').replace('/', '_'));
const GROUPS = Object.keys(cfg.groups);
const vi = (g) => cfg.groups[g].vi;
const pct = (x) => `${Math.round(x * 100)}%`;
const f1 = ({ tp, fp, fn }) => { const p = tp + fp ? tp / (tp + fp) : 0; const r = tp + fn ? tp / (tp + fn) : 0; return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 }; };
const groupOfLabel = (name) => cfg.classes[String(name).trim().toLowerCase()]?.group;

// Thang Hayashi theo số tổn thương viêm: 0 không | 1 nhẹ | 2 trung bình | 3 nặng
const HAYASHI = [5, 20];
const bucketOf = (n, [a, b]) => (n <= 0 ? 0 : n <= a ? 1 : n <= b ? 2 : 3);
const SEV = ['Không có mụn viêm', 'Nhẹ', 'Trung bình', 'Nặng'];

function load(split) {
  const coco = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', split, `${split}.json`), 'utf8'));
  const cats = Object.fromEntries(coco.categories.map((c) => [c.id, c.name]));
  const annBy = {};
  coco.annotations.forEach((a) => { (annBy[a.image_id] ||= []).push(a); });
  let leaked = new Set();
  const leakFile = path.join(__dirname, 'leakage', `leak-${split}.json`);
  if (!has('keep-leak') && fs.existsSync(leakFile)) {
    leaked = new Set(JSON.parse(fs.readFileSync(leakFile, 'utf8')).pairs.filter((p) => p.corr >= 0.97).map((p) => p.a));
  }
  const rows = [];
  for (const im of coco.images) {
    if (leaked.has(im.file_name)) continue;
    const f = path.join(MODEL_DIR, `${im.file_name}.json`);
    if (!fs.existsSync(f)) continue;
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    const sx = c.sent.w / im.width; const sy = c.sent.h / im.height;
    const gt = (annBy[im.id] || []).map((a) => ({ g: groupOfLabel(cats[a.category_id]), box: { left: a.bbox[0] * sx, top: a.bbox[1] * sy, width: a.bbox[2] * sx, height: a.bbox[3] * sy } }))
      .filter((x) => GROUPS.includes(x.g));
    const items = pp.postprocess(c.preds, c.sent.w, c.sent.h, 'g2', { minConf: cfg.fetchConf, useMaxArea: true, dropDisabled: true });
    rows.push({ file: im.file_name, gt, items });
  }
  return { rows, leaked: leaked.size, total: coco.images.length };
}

// Kết luận của app cho 1 ảnh (giống controller): có nhóm nào, khung vẽ, số mụn viêm, mức độ
const appView = (items, presence = Object.fromEntries(GROUPS.map((g) => [g, cfg.groups[g].presence])), sev = cfg.severity.inflammatoryCount || HAYASHI) => {
  const maxConf = Object.fromEntries(GROUPS.map((g) => [g, items.filter((i) => i.cls === g).reduce((m, i) => Math.max(m, i.conf), 0)]));
  const present = Object.fromEntries(GROUPS.map((g) => [g, maxConf[g] >= presence[g]]));
  const shown = items.filter((i) => cfg.groups[i.cls] && i.conf >= cfg.groups[i.cls].show);
  const inflamCount = shown.filter((i) => i.cls === 'inflammatory').length;
  return { maxConf, present, shown, inflamCount, severity: bucketOf(inflamCount, sev) };
};

const imageLevel = (rows, presentOf) => Object.fromEntries(GROUPS.map((g) => {
  const s = { tp: 0, fp: 0, fn: 0, tn: 0 };
  rows.forEach((r) => { const truth = r.gt.some((x) => x.g === g); const pred = presentOf(r, g); if (truth && pred) s.tp++; else if (pred) s.fp++; else if (truth) s.fn++; else s.tn++; });
  return [g, s];
}));

const boxLevel = (rows, iouThr = 0.3) => Object.fromEntries(GROUPS.map((g) => {
  const s = { tp: 0, fp: 0, fn: 0 };
  rows.forEach((r) => {
    const G = r.gt.filter((x) => x.g === g); const P = appView(r.items).shown.filter((i) => i.cls === g).sort((a, b) => b.conf - a.conf);
    const used = new Set(); let tp = 0;
    P.forEach((p) => { let best = -1; let bi = -1; G.forEach((t, i) => { if (!used.has(i)) { const v = pp.iou(p.box, t.box); if (v > best) { best = v; bi = i; } } }); if (best >= iouThr) { tp++; used.add(bi); } });
    s.tp += tp; s.fp += P.length - tp; s.fn += G.length - tp;
  });
  return [g, s];
}));

const severityAgreement = (rows, sev) => {
  let exact = 0; let within1 = 0; const confusion = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  rows.forEach((r) => {
    const truth = bucketOf(r.gt.filter((x) => x.g === 'inflammatory').length, HAYASHI);
    const pred = appView(r.items, undefined, sev).severity;
    confusion[truth][pred]++; if (truth === pred) exact++; if (Math.abs(truth - pred) <= 1) within1++;
  });
  return { exact: exact / rows.length, within1: within1 / rows.length, confusion };
};

const printImage = (title, s) => {
  console.log(title);
  GROUPS.forEach((g) => { const m = f1(s[g]); console.log(`  ${vi(g).padEnd(22)} precision ${pct(m.p).padStart(4)}  recall ${pct(m.r).padStart(4)}  F1 ${pct(m.f1).padStart(4)}   (ảnh có thật ${s[g].tp + s[g].fn}, báo nhầm ${s[g].fp})`); });
  const macro = GROUPS.reduce((a, g) => a + f1(s[g]).f1, 0) / GROUPS.length;
  console.log(`  ${'Trung bình 4 nhóm'.padEnd(22)} F1 ${pct(macro)}`);
  return macro;
};

const { rows, leaked, total } = load(SPLIT);
console.log(`Tập ${SPLIT.toUpperCase()}: đo ${rows.length}/${total} ảnh (loại ${leaked} ảnh trùng với train)`);
const report = { split: SPLIT, images: rows.length, config: { presence: Object.fromEntries(GROUPS.map((g) => [g, cfg.groups[g].presence])), severity: cfg.severity.inflammatoryCount || HAYASHI } };

report.roboflow = imageLevel(rows, (r, g) => appView(r.items).present[g]);
printImage('\nRoboflow (luồng app) - mức cả ảnh:', report.roboflow);
report.boxes = boxLevel(rows);
console.log('Mức từng khung (IoU >= 0.3):');
GROUPS.forEach((g) => { const m = f1(report.boxes[g]); console.log(`  ${vi(g).padEnd(22)} precision ${pct(m.p).padStart(4)}  recall ${pct(m.r).padStart(4)}  F1 ${pct(m.f1).padStart(4)}${cfg.groups[g].drawBoxes === false ? '   (app không vẽ khung nhóm này)' : ''}`); });
const sevNow = severityAgreement(rows, report.config.severity);
report.severity = sevNow;
console.log(`Mức độ mụn viêm so với thang Hayashi trên nhãn thật: đúng mức ${pct(sevNow.exact)}, lệch tối đa 1 mức ${pct(sevNow.within1)}`);
console.log(`  Ma trận (hàng = thật, cột = app; ${SEV.join(' / ')}):`); sevNow.confusion.forEach((row, i) => console.log(`  ${SEV[i].padEnd(18)} ${row.map((n) => String(n).padStart(4)).join('')}`));

// ---- Chỉnh ngưỡng trên VALID
if (has('tune')) {
  if (SPLIT !== 'valid') console.log('\n⚠️  Chỉ nên chỉnh ngưỡng trên tập VALID, rồi đo lại trên TEST.');
  console.log('\nNgưỡng "có vấn đề" tốt nhất (tối đa F1 mức cả ảnh):');
  const best = {};
  GROUPS.forEach((g) => {
    let top = { thr: cfg.groups[g].presence, f1: -1 };
    for (let thr = cfg.fetchConf; thr <= 95; thr += 1) {
      const s = { tp: 0, fp: 0, fn: 0 };
      rows.forEach((r) => { const truth = r.gt.some((x) => x.g === g); const pred = appView(r.items).maxConf[g] >= thr; if (truth && pred) s.tp++; else if (pred) s.fp++; else if (truth) s.fn++; });
      const m = f1(s); if (m.f1 > top.f1 + 1e-9) top = { thr, f1: m.f1, p: m.p, r: m.r };
    }
    best[g] = top.thr;
    console.log(`  ${vi(g).padEnd(22)} hiện tại ${String(cfg.groups[g].presence).padStart(3)} -> đề xuất ${String(top.thr).padStart(3)}  (F1 ${pct(top.f1)}, P ${pct(top.p)}, R ${pct(top.r)})`);
  });
  console.log('\nNgưỡng số mụn viêm app đếm được -> mức độ (khớp thang Hayashi trên nhãn thật nhiều nhất):');
  let topS = { a: 0, b: 0, exact: -1 };
  for (let a = 1; a <= 15; a++) for (let b = a + 1; b <= 40; b++) {
    const s = severityAgreement(rows, [a, b]);
    if (s.exact > topS.exact + 1e-9 || (Math.abs(s.exact - topS.exact) < 1e-9 && s.within1 > topS.within1)) topS = { a, b, exact: s.exact, within1: s.within1 };
  }
  console.log(`  Nhẹ: 1-${topS.a} nốt app vẽ | Trung bình: ${topS.a + 1}-${topS.b} | Nặng: > ${topS.b}  (đúng mức ${pct(topS.exact)}, lệch tối đa 1 mức ${pct(topS.within1)})`);
  report.tuned = { presence: best, inflammatoryCount: [topS.a, topS.b] };
}

// ---- So sánh với Gemini
const gemFile = arg('gemini');
if (gemFile) {
  const gem = new Map(fs.readFileSync(gemFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((x) => [x.file, x.result]));
  const both = rows.filter((r) => gem.has(r.file));
  console.log(`\n===== So sánh với Gemini trên ${both.length} ảnh có cả hai kết quả`);
  const rf = imageLevel(both, (r, g) => appView(r.items).present[g]);
  const gm = imageLevel(both, (r, g) => !!gem.get(r.file)[g]?.present);
  const or = imageLevel(both, (r, g) => appView(r.items).present[g] || !!gem.get(r.file)[g]?.present);
  const and = imageLevel(both, (r, g) => appView(r.items).present[g] && !!gem.get(r.file)[g]?.present);
  report.compare = { images: both.length, roboflow: rf, gemini: gm, or, and };
  printImage('Roboflow:', rf);
  printImage('Gemini:', gm);
  printImage('Kết hợp HOẶC (một trong hai báo có):', or);
  printImage('Kết hợp VÀ (cả hai cùng báo có):', and);
  const toks = [...gem.values()].length;
  const lines = fs.readFileSync(gemFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const avg = (k) => Math.round(lines.reduce((s, x) => s + (k === 'ms' ? x.ms : x.tokens?.[k] || 0), 0) / lines.length);
  console.log(`Gemini trung bình mỗi ảnh: ${avg('ms')} ms, ${avg('in')} token vào, ${avg('out')} token ra (${toks} ảnh)`);
  // Đếm mụn viêm của Gemini so với Hayashi
  let exact = 0;
  both.forEach((r) => { const t = bucketOf(r.gt.filter((x) => x.g === 'inflammatory').length, HAYASHI); const p = bucketOf(gem.get(r.file).inflammatory?.present ? gem.get(r.file).inflammatory.count : 0, HAYASHI); if (t === p) exact++; });
  console.log(`Mức độ mụn viêm từ số nốt Gemini ước lượng: đúng mức Hayashi ${pct(exact / both.length)}`);
}

if (arg('json')) { fs.mkdirSync(path.dirname(path.resolve(arg('json'))), { recursive: true }); fs.writeFileSync(arg('json'), JSON.stringify(report, null, 2)); console.log(`\nĐã ghi ${arg('json')}`); }
