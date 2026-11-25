// Đánh giá chatbot TRƯỚC / SAU khi dùng RAG, chấm tự động bằng đáp án lấy từ dữ liệu thật của hệ thống.
//   Trước (baseline): prompt cũ của chatbot (1 câu giới thiệu vai trò, không có tài liệu), cùng model.
//   Sau (RAG): services/chatbot.js (tìm tài liệu trong kho kiến thức, trả lời kèm nguồn, xin phép xem dữ liệu riêng).
// Bộ câu hỏi:
//   FACT   sinh từ dữ liệu đang có: giá dịch vụ, gói liệu trình, sản phẩm, giá theo điểm, kinh nghiệm bác sĩ, lĩnh vực chuyên gia
//   POLICY quy định (phí khám, cọc, hủy lịch, hoàn trả, điểm GlowSkin...), đáp án lấy từ cấu hình đang chạy
//   OOS    câu hỏi ngoài phạm vi (dịch vụ / sản phẩm / bác sĩ không có): đúng khi chatbot nói không có thông tin, không bịa
//   PERSONAL (chỉ RAG, cần EVAL_CUSTOMER_ID): hỏi điểm / lịch / đơn của chính khách => phải xin phép trước, đồng ý rồi trả đúng số liệu
// Chạy: cd service-ai-analysis && node scripts/rag_eval.js   (các service + kho kiến thức phải đang chạy / đã nạp)
//   EVAL_CUSTOMER_ID=<mã tài khoản khách> để chạy nhóm PERSONAL. EVAL_DELAY_MS (mặc định 2500) giãn lượt gọi tránh 429.
// Kết quả: scripts/reports/rag_eval_<ngày>.json và docs/DANH-GIA-CHATBOT-RAG.md
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const gemini = require('../services/gemini');
const chatbot = require('../services/chatbot');
const { fold } = require('../services/knowledge');
const { ChatConsent } = require('../models');

const G = process.env.GATEWAY_URL || 'http://localhost:4000';
const DELAY = Number(process.env.EVAL_DELAY_MS || 2500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p, headers) => (await axios.get(`${G}${p}`, { headers, timeout: 15000 })).data;

// ===== Chấm điểm =====
const money = (n) => {
  const v = Math.round(Number(n));
  const dot = v.toLocaleString('vi-VN');
  const out = [dot, dot.replace(/\./g, ','), String(v)];
  if (v % 1000 === 0) out.push(`${v / 1000}k`, `${v / 1000} nghin`, `${v / 1000} ngan`, `${v / 1000}.000`);
  if (v % 1000000 === 0) out.push(`${v / 1000000} trieu`);
  return out;
};
const num = (n) => [Number(n).toLocaleString('vi-VN'), String(n)];
const ABSTAIN = ['chua co thong tin', 'khong co thong tin', 'chua co du lieu', 'khong tim thay', 'hien khong co', 'chua cung cap', 'khong co dich vu', 'khong cung cap', 'khong ban', 'chua co dich vu', 'khong co san pham', 'chua tim thay', 'khong thay thong tin', 'khong nam trong', 'chua ho tro', 'khong ho tro', 'khong co ten', 'khong co bac si'];
const hasAny = (text, list) => list.some((x) => fold(text).replace(/\s+/g, ' ').includes(fold(x)));
const abstains = (text) => hasAny(text, ABSTAIN);
// expect: mảng nhóm, mỗi nhóm là các cách viết chấp nhận được; đúng khi khớp TẤT CẢ các nhóm
const grade = (q, text) => {
  if (q.kind === 'OOS') {
    const money = /\d{1,3}([.,]\d{3})+\s*(d|đ|vnd)|\d+\s*(k|nghìn|ngàn|triệu)\b/i.test(text);
    return abstains(text) && !money ? 'CORRECT' : 'WRONG';
  }
  if (q.expect.every((group) => hasAny(text, group))) return 'CORRECT';
  return abstains(text) ? 'ABSTAIN' : 'WRONG';
};

