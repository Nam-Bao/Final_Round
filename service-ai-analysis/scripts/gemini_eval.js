#!/usr/bin/env node
/*
 * gemini_eval.js - hỏi Gemini từng ảnh của tập có nhãn: ảnh có 4 nhóm vấn đề da của app không (mức cả ảnh).
 * Để so sánh với model Roboflow (scripts/evaluate-app.js --gemini <file>).
 *
 *   node scripts/gemini_eval.js --split test [--model gemini-3.6-flash] [--limit 20] [--concurrency 2]
 *
 * Kết quả ghi từng dòng vào .cache/gemini/<model>/<split>.jsonl; chạy lại sẽ bỏ qua ảnh đã có (dừng giữa chừng không mất).
 * Cần GEMINI_API_KEY trong .env. Ảnh thu về tối đa 1280px giống app.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const SPLIT = arg('split', 'test');
const MODEL = arg('model', process.env.VISION_MODEL || 'gemini-3.6-flash');
const LIMIT = Number(arg('limit', 0));
const CONCURRENCY = Number(arg('concurrency', 2));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.cache', 'gemini', MODEL);
const OUT = path.join(OUT_DIR, `${SPLIT}.jsonl`);

const PROMPT = `Bạn là chuyên gia da liễu đánh giá ảnh da mặt (có thể chỉ là 1 phần khuôn mặt, chụp cận).
Với MỖI nhóm sau, cho biết ảnh có tổn thương thuộc nhóm đó không, ước lượng số nốt nhìn thấy và độ chắc chắn (0-100):
- inflammatory (mụn viêm): sẩn đỏ (papule), mụn mủ (pustule), mụn bọc / nang (nodule, cyst).
- comedone (mụn không viêm): mụn đầu đen (blackhead), mụn đầu trắng / mụn ẩn (whitehead).
- pih (thâm sau mụn): đốm thâm nâu / đỏ phẳng còn lại sau mụn, không sưng.
- pigment_region (nám / tàn nhang): mảng nám (melasma) hoặc chấm tàn nhang (freckles).
Chỉ trả lời theo những gì nhìn thấy trong ảnh. Không chắc thì present = false và confidence thấp.`;

const GROUP = {
  type: SchemaType.OBJECT,
  properties: { present: { type: SchemaType.BOOLEAN }, count: { type: SchemaType.INTEGER }, confidence: { type: SchemaType.INTEGER } },
  required: ['present', 'count', 'confidence'],
};
const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: { is_face_skin: { type: SchemaType.BOOLEAN }, inflammatory: GROUP, comedone: GROUP, pih: GROUP, pigment_region: GROUP },
  required: ['is_face_skin', 'inflammatory', 'comedone', 'pih', 'pigment_region'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('Thiếu GEMINI_API_KEY');
  const coco = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', SPLIT, `${SPLIT}.json`), 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).file) : []);
  let todo = coco.images.filter((im) => !done.has(im.file_name));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  console.log(`${MODEL} | ${SPLIT}: đã có ${done.size}, cần chạy ${todo.length}`);
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
    model: MODEL, systemInstruction: PROMPT,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0, maxOutputTokens: 2048 },
  });

  let next = 0; let ok = 0; let failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const im = todo[next++];
      const buf = await sharp(path.join(ROOT, 'data', SPLIT, im.file_name)).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const t = Date.now();
          const res = await model.generateContent([{ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } }, { text: 'Đánh giá ảnh này.' }]);
          const u = res.response.usageMetadata || {};
          fs.appendFileSync(OUT, `${JSON.stringify({ file: im.file_name, result: JSON.parse(res.response.text()), ms: Date.now() - t, tokens: { in: u.promptTokenCount, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } })}\n`);
          ok += 1;
          break;
        } catch (e) {
          const wait = e.status === 429 || e.status === 503 || e.status === 500 ? 15000 * (attempt + 1) : 0;
          if (!wait || attempt === 5) { failed += 1; console.log(`LỖI ${im.file_name}: ${e.status || ''} ${String(e.message).slice(0, 160)}`); break; }
          await sleep(wait);
        }
      }
      if ((ok + failed) % 10 === 0) console.log(`  ${ok + failed}/${todo.length} (lỗi ${failed})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Xong: thành công ${ok}, lỗi ${failed}. File: ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
