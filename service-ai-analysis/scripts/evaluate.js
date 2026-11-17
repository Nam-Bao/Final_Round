#!/usr/bin/env node
/*
 * evaluate.js - đo chất lượng model Roboflow trên tập ảnh có nhãn (định dạng COCO)
 *
 * Cài đặt (trong service-ai-analysis):  npm i sharp dotenv        (cần Node 18+)
 *
 * Ví dụ:
 *   # 1) Chạy thử 5 ảnh để kiểm tra kết nối (tốn rất ít credit)
 *   node scripts/evaluate.js --ann ./data/valid/_annotations.coco.json --limit 5
 *
 *   # 2) Chạy cả tập valid để chỉnh ngưỡng (--tune ghi file thresholds.json)
 *   node scripts/evaluate.js --ann ./data/valid/_annotations.coco.json --tune
 *
 *   # 2b) Đo lại với ngưỡng riêng từng nhóm đã tìm được trên valid (miễn phí nhờ cache)
 *   node scripts/evaluate.js --ann ./data/test/_annotations.coco.json --thresholds thresholds.json
 *
 *   # 3) Chạy tập test MỘT LẦN cuối, loại ảnh trùng với train (file leak-test.json do check_leakage.js tạo)
 *   node scripts/evaluate.js --ann ./data/test/_annotations.coco.json --leak leak-test.json --out report-test.json
 *
 * Kết quả gọi API được lưu cache trong thư mục .cache/ nên chạy lại để thử cách gộp class,
 * ngưỡng, bộ lọc... KHÔNG gọi API thêm. Dùng --refresh để gọi lại từ đầu.
 *
 * Tùy chọn:
 *   --ann <file>        file COCO (mặc định ./data/test/_annotations.coco.json)
 *   --images <dir>      thư mục ảnh (mặc định cùng thư mục với file --ann)
 *   --model <p/v>       ví dụ skin-problems-detection-jp4jv/4 (mặc định lấy từ .env)
 *   --base <url>        mặc định https://detect.roboflow.com (hoặc ROBOFLOW_BASE_URL)
 *   --conf <số>         ngưỡng % để tính precision/recall (mặc định 40)
 *   --max-width <px>    thu nhỏ ảnh trước khi gửi (mặc định 1280, giống app; 0 = giữ nguyên)
 *   --leak <file>       loại khỏi tập đang đo các ảnh bị check_leakage.js báo trùng với train (file --out của nó)
 *   --leak-min-corr <x> chỉ loại cặp có tương quan >= x (mặc định 0.97)
 *   --train <file>      (cách cũ, kém tin cậy) loại ảnh trùng TÊN gốc với train; nên dùng --leak thay thế
 *   --keep-dups         giữ lại ảnh trùng tên dù có --train
 *   --no-maxarea        tắt bộ lọc box quá lớn (để so sánh hiệu quả của bộ lọc)
 *   --tune              tìm ngưỡng tối ưu F1 cho từng class, ghi thresholds.json
 *   --thresholds <file> dùng ngưỡng riêng từng class/nhóm từ file thresholds.json (tạo bằng --tune trên tập VALID)
 *   --iou <x>           ngưỡng IoU để tính một dự đoán là đúng (mặc định 0.5; thử 0.3 cho các class dạng vùng)
 *   --sev a,b,c         ngưỡng số nốt để quy ra mức 0-3 (chốt trên VALID, rồi áp cho TEST); bỏ trống = tự tìm
 *   --limit <n>         chỉ chạy n ảnh đầu
 *   --out <file>        ghi báo cáo JSON
 *   --refresh           bỏ qua cache
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
try { require('dotenv').config(); } catch { /* dotenv là tùy chọn */ }

/* ------------------------------ CLI ------------------------------ */
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

