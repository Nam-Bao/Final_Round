#!/usr/bin/env node
/*
 * export_training.js - xuất bộ dữ liệu huấn luyện (định dạng COCO) từ các lượt soi bác sĩ đã xác nhận và ĐỦ NHÃN
 * (xem services/training.js: khách đồng ý, không xác nhận quá nhanh, không còn nốt bỏ sót chưa khoanh).
 *
 *   node scripts/export_training.js              # xuất các lượt đang chờ (training.status = QUEUED)
 *   node scripts/export_training.js --all        # xuất lại toàn bộ (cả lượt đã xuất trước đó) - dùng khi dựng lại bộ dữ liệu
 *   node scripts/export_training.js --dry        # chỉ đếm, không tải ảnh, không ghi DB
 *   node scripts/export_training.js --out ./exports/lan-1
 *
 * Bỏ thông tin định danh: LÀM MỜ VÙNG MẮT (services/eyeBlur.js; không tìm thấy mắt => không xuất ảnh đó),
 * ảnh được mã hoá lại (xoá EXIF: thiết bị, vị trí, thời gian chụp), đặt tên ngẫu nhiên,
 * file COCO không chứa mã khách / tên / số điện thoại. Bảng đối chiếu tên file <-> lượt soi chỉ nằm trong DB (training.export_file).
 * Khung tổn thương nằm phần lớn (> 50%) trong vùng đã làm mờ bị bỏ (model không nên học trên vùng mờ).
 * Ảnh là bản đã gửi model (giới hạn 1280px, xoay theo EXIF) nên toạ độ khung khớp với image_size đã lưu.
 * Chia tập theo KHÁCH (mọi ảnh của 1 người cùng 1 tập): ~20% làm tập test của phòng khám, còn lại train.
 * Khách rút lại đồng ý sau khi đã xuất => removed.json liệt kê tên file cần xoá khỏi các bộ dữ liệu đã xuất trước đó.
 * Thư mục exports/ không đưa lên git.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const sharp = require('sharp');
const mongoose = require('mongoose');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch { /* tuỳ chọn */ }
const { AiAnalysis } = require('../models');
const training = require('../services/training');
const { blurEyes } = require('../services/eyeBlur');

// Tỉ lệ diện tích khung b nằm trong vùng r
const overlap = (b, r) => {
  const w = Math.max(0, Math.min(b.left + b.width, r.left + r.width) - Math.max(b.left, r.left));
  const h = Math.max(0, Math.min(b.top + b.height, r.top + r.height) - Math.max(b.top, r.top));
  return (w * h) / Math.max(1, b.width * b.height);
};

const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const stamp = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'exports', `training-${stamp}`)));
const BATCH = path.basename(OUT);

