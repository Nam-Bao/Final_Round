#!/usr/bin/env node
/*
 * face_calibrate.js - đo độ chính xác xác thực ảnh chấm công và chọn ngưỡng FACE_MATCH_THRESHOLD / FACE_REVIEW_THRESHOLD.
 *
 * Chuẩn bị thư mục ảnh (KHÔNG đưa lên git, xoá sau khi đo vì là dữ liệu sinh trắc học):
 *   faces-eval/
 *     nguyen-van-a/   ảnh selfie của người A (>= 4 ảnh: vài ảnh làm "ảnh gốc", còn lại làm "ảnh chấm công", khác ngày / ánh sáng)
 *     tran-thi-b/
 *     ...
 *   node scripts/face_calibrate.js faces-eval            # mặc định 3 ảnh đầu mỗi người làm ảnh gốc
 *   node scripts/face_calibrate.js faces-eval --enroll 2
 *
 * Đo:
 *   - Cùng người: mỗi ảnh chấm công so với ảnh gốc của chính người đó => khoảng cách nhỏ nhất.
 *   - Khác người: mỗi ảnh chấm công so với ảnh gốc của MỌI người khác (giả chấm công hộ).
 *   - Với từng ngưỡng: tỉ lệ TỪ CHỐI NHẦM (đúng người mà báo không khớp) và CHẤP NHẬN NHẦM (người khác mà báo khớp).
 * Chọn ngưỡng "khớp" sao cho chấp nhận nhầm gần 0 (chấm công hộ không lọt), ngưỡng "cần xem lại" để phần còn lại vào tay quản lý.
 */
const fs = require('fs');
const path = require('path');
const { singleFace, distance, MATCH, REVIEW } = require('../services/faceId');

const dir = process.argv[2];
const enrollN = Number(process.argv[process.argv.indexOf('--enroll') + 1]) || 3;
if (!dir || !fs.existsSync(dir)) { console.error('Cách dùng: node scripts/face_calibrate.js <thư mục ảnh theo từng người> [--enroll 3]'); process.exit(1); }

(async () => {
  const people = [];
  for (const name of fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory())) {
    const files = fs.readdirSync(path.join(dir, name)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    const vecs = [];
    for (const f of files) {
      const r = await singleFace(fs.readFileSync(path.join(dir, name, f)));
      if (r.descriptor) vecs.push(r.descriptor); else console.log(`  bỏ ${name}/${f}: ${r.error}`);
    }
    if (vecs.length > enrollN) people.push({ name, enroll: vecs.slice(0, enrollN), probes: vecs.slice(enrollN) });
    else console.log(`  bỏ ${name}: cần hơn ${enrollN} ảnh đọc được khuôn mặt`);
  }
  if (people.length < 2) { console.error('Cần ít nhất 2 người, mỗi người hơn', enrollN, 'ảnh'); process.exit(1); }
  const best = (probe, refs) => Math.min(...refs.map((r) => distance(probe, r)));
  const genuine = people.flatMap((p) => p.probes.map((x) => best(x, p.enroll)));
  const impostor = people.flatMap((p) => p.probes.flatMap((x) => people.filter((q) => q !== p).map((q) => best(x, q.enroll))));
  const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
  const stat = (a) => `min ${Math.min(...a).toFixed(3)} · trung bình ${(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3)} · max ${Math.max(...a).toFixed(3)}`;
  console.log(`\n${people.length} người, ${genuine.length} lượt cùng người, ${impostor.length} lượt khác người (ảnh gốc: ${enrollN} ảnh / người)`);
  console.log(`Cùng người:  ${stat(genuine)}`);
  console.log(`Khác người:  ${stat(impostor)}\n`);
  console.log('Ngưỡng | Từ chối nhầm (đúng người bị báo không khớp) | Chấp nhận nhầm (người khác bị báo khớp)');
  for (const t of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
    console.log(`${t.toFixed(2).padEnd(6)} | ${pct(genuine.filter((d) => d >= t).length, genuine.length).padEnd(44)} | ${pct(impostor.filter((d) => d < t).length, impostor.length)}`);
  }
  console.log(`\nĐang dùng: khớp < ${MATCH}, cần xem lại < ${REVIEW} (đổi FACE_MATCH_THRESHOLD / FACE_REVIEW_THRESHOLD trong .env)`);
  const reviewShare = genuine.filter((d) => d >= MATCH && d < REVIEW).length + impostor.filter((d) => d >= MATCH && d < REVIEW).length;
  console.log(`Với ngưỡng hiện tại: ${pct(genuine.filter((d) => d < MATCH).length, genuine.length)} lượt đúng người được khớp ngay, ${pct(reviewShare, genuine.length + impostor.length)} lượt cần quản lý xem, ${pct(impostor.filter((d) => d < MATCH).length, impostor.length)} lượt chấm hộ lọt qua.`);
})().catch((e) => { console.error(e); process.exit(1); });