const ANN = opt('ann', './data/test/_annotations.coco.json');
const IMG_DIR = opt('images', path.dirname(ANN));
const MODEL = opt(
  'model',
  process.env.ROBOFLOW_PROJECT && process.env.ROBOFLOW_VERSION
    ? `${process.env.ROBOFLOW_PROJECT}/${process.env.ROBOFLOW_VERSION}`
    : null
);
const BASE = opt('base', process.env.ROBOFLOW_BASE_URL || 'https://detect.roboflow.com');
const API_KEY = process.env.ROBOFLOW_API_KEY;
const TRAIN = opt('train', null);
const LIMIT = Number(opt('limit', 0));
const CONF = Number(opt('conf', 40));
const MAX_WIDTH = Number(opt('max-width', 1280));
const CONCURRENCY = Number(opt('concurrency', 3));
const KEEP_DUPS = opt('keep-dups', false) === true;
const LEAK = opt('leak', null);
const LEAK_MIN = Number(opt('leak-min-corr', 0.97));
const USE_MAX_AREA = opt('no-maxarea', false) !== true;
const TUNE = opt('tune', false) === true;
const REFRESH = opt('refresh', false) === true;
const OUT = opt('out', null);

const IOU_T = Number(opt('iou', 0.5));
const THR_FILE = opt('thresholds', null);
const SEV = opt('sev', null);
const THR = THR_FILE ? JSON.parse(fs.readFileSync(THR_FILE, 'utf8')) : null;
// Ngưỡng cho từng class/nhóm: lấy từ file thresholds nếu có, không thì dùng --conf chung
const thrFor = (mode, cls) => (THR?.[mode]?.[cls]?.threshold ?? CONF);

const FETCH_CONF = 10;   // luôn lấy kết quả từ 10% trở lên rồi lọc phía client
const MIN_SUPPORT = 10;  // class có ít hơn số box thật này sẽ bị đánh dấu "ít mẫu" và bỏ khỏi mAP

/* ------------------------------ Xử lý dùng chung với app ------------------------------ */
// Bảng class, nhóm, ngưỡng diện tích nằm trong config/aiConfig.json; logic ở services/postprocess.js.
// Dùng --no-maxarea để xem hiệu quả của bộ lọc diện tích.
const pp = require('../services/postprocess');
const MODES = pp.MODES;
const G2 = pp.GROUP_OF; // class gốc (chữ thường) -> nhóm
const iou = pp.iou;
const SKIP_CATEGORIES = new Set(['melasma-acne-wrinkle']); // class cha của Roboflow, không có box

const postprocess = (rawPreds, w, h, mode) =>
  pp.postprocess(rawPreds, w, h, mode, { minConf: FETCH_CONF, useMaxArea: USE_MAX_AREA, dropDisabled: false });

/* ------------------------------ Gọi API (có cache) ------------------------------ */
const CACHE_DIR = path.join('.cache', String(MODEL || 'model').replace(/[^\w.-]+/g, '_'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dimWarned = false;

async function detect(image) {
  const cacheFile = path.join(CACHE_DIR, `${image.file_name}.json`);
  if (!REFRESH && fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

  const file = path.join(IMG_DIR, image.file_name);
  if (!fs.existsSync(file)) throw new Error(`Không thấy file ảnh: ${file}`);

  const input = fs.readFileSync(file);
  const meta = await sharp(input).metadata();
  if ((meta.width !== image.width || meta.height !== image.height) && !dimWarned) {
    dimWarned = true;
    console.warn(`! Cảnh báo: kích thước file (${meta.width}x${meta.height}) khác COCO (${image.width}x${image.height}) ở ${image.file_name}. Kiểm tra xoay EXIF.`);
  }

  let pipeline = sharp(input);
  if (MAX_WIDTH > 0) pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
  const { data: jpg, info } = await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });

  const url = `${BASE}/${MODEL}?api_key=${encodeURIComponent(API_KEY || '')}&confidence=${FETCH_CONF}&overlap=30`;
  let json = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: jpg.toString('base64'),
      });
      if (res.ok) { json = await res.json(); break; }
      lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (res.status !== 429 && res.status < 500) break; // lỗi không đáng thử lại
    } catch (e) {
      lastErr = e;
    }
    await sleep(800 * attempt);
  }
  if (!json) throw lastErr || new Error('Không có phản hồi');

  // Roboflow trả tọa độ tâm theo ảnh đã gửi -> đổi về góc trên-trái, theo kích thước ảnh gốc
  const sx = image.width / info.width;
  const sy = image.height / info.height;
  const preds = (json.predictions || []).map((p) => ({
    class: p.class,
    confidence: p.confidence,
    left: (p.x - p.width / 2) * sx,
    top: (p.y - p.height / 2) * sy,
    width: p.width * sx,
    height: p.height * sy,
  }));

  const record = { sent: { w: info.width, h: info.height }, preds };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(record));
  return record;
}

