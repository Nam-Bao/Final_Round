#!/usr/bin/env node
/*
 * image_quality_calibrate.js - chọn ngưỡng kiểm tra chất lượng ảnh (services/imageQuality.js).
 *   node scripts/image_quality_calibrate.js [--sample 300]
 * Đo ảnh của bộ dữ liệu (ảnh dùng được) và các bản làm hỏng có kiểm soát (làm mờ, làm tối, làm chói) của chính chúng,
 * rồi in phân vị để chọn ngưỡng: loại gần hết ảnh hỏng nhưng gần như không loại nhầm ảnh tốt.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { measure } = require('../services/imageQuality');

const ROOT = path.join(__dirname, '..');
const i = process.argv.indexOf('--sample');
const SAMPLE = i > -1 ? Number(process.argv[i + 1]) : 300;
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

(async () => {
  const files = ['train', 'valid', 'test'].flatMap((s) => fs.readdirSync(path.join(ROOT, 'data', s)).filter((f) => f.endsWith('.jpg')).map((f) => path.join(ROOT, 'data', s, f)));
  const step = Math.max(1, Math.floor(files.length / SAMPLE));
  const pick = files.filter((_, k) => k % step === 0).slice(0, SAMPLE);
  const good = []; const blur = []; const dark = []; const bright = [];
  for (const f of pick) {
    good.push(await measure(f));
    const img = sharp(f).resize({ width: 1280, withoutEnlargement: true });
    blur.push(await measure(await img.clone().blur(4).toBuffer()));             // mờ rõ (rung tay / lấy nét sai)
    dark.push(await measure(await img.clone().modulate({ brightness: 0.25 }).toBuffer()));
    bright.push(await measure(await img.clone().modulate({ brightness: 2.5 }).toBuffer()));
  }
  const show = (name, arr, key) => console.log(`  ${name.padEnd(12)} ${key.padEnd(10)} p1 ${q(arr.map((x) => x[key]), 0.01)}  p5 ${q(arr.map((x) => x[key]), 0.05)}  p50 ${q(arr.map((x) => x[key]), 0.5)}  p95 ${q(arr.map((x) => x[key]), 0.95)}  p99 ${q(arr.map((x) => x[key]), 0.99)}`);
  console.log(`Đo ${pick.length} ảnh của bộ dữ liệu và các bản làm hỏng:`);
  show('Ảnh tốt', good, 'brightness'); show('Ảnh tốt', good, 'sharpness');
  show('Làm mờ', blur, 'sharpness'); show('Làm tối', dark, 'brightness'); show('Làm chói', bright, 'brightness');
  const out = path.join(ROOT, '.cache', 'image-quality.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ good, blur, dark, bright }));
  console.log(`Đã lưu số đo: ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
