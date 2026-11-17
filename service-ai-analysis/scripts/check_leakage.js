#!/usr/bin/env node
/*
 * check_leakage.js (bản 2) - tìm ảnh trùng hoặc gần giống nhau giữa hai thư mục ảnh (ví dụ test và train).
 *
 * So sánh ảnh xám thu nhỏ 32x32 bằng hệ số tương quan (1.0 = giống hệt). Chính xác hơn mã băm 64 bit,
 * vốn báo nhầm nhiều với ảnh khuôn mặt nền tối cùng bố cục.
 *
 * Cài đặt:  npm i sharp
 *
 *   node scripts/check_leakage.js --a ./data/test  --b ./data/train --out leak-test.json  --sheet leak-test.jpg
 *   node scripts/check_leakage.js --a ./data/valid --b ./data/train --out leak-valid.json
 *
 * Tùy chọn:
 *   --min-corr <0-1>   chỉ liệt kê cặp có tương quan >= giá trị này (mặc định 0.9)
 *   --sheet <file>     ghi ảnh ghép các cặp giống nhất (trái: ảnh kiểm tra, phải: ảnh tham chiếu) để xem bằng mắt
 *   --sheet-n <n>      số cặp trong ảnh ghép (mặc định 12)
 *   --out <file>       ghi danh sách cặp dạng JSON (dùng cho evaluate.js --leak)
 *
 * Phân mức (ngưỡng khởi điểm, hãy kiểm chứng bằng ảnh ghép):
 *   >= 0.99  gần như chắc chắn là cùng một ảnh
 *   >= 0.97  rất có thể cùng ảnh (nén lại, đổi kích thước)
 *   >= 0.90  rất giống (có thể cùng người/cùng khung hình, chụp liên tiếp)
 * Ảnh cùng một người chụp ở góc khác thường có tương quan thấp hơn và có thể không bị phát hiện.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const DIR_A = opt('a', null);
const DIR_B = opt('b', null);
const MIN_CORR = Number(opt('min-corr', 0.9));
const OUT = opt('out', null);
const SHEET = opt('sheet', null);
const SHEET_N = Number(opt('sheet-n', 12));
const EXT = /\.(jpe?g|png|webp|bmp)$/i;
const N = 32;

if (!DIR_A || !DIR_B) {
  console.error('Dùng: node scripts/check_leakage.js --a <thư mục cần kiểm tra> --b <thư mục tham chiếu>');
  process.exit(1);
}

// Tên Roboflow dạng "ten_jpg.rf.<hash>.jpg" -> tên gốc "ten.jpg"
const originalName = (f) => {
  const m = /^(.*)_(jpe?g|png|webp)\.rf\.[0-9a-f]+\.\w+$/i.exec(f);
  return m ? `${m[1]}.${m[2]}` : f;
};

// Ảnh xám 32x32, chuẩn hóa về trung bình 0 và độ dài 1 để tích vô hướng = hệ số tương quan
async function thumb(file) {
  const { data } = await sharp(file, { failOn: 'none' })
    .resize(N, N, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const v = new Float32Array(N * N);
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += data[i];
  mean /= v.length;
  let norm = 0;
  for (let i = 0; i < v.length; i++) { v[i] = data[i] - mean; norm += v[i] * v[i]; }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

async function loadDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => EXT.test(f));
  const out = [];
  let i = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (i < files.length) {
      const f = files[i++];
      try {
        out.push({ file: f, name: originalName(f), vec: await thumb(path.join(dir, f)) });
      } catch (e) {
        console.warn(`! Bỏ qua ${f}: ${e.message}`);
      }
      if (i % 100 === 0) process.stdout.write(`\r  ${dir}: ${i}/${files.length}`);
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r  ${dir}: ${files.length}/${files.length}\n`);
  return out;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function makeSheet(pairs, file) {
  const T = 220;
  const rows = pairs.slice(0, SHEET_N);
  const tiles = [];
  for (let r = 0; r < rows.length; r++) {
    for (const [c, p] of [[0, path.join(DIR_A, rows[r].a)], [1, path.join(DIR_B, rows[r].b)]]) {
      const buf = await sharp(p, { failOn: 'none' }).resize(T, T, { fit: 'contain', background: '#222' }).jpeg().toBuffer();
      tiles.push({ input: buf, left: c * (T + 4), top: r * (T + 4) });
    }
  }
  await sharp({ create: { width: 2 * T + 4, height: rows.length * (T + 4), channels: 3, background: '#ffffff' } })
    .composite(tiles).jpeg({ quality: 85 }).toFile(file);
}

(async () => {
  console.log('Đang đọc ảnh...');
  const A = await loadDir(DIR_A);
  const B = await loadDir(DIR_B);

  const pairs = [];
  for (const a of A) {
    let best = null;
    for (const b of B) {
      const c = dot(a.vec, b.vec);
      if (!best || c > best.corr) best = { a: a.file, a_name: a.name, b: b.file, b_name: b.name, corr: c };
    }
    if (best && best.corr >= MIN_CORR) pairs.push({ ...best, corr: +best.corr.toFixed(4) });
  }
  pairs.sort((x, y) => y.corr - x.corr);

  const band = (lo, hi) => pairs.filter((p) => p.corr >= lo && p.corr < hi).length;
  console.log(`\nẢnh trong "${DIR_A}" (${A.length} ảnh) so với "${DIR_B}" (${B.length} ảnh):`);
  console.log(`  >= 0.99 (gần như chắc chắn cùng ảnh): ${band(0.99, 2)}`);
  console.log(`  0.97 - 0.99 (rất có thể cùng ảnh):    ${band(0.97, 0.99)}`);
  console.log(`  0.93 - 0.97 (rất giống):              ${band(0.93, 0.97)}`);
  console.log(`  ${MIN_CORR} - 0.93 (khá giống):             ${band(MIN_CORR, 0.93)}`);

  console.log('\nCác cặp giống nhất:');
  pairs.slice(0, 30).forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. corr=${p.corr.toFixed(3)}  ${p.a_name}  ~  ${p.b_name}`));
  if (pairs.length > 30) console.log(`  ... còn ${pairs.length - 30} cặp (xem file --out)`);

  const namesB = new Map(B.map((b) => [b.name, b]));
  const sameName = A.filter((a) => namesB.has(a.name));
  if (sameName.length) {
    const real = sameName.filter((a) => dot(a.vec, namesB.get(a.name).vec) >= 0.97).length;
    console.log(`\nTrùng tên gốc: ${sameName.length} ảnh, trong đó thật sự là cùng ảnh (>= 0.97): ${real}, chỉ trùng tên ngẫu nhiên: ${sameName.length - real}`);
  }

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify({ a: DIR_A, b: DIR_B, minCorr: MIN_CORR, pairs }, null, 2));
    console.log(`Đã ghi ${OUT}`);
  }
  if (SHEET && pairs.length) {
    await makeSheet(pairs, SHEET);
    console.log(`Đã ghi ảnh ghép ${SHEET}: hàng i = cặp số i ở danh sách trên (trái: ảnh kiểm tra, phải: ảnh train). Hãy xem bằng mắt.`);
  }
  console.log('\nBước tiếp: xem ảnh ghép, rồi chạy evaluate.js với --leak <file --out> để loại các ảnh trùng khỏi tập đo.');
})();