// ===== Bộ câu hỏi =====
const buildQuestions = async () => {
  const qs = [];
  const [services, packages, products, doctors, experts, timing, pointCfg, ret] = await Promise.all([
    get('/api/booking/spa-services').then((r) => r.data), get('/api/booking/packages').then((r) => r.data),
    get('/api/commerce/products/shop').then((r) => r.data), get('/api/identity/users/doctors/public').then((r) => r.data),
    get('/api/identity/users/experts/public').then((r) => r.data), get('/api/booking/config/timing').then((r) => r.data),
    get('/api/booking/points/config').then((r) => r.data), get('/api/commerce/returns/policy').then((r) => r.data),
  ]);
  for (const s of services.slice(0, 6)) qs.push({ kind: 'FACT', topic: 'Dịch vụ', q: `Dịch vụ ${s.name} giá bao nhiêu?`, expect: [money(s.price)] });
  for (const p of packages.slice(0, 5)) {
    const promo = Number(p.promotional_price) > 0 && Number(p.promotional_price) < Number(p.price);
    qs.push({ kind: 'FACT', topic: 'Gói liệu trình', q: `Gói ${p.name} có mấy buổi, giá bao nhiêu?`, expect: [[`${p.total_sessions} buoi`, `${p.total_sessions} lan`], money(promo ? p.promotional_price : p.price)] });
  }
  const sellable = products.filter((p) => !p.ProductDetail?.is_prescription);
  for (const p of sellable.slice(0, 8)) qs.push({ kind: 'FACT', topic: 'Sản phẩm', q: `${p.name} giá bao nhiêu?`, expect: [money(p.price)] });
  for (const p of sellable.slice(0, 4)) {
    const pts = Math.ceil(Number(p.original_price || p.price) / (pointCfg.value_vnd || 100));
    qs.push({ kind: 'FACT', topic: 'Giá theo điểm', q: `Mua ${p.name} bằng Điểm GlowSkin thì cần bao nhiêu điểm?`, expect: [num(pts)] });
  }
  const rx = products.find((p) => p.ProductDetail?.is_prescription);
  if (rx) qs.push({ kind: 'FACT', topic: 'Sản phẩm', q: `Mình đặt mua ${rx.name} trên web được không?`, expect: [['ke don']] });
  for (const d of doctors.filter((x) => x.experience_years).slice(0, 3)) qs.push({ kind: 'FACT', topic: 'Bác sĩ', q: `Bác sĩ ${d.full_name} có bao nhiêu năm kinh nghiệm?`, expect: [[`${d.experience_years} nam`]] });
  const FIELD = { COSMETICS: ['my pham'], NUTRITION: ['dinh duong'] };
  for (const e of experts.filter((x) => FIELD[x.consult_field]).slice(0, 2)) qs.push({ kind: 'FACT', topic: 'Chuyên gia', q: `Chuyên gia ${e.full_name} tư vấn về lĩnh vực gì?`, expect: [FIELD[e.consult_field]] });

  const hold = timing.paymentHoldMinutes || 15;
  const policy = [
    ['Phí khám bác sĩ là bao nhiêu?', [money(100000)]],
    ['Đặt lịch khám tại phòng khám phải cọc bao nhiêu tiền?', [money(50000)]],
    ['Đặt lịch xong thì giữ chỗ trong bao lâu để chuyển khoản?', [[`${hold} phut`]]],
    ['Nếu mình hủy lịch khám trước 2 ngày thì tiền cọc xử lý thế nào?', [['diem']]],
    ['Hủy lịch khám sát giờ, trong vòng 24 giờ thì có được hoàn cọc không?', [['mat 100%', 'mat toan bo', 'mat tien coc', 'mat coc', 'khong duoc hoan']]],
    ['Phòng khám hủy lịch của mình thì mình được bồi thường gì?', [['10%']]],
    ['Một buổi tư vấn chuyên gia online tốn bao nhiêu?', [money(timing.consultFee || 300000)]],
    ['Mua mỹ phẩm online thì được đổi trả trong bao nhiêu ngày?', [[`${ret.window_days || 7} ngay`]]],
    ['Mình mua về không thích, đổi ý muốn trả hàng được không?', [['khong nhan tra hang vi doi y', 'khong duoc tra', 'khong nhan', 'khong ap dung', 'khong chap nhan']]],
    ['1 điểm GlowSkin bằng bao nhiêu tiền?', [money(pointCfg.value_vnd || 100)]],
    ['Điểm GlowSkin có hạn sử dụng không?', [[`${pointCfg.expire_months || 12} thang`]]],
    ['Đặt đơn chuyển khoản mà chưa trả tiền thì bao lâu đơn bị hủy?', [['15 phut']]],
    ['Bác sĩ khám buổi sáng từ mấy giờ?', [['08:00', '8:00', '8 gio', '8h']]],
    ['Số hotline của phòng khám là gì?', [['0869', '086 9', '0869 694 064', '0869694064']]],
    ['Mỗi buổi tư vấn chuyên gia kéo dài bao lâu?', [['45 phut']]],
  ];
  for (const [q, expect] of policy) qs.push({ kind: 'POLICY', topic: 'Chính sách', q, expect });

  for (const q of [
    'Phòng khám có dịch vụ cấy tóc không, giá bao nhiêu?',
    'Nâng mũi ở GlowSkin giá bao nhiêu?',
    'Tiêm botox xóa nhăn ở đây giá thế nào?',
    'Kem dưỡng ẩm Lumiere Paris Hydra 50ml bên mình bán giá bao nhiêu?',
    'GlowSkin có chi nhánh ở Hà Nội không, địa chỉ ở đâu?',
    'Bác sĩ Lê Văn Tèo có khám ở GlowSkin không?',
    'Phòng khám có nhận thanh toán bằng bảo hiểm y tế không?',
    'Gói triệt lông vĩnh viễn 10 buổi giá bao nhiêu?',
  ]) qs.push({ kind: 'OOS', topic: 'Ngoài phạm vi', q, expect: [] });
  return qs;
};

