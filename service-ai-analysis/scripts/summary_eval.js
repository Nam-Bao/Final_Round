// Đánh giá AI tóm tắt hồ sơ khám (services/patientSummary.js) trên các hồ sơ có lịch sử.
// Không ghi gì vào DB: đọc sổ y bạ bằng token quản lý, gọi thẳng hàm sinh tóm tắt (bỏ qua bước kiểm tra đồng ý và lưu tạm).
// Chỉ số:
//   - Bỏ định danh: dữ liệu gửi AI không chứa họ tên, SĐT, email, ngày sinh của khách
//   - Căn cứ: tỷ lệ ý tóm tắt trỏ đúng bản ghi có thật (ý sai căn cứ bị server bỏ)
//   - Không bịa tên: tên sản phẩm / dịch vụ / gói nhắc trong tóm tắt phải có trong sổ y bạ của hồ sơ đó
//   - Số liệu: các con số trong tóm tắt (số buổi, số nốt, ngày) phải có trong dữ liệu đầu vào
//   - Đủ ý chính: chẩn đoán gần nhất và dị ứng (nếu có) được nhắc
// Chạy: cd service-ai-analysis && EVAL_PROFILES=<id1,id2,...> node scripts/summary_eval.js  (các service đang chạy)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { toLines, generateFromInput } = require('../services/patientSummary');
const { fold } = require('../services/knowledge');

const G = process.env.GATEWAY_URL || 'http://localhost:4000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = jwt.sign({ id: '00000000-0000-4000-8000-0000000000aa', role: 'GEN_MANAGER' }, process.env.JWT_SECRET, { expiresIn: '2h' });
const headers = { Authorization: `Bearer ${token}` };
const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '-');