async function pool(list, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < list.length) {
      const k = i++;
      await fn(list[k], k);
    }
  });
  await Promise.all(workers);
}

/* ------------------------------ Chấm điểm ------------------------------ */
function evaluateMode(items, mode) {
  const byCls = {};
  const get = (c) => (byCls[c] ||= { gt: 0, entries: [], imgGt: new Set(), imgMax: new Map() });

  items.forEach((it, k) => {
    const gts = it.gt.map((g) => ({ cls: MODES[mode].map(g.cls), box: g.box, used: false }));
    gts.forEach((g) => { const c = get(g.cls); c.gt++; c.imgGt.add(k); });

    const preds = postprocess(it.preds, it.w, it.h, mode).sort((a, b) => b.conf - a.conf);
    for (const p of preds) {
      let best = -1;
      let bestIou = IOU_T - 1e-7; // cần IoU >= IOU_T
      gts.forEach((g, i) => {
        if (g.used || g.cls !== p.cls) return;
        const v = iou(g.box, p.box);
        if (v >= IOU_T && v > bestIou) { bestIou = v; best = i; }
      });
      if (best >= 0) gts[best].used = true;
      const c = get(p.cls);
      c.entries.push({ conf: p.conf, tp: best >= 0 });
      c.imgMax.set(k, Math.max(c.imgMax.get(k) || 0, p.conf));
    }
  });
  return byCls;
}

function atThreshold(c, t) {
  const e = c.entries.filter((x) => x.conf >= t);
  const tp = e.filter((x) => x.tp).length;
  const fp = e.length - tp;
  const P = e.length ? tp / e.length : 0;
  const R = c.gt ? tp / c.gt : 0;
  const F = P + R ? (2 * P * R) / (P + R) : 0;
  return { pred: e.length, tp, fp, fn: c.gt - tp, P, R, F };
}

// AP@0.5 (nội suy mọi điểm); chỉ tính trên các dự đoán >= FETCH_CONF nên hơi thấp hơn mAP chuẩn
function ap50(c) {
  if (!c.gt) return null;
  const e = [...c.entries].sort((a, b) => b.conf - a.conf);
  let tp = 0, fp = 0;
  const rec = [], prec = [];
  for (const x of e) {
    if (x.tp) tp++; else fp++;
    rec.push(tp / c.gt);
    prec.push(tp / (tp + fp));
  }
  for (let i = prec.length - 2; i >= 0; i--) prec[i] = Math.max(prec[i], prec[i + 1]);
  let ap = 0, prev = 0;
  for (let i = 0; i < rec.length; i++) { ap += (rec[i] - prev) * prec[i]; prev = rec[i]; }
  return ap;
}

const pct = (v) => (v == null ? '   -  ' : `${(v * 100).toFixed(1).padStart(5)}%`);