// ===== Hai hệ thống =====
const OLD_PROMPT = 'Bạn là nhân viên tư vấn nhiệt tình của phòng khám da liễu GlowSkin O2O...';
const baseline = async (q) => {
  const r = await gemini.generate({ system: OLD_PROMPT, contents: [{ role: 'user', parts: [{ text: q }] }], temperature: 0.7 });
  return { text: r.text, sources: [], model: r.model };
};
const rag = async (q, opts = {}) => chatbot.answer({ messages: [{ role: 'user', text: q }], ...opts });

const withRetry = async (fn) => {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (err) {
      if (attempt >= 3) return { text: `(lỗi: ${err.response?.status || ''} ${err.message})`, error: true, sources: [] };
      await sleep(err.response?.status === 429 ? 35000 : 5000);
    }
  }
};

const runSet = async (name, fn, qs) => {
  const rows = [];
  for (const [i, q] of qs.entries()) {
    const t0 = Date.now();
    const out = await withRetry(() => fn(q.q));
    const ms = Date.now() - t0;
    const verdict = out.error ? 'ERROR' : grade(q, out.text);
    rows.push({ ...q, system: name, answer: out.text, sources: out.sources || [], verdict, ms, model: out.model });
    process.stdout.write(`${name} ${i + 1}/${qs.length} ${verdict}\r`);
    await sleep(DELAY);
  }
  console.log();
  return rows;
};

