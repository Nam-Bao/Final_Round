// Đánh giá AI rà soát đơn kê TRƯỚC / SAU khi dùng RAG (tìm quy tắc an toàn của phòng khám trong kho kiến thức).
// Ca kiểm thử: mục kê có hoạt chất / thủ thuật thuộc một quy tắc đang áp dụng nhưng viết bằng tên khác (tên thương mại,
// hoạt chất cùng nhóm, tên thủ thuật khác) nên bảng quy tắc so từ khóa KHÔNG bắt được (rule_warnings rỗng),
// cùng 2 ca an toàn để đo báo động giả.
//   Phát hiện: có cảnh báo mức Thận trọng / Chống chỉ định trên đúng mục.
//   Trích đúng quy tắc (chỉ bản RAG): cảnh báo có trích quy tắc khớp tình trạng + đối tượng mong đợi.
// Chạy: cd service-ai-analysis && node scripts/safety_rag_eval.js  (kho SAFETY phải đã nạp). Kết quả ghi thêm vào docs/DANH-GIA-CHATBOT-RAG.md
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { reviewPrescription } = require('../services/safetyReview');
const { fold } = require('../services/knowledge');

const DELAY = Number(process.env.EVAL_DELAY_MS || 4000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const product = (name, ingredients) => ({ type: 'Sản phẩm', name, quantity: 1, ingredients });
const service = (name, detail) => ({ type: 'Dịch vụ', name, detail, procedures: [] });

const CASES = [
  { flag: 'Đang mang thai', item: product('Serum Retinal 0.1%', 'Aqua, Glycerin, Retinal, Hydroxypinacolone Retinoate, Niacinamide'), expect: ['mang thai', 'retinol'] },
  { flag: 'Đang có kế hoạch mang thai', item: product('Kem Aklief 0.005%', 'Trifarotene 0.005%, Allantoin, Cyclomethicone'), expect: ['ke hoach mang thai', 'retinoid'] },
  { flag: 'Đang mang thai', item: service('Lăn kim tế bào gốc', 'Dùng dermaroller 0.5mm tạo vi tổn thương rồi thoa tế bào gốc'), expect: ['mang thai', 'vi kim'] },
  { flag: 'Đang dùng hoặc vừa ngưng isotretinoin uống', item: service('Thay da sinh học Jessner', 'Bôi dung dịch Jessner (salicylic, lactic, resorcinol) bong lớp sừng'), expect: ['isotretinoin', 'peel'] },
  { flag: 'Đang dùng thuốc chống đông / có rối loạn đông máu', item: service('Tiêm vi điểm HA căng bóng', 'Tiêm vi điểm acid hyaluronic vào lớp trung bì toàn mặt'), expect: ['chong dong', 'meso'] },
  { flag: 'Có máy tạo nhịp tim hoặc thiết bị điện cấy ghép', item: service('Đẩy tinh chất bằng dòng galvanic', 'Dùng máy dòng điện một chiều galvanic đẩy vitamin C vào da'), expect: ['may tao nhip', 'dien di'] },
  { flag: 'Cơ địa sẹo lồi', item: service('Dermapen trị sẹo rỗ', 'Máy bút kim Dermapen độ sâu 1.5mm'), expect: ['seo loi', 'vi kim'] },
  { flag: 'Đang cho con bú', item: service('Thermage nâng cơ', 'Sóng radio cao tần đơn cực làm săn chắc da'), expect: ['cho con bu', 'song rf'] },
  { flag: 'Đang mang thai', item: product('Toner Betaine Salicylate 4%', 'Water, Betaine Salicylate, Butylene Glycol, Panthenol'), expect: ['mang thai', 'salicylic'] },
  { flag: 'Đang nhiễm trùng da / herpes ở vùng điều trị', item: service('Tiêm Profhilo trẻ hóa', 'Tiêm hyaluronic acid vào 5 điểm mỗi bên mặt'), expect: ['nhiem trung', 'meso'] },
  { flag: 'Đang mang thai', item: product('Kem chống nắng khoáng Anessa Mild', 'Zinc Oxide, Titanium Dioxide, Water, Glycerin'), safe: true },
  { flag: null, item: product('Sữa rửa mặt Cetaphil Gentle', 'Water, Glycerin, Cetearyl Alcohol, Panthenol'), safe: true },
];

const run = async (c, useRag) => {
  const input = {
    patient: { screening: c.flag ? [c.flag] : [], screened_today: true, allergies: 'Không ghi nhận', diagnosis: 'Mụn trứng cá, thâm sau mụn' },
    prescription: [c.item], rule_warnings: [],
  };
  for (let attempt = 0; ; attempt++) {
    try { return await reviewPrescription(input, { useRag }); } catch (err) {
      if (attempt >= 2) return { error: err.message, warnings: [] };
      await sleep(30000);
    }
  }
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db');
  const rows = [];
  for (const [i, c] of CASES.entries()) {
    const out = {};
    for (const [label, useRag] of [['before', false], ['after', true]]) {
      const r = await run(c, useRag);
      const serious = (r.warnings || []).filter((w) => ['CAUTION', 'CONTRAINDICATED'].includes(w.severity));
      const cited = serious.flatMap((w) => w.citations || []);
      out[label] = {
        error: r.error, detected: serious.length > 0,
        cited_right: !c.safe && cited.some((x) => c.expect.every((k) => fold(x.title).includes(k))),
        citations: cited.map((x) => x.title), warnings: (r.warnings || []).map((w) => `${w.severity}: ${w.message}`),
      };
      await sleep(DELAY);
    }
    rows.push({ case: i + 1, flag: c.flag, item: c.item.name, safe: !!c.safe, ...out });
    console.log(`${i + 1}/${CASES.length} ${c.item.name}: trước ${out.before.detected ? 'báo' : '-'} | sau ${out.after.detected ? 'báo' : '-'}${out.after.cited_right ? ' (trích đúng)' : ''}`);
  }
  const risky = rows.filter((r) => !r.safe); const safe = rows.filter((r) => r.safe);
  const n = (list, f) => list.filter(f).length;
  const lines = [
    '', '## AI rà soát đơn kê: trước / sau khi dùng RAG', '',
    `Ngày chạy: ${new Date().toISOString().slice(0, 10)}. Script: \`service-ai-analysis/scripts/safety_rag_eval.js\`. Model: ${process.env.SAFETY_MODEL || 'gemini-3.6-flash'}.`,
    '',
    `${risky.length} ca có rủi ro: mục kê thuộc một quy tắc an toàn đang áp dụng nhưng viết bằng tên khác (tên thương mại, hoạt chất cùng nhóm, tên thủ thuật khác) nên bảng quy tắc so từ khóa không bắt được. ${safe.length} ca an toàn để đo báo động giả.`,
    '- **Trước**: AI chỉ dựa vào dữ liệu ca khám và kiến thức chung.',
    '- **Sau**: hệ thống tìm 8 quy tắc liên quan trong kho kiến thức (38 quy tắc, mỗi quy tắc có nguồn y khoa), AI phải ghi mã quy tắc làm căn cứ.',
    '',
    '| Chỉ số | Trước | Sau |', '|---|---|---|',
    `| Phát hiện rủi ro (cảnh báo Thận trọng / Chống chỉ định đúng mục) | ${n(risky, (r) => r.before.detected)}/${risky.length} | ${n(risky, (r) => r.after.detected)}/${risky.length} |`,
    `| Cảnh báo có trích đúng quy tắc + nguồn y khoa | 0/${risky.length} | ${n(risky, (r) => r.after.cited_right)}/${risky.length} |`,
    `| Báo động giả ở ca an toàn | ${n(safe, (r) => r.before.detected)}/${safe.length} | ${n(safe, (r) => r.after.detected)}/${safe.length} |`,
    '',
    '| # | Tình trạng khách | Mục kê | Trước | Sau | Quy tắc được trích (sau) |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.case} | ${r.flag || 'Không có'} | ${r.item} | ${r.before.error ? 'Lỗi' : r.before.detected ? 'Cảnh báo' : 'Không'} | ${r.after.error ? 'Lỗi' : r.after.detected ? 'Cảnh báo' : 'Không'} | ${r.after.citations.join('; ') || '-'} |`),
    '',
  ];
  const doc = path.join(__dirname, '..', '..', 'docs', 'DANH-GIA-CHATBOT-RAG.md');
  const old = fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8').split('\n## AI rà soát đơn kê')[0].trimEnd() : '# Đánh giá RAG';
  fs.writeFileSync(doc, `${old}\n${lines.join('\n')}`);
  fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'reports', `safety_rag_eval_${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(rows, null, 2));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