function printMode(mode, byCls) {
  console.log(`\n=== ${mode.toUpperCase()}: ${MODES[mode].label}`);
  console.log(`    Ngưỡng: ${THR ? `riêng từng class theo ${THR_FILE} (mặc định ${CONF}%)` : `${CONF}%`} | bộ lọc diện tích: ${USE_MAX_AREA ? 'bật' : 'tắt'} | IoU ${IOU_T}`);
  console.log('class'.padEnd(16) + 'thr'.padStart(5) + 'GT'.padStart(6) + 'Pred'.padStart(6) + 'TP'.padStart(6) + 'FP'.padStart(6) + 'FN'.padStart(6) +
    '   Prec    Recall    F1      AP50');

  const names = Object.keys(byCls).sort((a, b) => byCls[b].gt - byCls[a].gt);
  const T = { pred: 0, tp: 0, fp: 0, fn: 0, gt: 0 };
  const aps = [];
  const rows = {};
  for (const n of names) {
    const c = byCls[n];
    const t = thrFor(mode, n);
    const m = atThreshold(c, t);
    const ap = ap50(c);
    const low = c.gt > 0 && c.gt < MIN_SUPPORT;
    if (ap != null && !low) aps.push(ap);
    T.pred += m.pred; T.tp += m.tp; T.fp += m.fp; T.fn += m.fn; T.gt += c.gt;
    rows[n] = { thr: t, gt: c.gt, ...m, ap50: ap };
    console.log(
      (n + (low ? ' *' : '')).padEnd(16) + String(t).padStart(5) + String(c.gt).padStart(6) + String(m.pred).padStart(6) + String(m.tp).padStart(6) +
      String(m.fp).padStart(6) + String(m.fn).padStart(6) + `  ${pct(c.gt ? m.P : null)}  ${pct(c.gt ? m.R : null)}  ${pct(c.gt ? m.F : null)}  ${pct(ap)}`
    );
  }
  const P = T.pred ? T.tp / T.pred : 0;
  const R = T.gt ? T.tp / T.gt : 0;
  const F = P + R ? (2 * P * R) / (P + R) : 0;
  console.log('-'.repeat(91));
  console.log('TỔNG (micro)'.padEnd(16) + ''.padStart(5) + String(T.gt).padStart(6) + String(T.pred).padStart(6) + String(T.tp).padStart(6) +
    String(T.fp).padStart(6) + String(T.fn).padStart(6) + `  ${pct(P)}  ${pct(R)}  ${pct(F)}`);
  const map = aps.length ? aps.reduce((a, b) => a + b, 0) / aps.length : null;
  console.log(`mAP50 (chỉ tính class có >= ${MIN_SUPPORT} box thật: ${aps.length} class): ${pct(map)}`);
  console.log('(* = ít mẫu, không tính vào mAP. LƯU Ý: số class tính mAP khác nhau giữa các tập nên KHÔNG so mAP giữa valid và test, hãy so từng dòng.)');
  return { rows, micro: { P, R, F }, map50: map };
}

// Nhận biết theo ảnh: ảnh có class X hay không, bỏ qua vị trí khung. Hợp với các class dạng vùng (nám, tàn nhang, nếp nhăn, quầng thâm).
function printImageLevel(mode, byCls, nImages) {
  console.log(`\n=== ${mode.toUpperCase()} - NHẬN BIẾT THEO ẢNH (${nImages} ảnh; chỉ xét ảnh có/không có class, không xét vị trí khung)`);
  console.log('class'.padEnd(16) + 'thr'.padStart(5) + 'ảnhGT'.padStart(7) + 'ảnhAI'.padStart(7) + 'TP'.padStart(6) + 'FP'.padStart(6) + 'FN'.padStart(6) + '   Prec    Recall    F1');
  const out = {};
  const names = Object.keys(byCls).sort((a, b) => byCls[b].imgGt.size - byCls[a].imgGt.size);
  for (const n of names) {
    const c = byCls[n];
    const t = thrFor(mode, n);
    const pred = [...c.imgMax.entries()].filter(([, m]) => m >= t).map(([k]) => k);
    if (!c.imgGt.size && !pred.length) continue;
    const tp = pred.filter((k) => c.imgGt.has(k)).length;
    const fp = pred.length - tp;
    const fn = c.imgGt.size - tp;
    const P = pred.length ? tp / pred.length : 0;
    const R = c.imgGt.size ? tp / c.imgGt.size : 0;
    const F = P + R ? (2 * P * R) / (P + R) : 0;
    out[n] = { thr: t, imgGt: c.imgGt.size, imgPred: pred.length, tp, fp, fn, P, R, F };
    console.log(n.padEnd(16) + String(t).padStart(5) + String(c.imgGt.size).padStart(7) + String(pred.length).padStart(7) + String(tp).padStart(6) +
      String(fp).padStart(6) + String(fn).padStart(6) + `  ${pct(c.imgGt.size ? P : null)}  ${pct(c.imgGt.size ? R : null)}  ${pct(c.imgGt.size ? F : null)}`);
  }
  return out;
}