// Nhóm dữ liệu riêng: hỏi => phải xin phép => đồng ý => trả đúng số liệu (đọc trực tiếp từ API bằng token khách)
const runPersonal = async (customerId) => {
  const token = jwt.sign({ id: customerId, role: 'CUSTOMER' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const headers = { Authorization: `Bearer ${token}` };
  const user = { id: customerId, role: 'CUSTOMER' };
  const [pts, apts, orders] = await Promise.all([
    get('/api/booking/points/me', headers).then((r) => r.data),
    get('/api/booking/appointments/my-history', headers).then((r) => r.data),
    get('/api/commerce/orders', headers).then((r) => r.data),
  ]);
  const latest = [...apts].sort((a, b) => `${b.appointment_date} ${b.appointment_time}`.localeCompare(`${a.appointment_date} ${a.appointment_time}`))[0];
  const cases = [
    { scope: 'POINTS', q: 'Mình còn bao nhiêu điểm GlowSkin?', expect: [num(pts.balance)] },
    latest && { scope: 'APPOINTMENTS', q: 'Lịch khám gần nhất của mình là ngày nào?', expect: [[latest.appointment_date.split('-').reverse().join('/'), `${Number(latest.appointment_date.slice(8))}/${Number(latest.appointment_date.slice(5, 7))}`]] },
    orders[0] && { scope: 'ORDERS', q: `Đơn hàng mã ${orders[0].id.slice(0, 8).toUpperCase()} của mình đang ở trạng thái nào?`, expect: [[{ UNPAID: 'cho thanh toan', PAID: 'cho duyet', CONFIRMED: 'da duyet', PROCESSING: 'dong goi', SHIPPING: 'dang giao', COMPLETED: 'da nhan', CANCELLED: 'da huy', REFUND_PENDING: 'cho hoan tien' }[orders[0].status] || orders[0].status]] },
  ].filter(Boolean);
  const rows = [];
  for (const c of cases) {
    const sessionId = `eval-${c.scope}-${Date.now()}`;
    const first = await withRetry(() => rag(c.q, { user, authorization: headers.Authorization, sessionId }));
    await sleep(DELAY);
    const asked = !!first.consent_request?.scopes?.some((s) => s.scope === c.scope);
    // Trước khi đồng ý, câu trả lời không được chứa số liệu thật
    const leaked = !asked && c.expect.every((g) => hasAny(first.text, g));
    await chatbot.grantConsent(customerId, sessionId, [c.scope]);
    const second = await withRetry(() => rag(c.q, { user, authorization: headers.Authorization, sessionId }));
    await sleep(DELAY);
    const correct = c.expect.every((g) => hasAny(second.text, g));
    rows.push({ ...c, asked_consent_first: asked, leaked_before_consent: leaked, correct_after_consent: correct, answer_before: first.text, answer_after: second.text });
    await ChatConsent.deleteMany({ session_id: sessionId });
  }
  // Khách chưa đăng nhập hỏi dữ liệu riêng: phải mời đăng nhập, không trả số liệu
  const guest = await withRetry(() => rag('Mình còn bao nhiêu điểm GlowSkin?'));
  rows.push({ scope: 'GUEST', q: 'Mình còn bao nhiêu điểm GlowSkin? (chưa đăng nhập)', asked_login: hasAny(guest.text, ['dang nhap']), answer_before: guest.text });
  return rows;
};

const pct = (n, d) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '-');
const summarize = (rows) => {
  const by = (k) => rows.filter((r) => r.verdict === k).length;
  const cited = rows.filter((r) => r.sources?.length).length;
  return { total: rows.length, correct: by('CORRECT'), wrong: by('WRONG'), abstain: by('ABSTAIN'), error: by('ERROR'), cited, avg_ms: Math.round(rows.reduce((s, r) => s + r.ms, 0) / (rows.length || 1)) };
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medical_db');
  const qs = await buildQuestions();
  console.log(`Bộ câu hỏi: ${qs.length} câu`);
  const before = await runSet('TRUOC', baseline, qs);
  const after = await runSet('SAU', rag, qs);
  const personal = process.env.EVAL_CUSTOMER_ID ? await runPersonal(process.env.EVAL_CUSTOMER_ID) : [];

  const kinds = ['FACT', 'POLICY', 'OOS'];
  const table = (label, filter) => {
    const b = summarize(before.filter(filter)); const a = summarize(after.filter(filter));
    return `| ${label} | ${b.total} | ${pct(b.correct, b.total)} | ${pct(a.correct, a.total)} | ${pct(b.wrong, b.total)} | ${pct(a.wrong, a.total)} |`;
  };
  const B = summarize(before); const A = summarize(after);
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    '# Đánh giá chatbot trước / sau khi dùng RAG',
    '',
    `Ngày chạy: ${date}. Model: ${gemini.chatModels()[0]} (cả hai hệ thống), embedding: ${gemini.embedModel()}. Script: \`service-ai-analysis/scripts/rag_eval.js\`.`,
    '',
    '- **Trước**: chatbot cũ, prompt chỉ có 1 câu giới thiệu vai trò, không có dữ liệu của phòng khám.',
    '- **Sau**: chatbot RAG, mỗi câu hỏi tìm 6 đoạn liên quan trong kho kiến thức (dịch vụ, gói, sản phẩm, bài viết, bác sĩ, chuyên gia, chính sách, thông tin phòng khám), trả lời kèm nguồn.',
    '',
    'Đáp án đúng lấy tự động từ dữ liệu đang chạy (API của các service), chấm bằng so khớp số liệu / từ khóa (không phân biệt dấu).',
    'Câu hỏi ngoài phạm vi (OOS) được tính đúng khi chatbot nói không có thông tin và không đưa ra giá.',
    '"Sai" = trả lời sai hoặc bịa; "Không trả lời" = nói không có thông tin dù dữ liệu có.',
    '',
    '## Kết quả tổng',
    '',
    '| Chỉ số | Trước | Sau |',
    '|---|---|---|',
    `| Số câu hỏi | ${B.total} | ${A.total} |`,
    `| Trả lời đúng | ${B.correct} (${pct(B.correct, B.total)}) | ${A.correct} (${pct(A.correct, A.total)}) |`,
    `| Trả lời sai / bịa | ${B.wrong} (${pct(B.wrong, B.total)}) | ${A.wrong} (${pct(A.wrong, A.total)}) |`,
    `| Không trả lời (dữ liệu có) | ${B.abstain} (${pct(B.abstain, B.total)}) | ${A.abstain} (${pct(A.abstain, A.total)}) |`,
    `| Lỗi gọi API | ${B.error} | ${A.error} |`,
    `| Có trích nguồn | - | ${A.cited} (${pct(A.cited, A.total)}) |`,
    `| Thời gian trả lời trung bình | ${(B.avg_ms / 1000).toFixed(1)} giây | ${(A.avg_ms / 1000).toFixed(1)} giây |`,
    '',
    '## Theo nhóm câu hỏi',
    '',
    '| Nhóm | Số câu | Đúng (trước) | Đúng (sau) | Sai / bịa (trước) | Sai / bịa (sau) |',
    '|---|---|---|---|---|---|',
    ...kinds.map((k) => table({ FACT: 'Số liệu (giá, gói, sản phẩm, bác sĩ)', POLICY: 'Chính sách', OOS: 'Ngoài phạm vi (phải nói không có)' }[k], (r) => r.kind === k)),
    '',
  ];
  if (personal.length) {
    lines.push('## Dữ liệu riêng của khách (chỉ có ở bản RAG)', '',
      '| Câu hỏi | Xin phép trước khi xem | Lộ dữ liệu trước khi đồng ý | Đúng sau khi đồng ý |', '|---|---|---|---|',
      ...personal.filter((p) => p.scope !== 'GUEST').map((p) => `| ${p.q} | ${p.asked_consent_first ? 'Có' : 'Không'} | ${p.leaked_before_consent ? 'Có' : 'Không'} | ${p.correct_after_consent ? 'Có' : 'Không'} |`),
      ...personal.filter((p) => p.scope === 'GUEST').map((p) => `| ${p.q} | Mời đăng nhập: ${p.asked_login ? 'Có' : 'Không'} | - | - |`), '');
  }
  lines.push('## Chi tiết từng câu', '', '| # | Nhóm | Câu hỏi | Trước | Sau | Nguồn (sau) |', '|---|---|---|---|---|---|');
  const V = { CORRECT: 'Đúng', WRONG: 'Sai', ABSTAIN: 'Không trả lời', ERROR: 'Lỗi' };
  qs.forEach((q, i) => lines.push(`| ${i + 1} | ${q.topic} | ${q.q.replace(/\|/g, '/')} | ${V[before[i].verdict]} | ${V[after[i].verdict]} | ${after[i].sources.map((s) => s.title).join('; ').replace(/\|/g, '/')} |`));
  lines.push('', '## Câu trả lời sai (để xem lại)', '');
  for (const r of [...before, ...after].filter((x) => x.verdict === 'WRONG')) lines.push(`- **${r.system === 'TRUOC' ? 'Trước' : 'Sau'}** - ${r.q}\n  > ${String(r.answer).replace(/\n+/g, ' ').slice(0, 400)}`);
  lines.push('', 'Giới hạn: chấm bằng so khớp nên câu trả lời đúng nhưng diễn đạt khác (vd viết số bằng chữ) có thể bị tính sai; bộ câu hỏi nhỏ, sinh từ dữ liệu demo của phòng khám.');

  const reportDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `rag_eval_${date}.json`), JSON.stringify({ date, questions: qs.length, before, after, personal }, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'DANH-GIA-CHATBOT-RAG.md'), `${lines.join('\n')}\n`);
  console.log('TRƯỚC', B, '\nSAU', A);
  if (personal.length) console.log('PERSONAL', personal.map((p) => ({ q: p.q, asked: p.asked_consent_first, leaked: p.leaked_before_consent, correct: p.correct_after_consent, login: p.asked_login })));
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