const optimizeUrl = (url) => (url.includes('res.cloudinary.com') && url.includes('/upload/') ? url.replace('/upload/', '/upload/a_exif,c_limit,w_1280,f_jpg,q_auto/') : url);
const imagesOf = (a) => (a.images?.length ? a.images : [{ url: a.image_url, angle: 'front', image_size: a.parsed_metrics?.image_size }]);
const splitOf = (customerId) => (crypto.createHash('sha256').update(String(customerId)).digest()[0] % 5 === 0 ? 'test' : 'train');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db');
  const statuses = has('all') ? ['QUEUED', 'EXPORTED'] : ['QUEUED'];
  const docs = await AiAnalysis.find({ status: 'success', 'training.status': { $in: statuses } }).lean();
  const removed = await AiAnalysis.find({ 'training.status': 'REMOVED', 'training.export_file': { $nin: [null, ''] } }, { 'training.export_file': 1 }).lean();
  console.log(`Lượt soi đủ nhãn cần xuất: ${docs.length} | đã xuất nhưng khách rút lại đồng ý: ${removed.length}`);
  if (has('dry') || (!docs.length && !removed.length)) { await mongoose.disconnect(); return; }

  const coco = Object.fromEntries(['train', 'test'].map((s) => [s, { info: { description: 'GlowSkin - dữ liệu bác sĩ xác nhận', version: BATCH }, images: [], annotations: [], categories: training.CATEGORIES.map(({ id, name, supercategory }) => ({ id, name, supercategory })) }]));
  const catId = Object.fromEntries(training.CATEGORIES.map((c) => [c.key, c.id]));
  let annId = 1; let imgId = 1; let done = 0; let failed = 0; let noEyes = 0; let droppedBoxes = 0;
  for (const split of ['train', 'test']) fs.mkdirSync(path.join(OUT, split), { recursive: true });

  for (const a of docs) {
    const split = splitOf(a.customer_id);
    const labels = training.labelsOf(a);
    const files = [];
    try {
      for (const [k, im] of imagesOf(a).entries()) {
        const res = await axios.get(optimizeUrl(im.url), { responseType: 'arraybuffer', timeout: 30000 });
        const blurred = await blurEyes(Buffer.from(res.data)); // làm mờ mắt + mã hoá lại (bỏ EXIF)
        if (!blurred) { noEyes++; continue; } // không tìm thấy mắt => không xuất ảnh chưa làm mờ
        const { data, info } = await sharp(blurred.buffer).toBuffer({ resolveWithObject: true });
        const name = `${crypto.randomUUID()}.jpg`;
        fs.writeFileSync(path.join(OUT, split, name), data);
        const sx = info.width / (im.image_size?.width || info.width); const sy = info.height / (im.image_size?.height || info.height);
        const id = imgId++;
        coco[split].images.push({ id, file_name: name, width: info.width, height: info.height });
        labels.filter((l) => l.image_index === k && catId[l.raw_class]).forEach((l) => {
          const b = l.bounding_box;
          const scaled = { left: b.left * sx, top: b.top * sy, width: b.width * sx, height: b.height * sy };
          if (blurred.regions.some((r) => overlap(scaled, r) > 0.5)) { droppedBoxes++; return; }
          const bbox = [b.left * sx, b.top * sy, b.width * sx, b.height * sy].map((v) => Math.round(v * 10) / 10);
          coco[split].annotations.push({ id: annId++, image_id: id, category_id: catId[l.raw_class], bbox, area: Math.round(bbox[2] * bbox[3]), iscrowd: 0 });
        });
        files.push(name);
      }
      if (!files.length) {
        await AiAnalysis.updateOne({ _id: a._id }, { $set: { 'training.status': 'NOT_ELIGIBLE', 'training.reason': 'Không tìm thấy mắt để làm mờ (ảnh nghiêng / chụp quá gần)', 'training.updated_at': new Date() } });
        continue;
      }
      await AiAnalysis.updateOne({ _id: a._id }, { $set: { 'training.status': 'EXPORTED', 'training.export_file': files.join(','), 'training.export_batch': BATCH, 'training.exported_at': new Date() } });
      done++;
    } catch (e) {
      failed++;
      console.error(`Bỏ qua 1 lượt soi (lỗi tải ảnh): ${e.message}`);
    }
  }
  for (const split of ['train', 'test']) fs.writeFileSync(path.join(OUT, split, '_annotations.coco.json'), JSON.stringify(coco[split], null, 1));
  fs.writeFileSync(path.join(OUT, 'removed.json'), JSON.stringify({ note: 'Khách đã rút lại đồng ý: xoá các file này khỏi mọi bộ dữ liệu đã xuất trước đó', files: removed.flatMap((r) => String(r.training.export_file).split(',')) }, null, 1));
  console.log(`Đã xuất ${done} lượt soi (${coco.train.images.length} ảnh train, ${coco.test.images.length} ảnh test, ${annId - 1} khung) vào ${OUT}`
    + `${noEyes ? ` | ${noEyes} ảnh không tìm thấy mắt nên không xuất` : ''}${droppedBoxes ? ` | bỏ ${droppedBoxes} khung nằm trong vùng làm mờ` : ''}${failed ? ` | lỗi ${failed}` : ''}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