function tuneThresholds(byCls) {
  const out = {};
  for (const [n, c] of Object.entries(byCls)) {
    if (c.gt < 5) continue;
    let best = { t: null, F: -1 };
    for (let t = 10; t <= 80; t += 5) {
      const m = atThreshold(c, t);
      if (m.F > best.F) best = { t, F: m.F, P: m.P, R: m.R };
    }
    out[n] = { threshold: best.t, F1: +best.F.toFixed(3), precision: +best.P.toFixed(3), recall: +best.R.toFixed(3), gt: c.gt };
  }
  return out;
}

// Hạng trung bình (xử lý giá trị trùng) rồi tính tương quan Spearman
function spearman(x, y) {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

// Tìm 3 ngưỡng số nốt a<b<c để quy ra mức 0-3 sao cho khớp nhiều nhất với mức thật
function bestSeverityThresholds(rows, key) {
  const classify = (n, t) => (n < t[0] ? 0 : n < t[1] ? 1 : n < t[2] ? 2 : 3);
  const evalT = (t) => {
    let ok = 0, adj = 0;
    for (const r of rows) {
      const p = classify(r[key], t);
      if (p === r.level) ok++;
      if (Math.abs(p - r.level) <= 1) adj++;
    }
    return { acc: ok / rows.length, adj: adj / rows.length };
  };
  let best = null;
  for (let a = 1; a <= 12; a++) for (let b = a + 1; b <= 20; b++) for (let c = b + 1; c <= 30; c++) {
    const e = evalT([a, b, c]);
    if (!best || e.acc > best.acc || (e.acc === best.acc && e.adj > best.adj)) best = { t: [a, b, c], ...e };
  }
  return { ...best, classify, evalT };
}

// Quy số nốt AI đếm được ra mức 0-3 và so với mức "levleN" trong tên file (ý nghĩa mức chưa được xác nhận)
function severityAnalysis(rows) {
  const L = rows.filter((r) => r.level != null);
  console.log('\n=== QUY RA MỨC ĐỘ 0-3 TỪ SỐ NỐT MỤN VIÊM (so với tiền tố levleN trong tên file)');
  if (L.length < 20) { console.log(`  Chỉ có ${L.length} ảnh mang tiền tố levleN, bỏ qua.`); return null; }

  const counts = [0, 0, 0, 0];
  L.forEach((r) => counts[r.level]++);
  const majority = Math.max(...counts) / L.length;

  let t, e, cls;
  const fit = bestSeverityThresholds(L, 'pred');
  cls = fit.classify;
  if (SEV) {
    t = SEV.split(',').map(Number);
    if (t.length !== 3 || !(t[0] < t[1] && t[1] < t[2])) { console.log('  --sev phải có dạng a,b,c tăng dần, ví dụ 1,3,5'); return null; }
    e = fit.evalT(t);
    console.log(`  Dùng ngưỡng cố định ${t.join(',')} (chốt từ tập khác): chính xác ${(e.acc * 100).toFixed(1)}%, sai lệch tối đa 1 mức ${(e.adj * 100).toFixed(1)}%`);
  } else {
    t = fit.t; e = { acc: fit.acc, adj: fit.adj };
    console.log(`  Ngưỡng tự tìm trên tập này: mức1 từ ${t[0]} nốt, mức2 từ ${t[1]}, mức3 từ ${t[2]} (chốt trên VALID rồi truyền --sev ${t.join(',')} cho TEST)`);
    console.log(`  Chính xác ${(e.acc * 100).toFixed(1)}%, sai lệch tối đa 1 mức ${(e.adj * 100).toFixed(1)}%`);
  }
  const oracle = bestSeverityThresholds(L, 'gt');
  console.log(`  Mốc so sánh: luôn đoán mức đông nhất = ${(majority * 100).toFixed(1)}% | dùng số nốt THẬT (trần của nhãn hiện có) = ${(oracle.acc * 100).toFixed(1)}%`);

  const M = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  L.forEach((r) => { M[r.level][cls(r.pred, t)]++; });
  console.log('  Ma trận nhầm lẫn (hàng: mức thật, cột: mức AI quy ra):');
  console.log('            AI0   AI1   AI2   AI3');
  M.forEach((row, i) => console.log(`  thật ${i}  ` + row.map((v) => String(v).padStart(5)).join(' ')));
  return { thresholds: t, accuracy: e.acc, within1: e.adj, majorityBaseline: majority, oracleGtAccuracy: oracle.acc, confusion: M };
}

// So số nốt mụn viêm AI đếm được với số nốt thật trên từng ảnh
function countAnalysis(items) {
  const gtCount = [], predCount = [];
  const byLevel = {};
  const rows = [];
  const thr = thrFor('g2', 'inflammatory');
  for (const it of items) {
    const g = it.gt.filter((x) => G2[x.cls] === 'inflammatory').length;
    const p = postprocess(it.preds, it.w, it.h, 'g2').filter((x) => x.cls === 'inflammatory' && x.conf >= thr).length;
    gtCount.push(g); predCount.push(p);
    const m = /^levle(\d)_/.exec(it.name);
    const level = m ? Number(m[1]) : null;
    rows.push({ level, gt: g, pred: p });
    if (m) {
      const Lv = (byLevel[m[1]] ||= { n: 0, gt: 0, pred: 0 });
      Lv.n++; Lv.gt += g; Lv.pred += p;
    }
  }
  console.log(`\n=== SỐ NỐT MỤN VIÊM TRÊN MỖI ẢNH (inflammatory, ngưỡng ${thr}%)`);
  const rho = items.length >= 3 ? spearman(gtCount, predCount) : null;
  console.log(`Tương quan Spearman giữa số nốt thật và số nốt AI đếm: ${rho == null ? '-' : rho.toFixed(2)}  (1.0 = cùng thứ hạng hoàn toàn)`);
  const sumG = gtCount.reduce((a, b) => a + b, 0), sumP = predCount.reduce((a, b) => a + b, 0);
  console.log(`Tổng nốt thật: ${sumG} | AI đếm được: ${sumP} (${sumG ? ((sumP / sumG) * 100).toFixed(0) : '-'}% so với thật)`);
  if (Object.keys(byLevel).length) {
    console.log('Theo tiền tố tên file levleN (ý nghĩa mức độ chưa được xác nhận, chỉ để tham khảo):');
    for (const k of Object.keys(byLevel).sort()) {
      const Lv = byLevel[k];
      console.log(`  levle${k}: ${String(Lv.n).padStart(3)} ảnh | thật TB ${(Lv.gt / Lv.n).toFixed(1)} nốt | AI TB ${(Lv.pred / Lv.n).toFixed(1)} nốt`);
    }
  }
  const severity = severityAnalysis(rows);
  return { spearman: rho, gtTotal: sumG, predTotal: sumP, byLevel, severity };
}

/* ------------------------------ Chạy ------------------------------ */
(async () => {
  if (!MODEL) return console.error('Thiếu model. Dùng --model project/version hoặc đặt ROBOFLOW_PROJECT/ROBOFLOW_VERSION trong .env');
  if (!API_KEY) console.warn('! Chưa có ROBOFLOW_API_KEY (chỉ chạy được nếu toàn bộ ảnh đã có trong cache).');
  if (!fs.existsSync(ANN)) return console.error(`Không thấy file nhãn: ${ANN}`);

  const coco = JSON.parse(fs.readFileSync(ANN, 'utf8'));
  const catName = {};
  coco.categories.forEach((c) => { catName[c.id] = String(c.name).trim().toLowerCase(); });

  let images = coco.images;
  if (TRAIN && !KEEP_DUPS) {
    const tr = JSON.parse(fs.readFileSync(TRAIN, 'utf8'));
    const trainNames = new Set(tr.images.map((i) => i.extra?.name).filter(Boolean));
    const before = images.length;
    images = images.filter((i) => !trainNames.has(i.extra?.name));
    console.log(`Loại ${before - images.length}/${before} ảnh trùng tên gốc với train (có thể là trùng tên ngẫu nhiên giữa các nguồn, dùng check_leakage.js để xác minh).`);
  }
  if (LEAK) {
    const L = JSON.parse(fs.readFileSync(LEAK, 'utf8'));
    if ((L.pairs || []).some((p) => p.corr === undefined)) {
      console.error(`File ${LEAK} được tạo bằng phiên bản cũ của check_leakage.js (không có trường "corr"). Hãy chạy lại check_leakage.js bản mới rồi thử lại.`);
      process.exit(1);
    }
    const drop = new Set((L.pairs || []).filter((p) => p.corr >= LEAK_MIN).map((p) => p.a));
    const before = images.length;
    images = images.filter((i) => !drop.has(i.file_name));
    console.log(`Loại ${before - images.length}/${before} ảnh trùng với train (tương quan >= ${LEAK_MIN}, theo ${LEAK}).`);
  }
  if (LIMIT > 0) images = images.slice(0, LIMIT);

  const annsByImage = {};
  coco.annotations.forEach((a) => (annsByImage[a.image_id] ||= []).push(a));

  const cached = images.filter((i) => !REFRESH && fs.existsSync(path.join(CACHE_DIR, `${i.file_name}.json`))).length;
  console.log(`Model: ${MODEL} | ${images.length} ảnh (đã có cache: ${cached}, sẽ gọi API: ${images.length - cached})`);

  const items = [];
  const failed = [];
  let done = 0;
  await pool(images, CONCURRENCY, async (img) => {
    try {
      const r = await detect(img);
      const gt = (annsByImage[img.id] || [])
        .filter((a) => !SKIP_CATEGORIES.has(catName[a.category_id]))
        .map((a) => ({
          cls: catName[a.category_id],
          box: { left: a.bbox[0], top: a.bbox[1], width: a.bbox[2], height: a.bbox[3] },
        }));
      items.push({ name: img.extra?.name || img.file_name, w: img.width, h: img.height, gt, preds: r.preds });
    } catch (e) {
      failed.push(`${img.file_name}: ${e.message}`);
    }
    done++;
    if (done % 10 === 0 || done === images.length) process.stdout.write(`\r  tiến độ ${done}/${images.length}`);
  });
  console.log('');
  if (failed.length) {
    console.warn(`! ${failed.length} ảnh lỗi (bị bỏ qua):`);
    failed.slice(0, 5).forEach((f) => console.warn('  - ' + f));
  }
  if (!items.length) return console.error('Không có ảnh nào được xử lý.');

  const report = { model: MODEL, ann: ANN, images: items.length, conf: CONF, iou: IOU_T, thresholdsFile: THR_FILE, maxArea: USE_MAX_AREA, modes: {} };
  for (const mode of Object.keys(MODES)) {
    const byCls = evaluateMode(items, mode);
    report.modes[mode] = printMode(mode, byCls);
    report.modes[mode].imageLevel = printImageLevel(mode, byCls, items.length);
    if (TUNE) report.modes[mode].tuned = tuneThresholds(byCls);
  }
  report.counts = countAnalysis(items);

  if (TUNE) {
    console.log('\n=== NGƯỠNG TỐI ƯU THEO F1 (chỉ nên chỉnh trên tập VALID, không phải test)');
    for (const mode of ['raw', 'g2']) {
      console.log(`[${mode}]`);
      for (const [n, t] of Object.entries(report.modes[mode].tuned)) {
        console.log(`  ${n.padEnd(16)} ngưỡng ${String(t.threshold).padStart(2)}%  F1 ${t.F1}  (P ${t.precision}, R ${t.recall}, GT ${t.gt})`);
      }
    }
    fs.writeFileSync('thresholds.json', JSON.stringify(Object.fromEntries(Object.entries(report.modes).map(([k, v]) => [k, v.tuned])), null, 2));
    console.log('Đã ghi thresholds.json');
  }
  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`Đã ghi báo cáo: ${OUT}`);
  }
})();