(async () => {
  const ids = String(process.env.EVAL_PROFILES || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) throw new Error('Thiếu EVAL_PROFILES');
  const [products, services, packages] = await Promise.all([
    axios.get(`${G}/api/commerce/products`).then((r) => r.data.data.map((p) => p.name)),
    axios.get(`${G}/api/booking/spa-services`).then((r) => r.data.data.map((s) => s.name)),
    axios.get(`${G}/api/booking/packages`).then((r) => r.data.data.map((p) => p.name)),
  ]);
  const catalog = [...products, ...services, ...packages];
  const rows = [];
  for (const id of ids) {
    const record = (await axios.get(`${G}/api/booking/patient-record/${id}`, { headers })).data.data;
    const { header, lines, refs } = toLines(record);
    const input = `Người khám: ${header}\n${lines.join('\n')}`;
    const fin = fold(input);
    // Bỏ định danh
    const phone = /(\+?84|0)(\s?\d){8,10}/.test(input);
    const email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(input);
    const name = record.profile?.full_name && input.includes(record.profile.full_name);
    const dob = record.profile?.dob && input.includes(String(record.profile.dob).slice(0, 10));
    let out;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { out = await generateFromInput(input, refs); break; } catch (e) { await sleep(e.response?.status === 429 ? 35000 : 4000); }
    }
    if (!out) { rows.push({ id, error: true }); continue; }
    const text = out.items.map((i) => i.text).join(' ');
    const ft = fold(text);
    // Tên sản phẩm / dịch vụ / gói nhắc trong tóm tắt (so cả tên đầy đủ hoặc 3 từ đầu) phải có trong dữ liệu
    const key = (n) => fold(n).split(/\s+/).slice(0, 3).join(' ');
    const mentioned = catalog.filter((n) => ft.includes(fold(n)) || (key(n).length >= 8 && ft.includes(key(n))));
    const invented = mentioned.filter((n) => !fin.includes(fold(n)) && !fin.includes(key(n)));
    // Số liệu
    const nums = [...new Set((text.match(/\d+(\/\d+)*/g) || []))];
    const badNums = nums.filter((n) => !input.includes(n));
    const latestDx = (record.events || []).find((e) => e.type === 'EXAM' && e.diagnosis)?.diagnosis;
    const dxWords = latestDx ? fold(latestDx).split(/[^a-z0-9]+/).filter((w) => w.length >= 4) : [];
    const coversDx = !latestDx || dxWords.some((w) => ft.includes(w));
    const allergy = record.safety?.allergies;
    const coversAllergy = !allergy || ft.includes(fold(allergy).split(/[,;]/)[0].trim().slice(0, 12));
    rows.push({
      id, events: record.events.length, lines: lines.length, items: out.items.length, raw: out.raw_count, dropped: out.dropped,
      leak: { phone, email, name: !!name, dob: !!dob }, mentioned, invented, nums: nums.length, badNums, coversDx, coversAllergy,
      summary: out.items.map((i) => `${i.text} [${i.refs.map((r) => r.code).join(',')}]`),
    });
    console.log(`${id.slice(0, 8)}: ${out.items.length} ý, bỏ ${out.dropped}, bịa tên ${invented.length}, số sai ${badNums.length}, lộ định danh ${phone || email || name || dob ? 'CÓ' : 'không'}`);
    await sleep(2500);
  }
  const ok = rows.filter((r) => !r.error);
  const sum = (f) => ok.reduce((s, r) => s + f(r), 0);
  const lines = [
    '', '## AI tóm tắt hồ sơ khám cho bác sĩ', '',
    `Ngày chạy: ${new Date().toISOString().slice(0, 10)}. Script: \`service-ai-analysis/scripts/summary_eval.js\`. ${ok.length} hồ sơ có lịch sử (lần khám, buổi dịch vụ, soi da...) trên bản sao dữ liệu demo.`,
    '',
    '| Chỉ số | Kết quả |', '|---|---|',
    `| Dữ liệu gửi AI lộ họ tên / SĐT / email / ngày sinh | ${ok.filter((r) => Object.values(r.leak).some(Boolean)).length}/${ok.length} hồ sơ |`,
    `| Ý tóm tắt có căn cứ hợp lệ (trỏ đúng bản ghi) | ${sum((r) => r.items)}/${sum((r) => r.raw)} (${pct(sum((r) => r.items), sum((r) => r.raw))}) |`,
    `| Tên sản phẩm / dịch vụ / gói bịa (không có trong hồ sơ) | ${sum((r) => r.invented.length)}/${sum((r) => r.mentioned.length)} tên được nhắc |`,
    `| Con số không có trong dữ liệu | ${sum((r) => r.badNums.length)}/${sum((r) => r.nums)} con số |`,
    `| Nhắc chẩn đoán gần nhất | ${ok.filter((r) => r.coversDx).length}/${ok.length} hồ sơ |`,
    `| Nhắc dị ứng (hồ sơ có dị ứng) | ${ok.filter((r) => r.coversAllergy).length}/${ok.length} hồ sơ |`,
    `| Số ý trung bình / hồ sơ | ${(sum((r) => r.items) / (ok.length || 1)).toFixed(1)} |`,
    '',
    'Ví dụ (hồ sơ đầu tiên):', '', ...(ok[0]?.summary || []).map((s) => `- ${s}`), '',
    'Giới hạn: kiểm tra bịa tên / số liệu bằng so khớp chữ; chưa đánh giá độ hữu ích với bác sĩ thật.', '',
  ];
  const doc = path.join(__dirname, '..', '..', 'docs', 'DANH-GIA-CHATBOT-RAG.md');
  const old = fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8').split('\n## AI tóm tắt hồ sơ khám cho bác sĩ')[0].trimEnd() : '# Đánh giá AI';
  fs.writeFileSync(doc, `${old}\n${lines.join('\n')}`);
  fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'reports', `summary_eval_${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(rows, null, 2));
  console.log(lines.slice(4, 14).join('\n'));
  process.exit(0);
})().catch((e) => { console.error(e.response?.data || e.message); process.exit(1); });
