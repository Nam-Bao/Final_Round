// Kho kiến thức cho RAG (Retrieval-Augmented Generation).
// 1. Thu thập: gọi API công khai của các service (dịch vụ, gói, sản phẩm, bài viết, bác sĩ, chuyên gia, thông tin phòng khám)
//    + knowledge/chinh-sach.md (điền số liệu đang áp dụng) cho chatbot; quy tắc an toàn đang áp dụng (API nội bộ booking)
//    cho AI rà soát đơn kê.
// 2. Chia đoạn, tạo embedding Gemini. Chỉ tạo lại embedding cho đoạn mới / đổi nội dung (so hash), xóa đoạn không còn.
// 3. Tìm kiếm: cosine giữa vector câu hỏi và vector đoạn, cộng điểm khớp từ khóa (không dấu) để bắt đúng tên riêng.
// Nạp lại khi service khởi động, định kỳ KNOWLEDGE_REFRESH_MINUTES (mặc định 30) và khi quản lý gọi POST /api/ai/knowledge/reindex.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { KnowledgeChunk } = require('../models');
const gemini = require('./gemini');

const GATEWAY = () => process.env.GATEWAY_URL || 'http://localhost:4000';
const sysToken = () => jwt.sign({ sys: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
const get = async (p, opts = {}) => (await axios.get(`${GATEWAY()}${p}`, { timeout: 15000, ...opts })).data;
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const list = (a) => (Array.isArray(a) ? a.map((x) => (typeof x === 'string' ? x : x?.name || x?.title || x?.step || JSON.stringify(x))).filter(Boolean).join('; ') : '');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Chia văn bản dài thành đoạn ~MAX ký tự theo đoạn văn (bài viết, mô tả sản phẩm)
const MAX = 900;
const split = (text) => {
  const paras = String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur.length + p.length) > MAX) { out.push(cur); cur = ''; }
    if (p.length > MAX) {
      for (let i = 0; i < p.length; i += MAX) out.push(p.slice(i, i + MAX));
    } else cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out.length ? out : [String(text).slice(0, MAX)];
};

// ===== Nguồn cho chatbot =====
const durationText = (min) => {
  const h = Math.floor(min / 60); const m = min % 60;
  return [h ? `${h} giờ` : '', m ? `${m} phút` : ''].filter(Boolean).join(' ') || '0 phút';
};

const policyDocs = async () => {
  const [timing, pointCfg, ret] = await Promise.all([
    get('/api/booking/config/timing').then((r) => r.data).catch(() => ({})),
    get('/api/booking/points/config').then((r) => r.data).catch(() => ({})),
    get('/api/commerce/returns/policy').then((r) => r.data).catch(() => ({})),
  ]);
  const value = pointCfg.value_vnd || 100;
  const fill = {
    EXAM_FEE: vnd(100000), OFFLINE_DEPOSIT: vnd(50000),
    HOLD: durationText(timing.paymentHoldMinutes || 15), RESCHEDULE: durationText(timing.rescheduleMinMinutes || 1440),
    CONSULT_FEE: vnd(timing.consultFee || 300000), CONSULT_RESULT: durationText(timing.consultResultDeadlineMinutes || 1440),
    POINT_RATE: `1 điểm = ${vnd(value)}`, POINT_EXPIRE: String(pointCfg.expire_months || 12), CLINIC_BONUS: '10%',
    RETURN_DAYS: String(ret.window_days || 7), RETURN_MAX_IMAGES: String(ret.max_images || 5),
    RETURN_REASONS: Object.values(ret.reasons || {}).join('; ') || 'hàng hư hỏng, giao sai, sản phẩm lỗi, hết hạn',
    SALE_RULE: ret.sale_rule || 'Hàng khuyến mãi không hoàn tiền, nếu lỗi chỉ đổi đúng sản phẩm đó',
    SALE_OUT_OF_STOCK_RULE: ret.sale_out_of_stock_rule || '',
    AI_DAILY_LIMIT: String(Number(process.env.AI_USER_DAILY_LIMIT || 3)),
  };
  const md = fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'chinh-sach.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return md.split(/^## /m).map((s) => s.trim()).filter(Boolean).map((sec) => {
    const [title, ...rest] = sec.split('\n');
    // Bỏ số thứ tự quy định ("1.2.") để model không nhầm với số trích dẫn [n]
    const text = rest.join('\n').replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k] ?? '').replace(/^\d+\.\d+\.\s*/gm, '- ').trim();
    return { source_type: 'POLICY', source_id: title.split('.')[0], title: `Chính sách mục ${title.trim()}`, url: '/chinh-sach', text };
  });
};

const clinicDocs = async () => {
  const info = await get('/api/media/pages/clinic-info').then((r) => r.data || {}).catch(() => ({}));
  const pick = (...keys) => keys.map((k) => info[k]).find((v) => v);
  const lines = [
    'Phòng khám Da liễu GlowSkin (mô hình O2O: đặt lịch, sàng lọc da AI, tư vấn chuyên gia và mua mỹ phẩm trực tuyến, khám và làm dịch vụ tại phòng khám).',
    `Hotline: ${pick('hotline', 'phone') || '0869 694 064'}. Giờ làm việc: ${pick('working_hours', 'opening_hours') || '08:00 - 17:00 hàng ngày'}.`,
    `Địa chỉ: ${pick('address') || process.env.CLINIC_ADDRESS || 'xem trang Liên hệ'}.`,
    pick('email') ? `Email: ${pick('email')}.` : '',
    'Giờ khám bác sĩ: sáng 08:00 - 11:30, chiều 13:00 - 16:30. Tư vấn chuyên gia qua video: 08:00 - 21:00 tùy lịch chuyên gia.',
    'Khách có thể chat với nhân viên CSKH trên website (cần đăng nhập, 08:00 - 17:00) hoặc gọi hotline.',
  ].filter(Boolean);
  return [{ source_type: 'CLINIC', source_id: 'info', title: 'Thông tin phòng khám', url: '/contact', text: lines.join('\n') }];
};

const serviceDocs = async () => {
  const rows = (await get('/api/booking/spa-services')).data || [];
  return rows.map((s) => ({
    source_type: 'SERVICE', source_id: s.id, title: `Dịch vụ: ${s.name}`, url: `/services/${s.id}`,
    text: [
      `Dịch vụ ${s.name}. Giá ${vnd(s.price)}${s.duration_minutes ? `, thời gian khoảng ${s.duration_minutes} phút` : ''}.`,
      s.description && `Mô tả: ${clean(s.description)}`,
      list(s.includes) && `Bao gồm: ${list(s.includes)}`,
      list(s.procedure_steps) && `Quy trình: ${list(s.procedure_steps)}`,
      list(s.suitable_for) && `Phù hợp với: ${list(s.suitable_for)}`,
      list(s.aftercare) && `Chăm sóc sau: ${list(s.aftercare)}`,
      'Dịch vụ được làm sau khi bác sĩ khám và chỉ định; khách đặt lịch khám trước.',
    ].filter(Boolean).join('\n'),
  }));
};

const packageDocs = async () => {
  const rows = (await get('/api/booking/packages')).data || [];
  return rows.map((p) => {
    const promo = Number(p.promotional_price) > 0 && Number(p.promotional_price) < Number(p.price);
    return {
      source_type: 'PACKAGE', source_id: p.id, title: `Gói liệu trình: ${p.name}`, url: '/goi-lieu-trinh',
      text: [
        `Gói liệu trình ${p.name}: ${p.total_sessions} buổi, mỗi buổi cách nhau ít nhất ${p.interval_days} ngày, dùng trong ${p.validity_days} ngày kể từ ngày mua.`,
        promo ? `Giá ${vnd(p.price)}, giá ưu đãi ${vnd(p.promotional_price)}.` : `Giá ${vnd(p.price)}.`,
        p.description && `Mô tả: ${clean(p.description)}`,
        list(p.included_products) && `Sản phẩm kèm theo: ${list(p.included_products)}`,
        'Gói liệu trình chỉ bán sau khi bác sĩ khám và chỉ định.',
      ].filter(Boolean).join('\n'),
    };
  });
};

const productDocs = async () => {
  const value = (await get('/api/booking/points/config').then((r) => r.data).catch(() => ({}))).value_vnd || 100;
  const rows = (await get('/api/commerce/products/shop')).data || [];
  const docs = [];
  for (const p of rows) {
    const slug = p.ProductDetail?.slug;
    const d = slug ? (await get(`/api/commerce/products/shop/${slug}`).then((r) => r.data?.ProductDetail).catch(() => null)) || p.ProductDetail : p.ProductDetail || {};
    const listPrice = Number(p.original_price || p.price);
    const head = [
      `Sản phẩm ${p.name}${d?.brand ? ` (thương hiệu ${d.brand}${d.origin ? `, xuất xứ ${d.origin}` : ''}${d.capacity ? `, dung tích ${d.capacity}` : ''})` : ''}.`,
      p.Category?.name && `Danh mục: ${p.Category.name}.`,
      d?.is_prescription
        ? 'Đây là thuốc kê đơn: không bán trên website, chỉ bác sĩ kê sau khi khám và bán tại quầy theo đơn.'
        : p.original_price
          ? `Giá niêm yết ${vnd(listPrice)}, đang giảm ${p.discount_percent || ''}% còn ${vnd(p.price)}${p.sale_end ? ` đến ${new Date(p.sale_end).toLocaleDateString('vi-VN')}` : ''}. Trả bằng Điểm GlowSkin: ${Math.ceil(listPrice / value).toLocaleString('vi-VN')} điểm (tính theo giá niêm yết).`
          : `Giá ${vnd(listPrice)}. Trả bằng Điểm GlowSkin: ${Math.ceil(listPrice / value).toLocaleString('vi-VN')} điểm.`,
      p.stock_quantity > 0 ? 'Còn hàng.' : 'Tạm hết hàng.',
      d?.skin_types?.length && `Loại da phù hợp: ${d.skin_types.join(', ')}.`,
      d?.concerns?.length && `Vấn đề da: ${d.concerns.join(', ')}.`,
    ].filter(Boolean).join(' ');
    const body = [
      d?.short_description && clean(d.short_description),
      d?.benefits && `Công dụng: ${clean(d.benefits)}`,
      d?.usage && `Cách dùng: ${clean(d.usage)}`,
      d?.warnings && `Lưu ý: ${clean(d.warnings)}`,
      d?.ingredients && `Thành phần: ${clean(d.ingredients)}`,
      d?.description && `Mô tả: ${clean(d.description)}`,
    ].filter(Boolean).join('\n\n');
    // Đoạn đầu luôn có tên, giá, loại da; các đoạn sau lặp lại tên sản phẩm để tìm được theo tên
    split(body || ' ').forEach((part, i) => docs.push({
      source_type: 'PRODUCT', source_id: p.id, title: `Sản phẩm: ${p.name}`, url: slug ? `/shops/${slug}` : '/shops',
      text: i === 0 ? `${head}\n${part}`.trim() : `Sản phẩm ${p.name} (tiếp): ${part}`,
    }));
  }
  return docs;
};

const articleDocs = async () => {
  const first = await get('/api/media/news', { params: { page: 1 } });
  const pages = first.pagination?.totalPages || 1;
  const rows = [...(first.data || [])];
  for (let page = 2; page <= Math.min(pages, 30); page++) rows.push(...((await get('/api/media/news', { params: { page } })).data || []));
  const docs = [];
  for (const a of rows) {
    const full = await get(`/api/media/news/${a.slug}`).then((r) => r.data).catch(() => a);
    const author = full.author_name ? ` Tác giả: ${full.author_title ? `${full.author_title} ` : ''}${full.author_name}.` : '';
    split(clean(full.content || full.summary || '')).forEach((part, i) => docs.push({
      source_type: 'ARTICLE', source_id: a.id, title: `Bài viết: ${a.title}`, url: `/news/${a.slug}`,
      text: `${i === 0 ? `${a.title}.${author}${full.summary ? ` ${clean(full.summary)}` : ''}\n` : `${a.title} (tiếp):\n`}${part}`,
    }));
  }
  return docs;
};

const peopleDocs = async () => {
  const [doctors, experts] = await Promise.all([
    get('/api/identity/users/doctors/public').then((r) => r.data || []).catch(() => []),
    get('/api/identity/users/experts/public').then((r) => r.data || []).catch(() => []),
  ]);
  const FIELD = { COSMETICS: 'Mỹ phẩm', NUTRITION: 'Dinh dưỡng', SKINCARE: 'Chăm sóc da', DERMATOLOGY: 'Da liễu' };
  const detail = async (id) => get(`/api/identity/users/doctors/public/${id}`).then((r) => r.data).catch(() => null);
  const docs = [];
  for (const [kind, rows] of [['DOCTOR', doctors], ['EXPERT', experts]]) {
    for (const p of rows) {
      const d = (await detail(p.id)) || p;
      docs.push({
        source_type: kind, source_id: p.id, title: `${kind === 'DOCTOR' ? 'Bác sĩ' : 'Chuyên gia tư vấn'}: ${p.title ? `${p.title} ` : ''}${p.full_name}`,
        url: kind === 'DOCTOR' ? '/doi-ngu-bac-si' : '/tu-van',
        text: [
          `${kind === 'DOCTOR' ? 'Bác sĩ khám tại phòng khám' : 'Chuyên gia tư vấn online qua video'}: ${p.title ? `${p.title} ` : ''}${p.full_name}.`,
          p.specialty && `Chuyên môn: ${p.specialty}.`,
          p.consult_field && `Lĩnh vực tư vấn: ${FIELD[p.consult_field] || p.consult_field}.`,
          p.workplace && `Nơi công tác: ${p.workplace}.`,
          p.experience_years && `Kinh nghiệm: ${p.experience_years} năm.`,
          d.bio && `Giới thiệu: ${clean(d.bio)}`,
          Array.isArray(d.education) && d.education.length && `Đào tạo: ${d.education.map((e) => [e.degree, e.school, e.year].filter(Boolean).join(', ')).join('; ')}.`,
          kind === 'DOCTOR' ? 'Đặt lịch khám ở trang Đặt lịch khám.' : 'Đặt lịch tư vấn ở trang Tư vấn chuyên gia.',
        ].filter(Boolean).join('\n'),
      });
    }
  }
  return docs;
};

// ===== Nguồn cho AI rà soát đơn kê: quy tắc an toàn đang áp dụng (booking, API nội bộ) =====
const safetyDocs = async () => {
  const rows = (await get('/api/booking/safety-rules/internal/knowledge', { headers: { Authorization: `Bearer ${sysToken()}` } })).data || [];
  return rows.map((r) => ({
    source_type: 'RULE', source_id: r.id, title: `Quy tắc: ${r.condition} + ${r.target_label}`,
    url: r.sources.find((s) => s.url)?.url || null,
    meta: { severity: r.severity, severity_label: r.severity_label, sources: r.sources },
    text: [
      `Tình trạng khách: ${r.condition}. Đối tượng: ${r.target_kind === 'PROCEDURE' ? 'thủ thuật' : 'hoạt chất'} ${r.target_label}${r.keywords?.length ? ` (từ khóa: ${r.keywords.join(', ')})` : ''}.`,
      `Mức độ: ${r.severity_label}.`,
      `Nội dung: ${clean(r.message)}`,
      r.sources.length ? `Nguồn: ${r.sources.map((s) => s.label).join('; ')}.` : '',
    ].filter(Boolean).join('\n'),
  }));
};

// ===== Sổ tay quy trình nội bộ (nhân viên): knowledge/so-tay/*.md, dòng "vai-tro:" trong chú thích đầu file =====
const handbookDocs = async () => {
  const dir = path.join(__dirname, '..', 'knowledge', 'so-tay');
  const docs = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const roles = ((raw.match(/vai-tro:\s*([^\n]+)/) || [])[1] || 'ALL').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    const body = raw.replace(/<!--[\s\S]*?-->/g, '');
    for (const sec of body.split(/^## /m).map((x) => x.trim()).filter(Boolean)) {
      const [title, ...rest] = sec.split('\n');
      const text = rest.join('\n').trim();
      if (!text) continue;
      docs.push({ source_type: 'HANDBOOK', source_id: `${file.replace(/\.md$/, '')}#${title.trim()}`, title: `Sổ tay: ${title.trim()}`, url: null, text, meta: { roles, file } });
    }
  }
  return docs;
};
// Chính sách khách hàng cũng đưa vào sổ tay (mọi nhân viên cần biết để giải thích cho khách)
const policyForStaff = async () => (await policyDocs()).map((d) => ({ ...d, source_type: 'POLICY', title: d.title.replace('Chính sách mục', 'Chính sách khách hàng mục'), meta: { roles: ['ALL'] } }));

const COLLECTORS = {
  CHAT: { POLICY: policyDocs, CLINIC: clinicDocs, SERVICE: serviceDocs, PACKAGE: packageDocs, PRODUCT: productDocs, ARTICLE: articleDocs, PEOPLE: peopleDocs },
  SAFETY: { RULE: safetyDocs },
  HANDBOOK: { HANDBOOK: handbookDocs, POLICY: policyForStaff },
};

// ===== Lưu + bộ nhớ đệm =====
const cache = { CHAT: null, SAFETY: null, HANDBOOK: null };
const status = { CHAT: {}, SAFETY: {}, HANDBOOK: {} };
const load = async (ns) => {
  const rows = await KnowledgeChunk.find({ ns }).lean();
  cache[ns] = rows.map((r) => ({ ...r, folded: fold(`${r.title}\n${r.text}`) }));
  return cache[ns];
};

let running = null;
const reindex = async (ns) => {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const result = { ns, added: 0, updated: 0, removed: 0, unchanged: 0, failed_sources: [] };
    const docs = [];
    const okTypes = new Set();
    for (const [name, collect] of Object.entries(COLLECTORS[ns])) {
      try {
        const got = await collect();
        docs.push(...got);
        got.forEach((d) => okTypes.add(d.source_type));
        if (!got.length) okTypes.add(name); // nguồn rỗng hợp lệ (vd chưa có bài viết)
      } catch (err) {
        result.failed_sources.push(`${name}: ${err.message}`);
      }
    }
    // Đánh số đoạn trong từng nguồn => key ổn định
    const counter = {};
    const chunks = docs.filter((d) => d.text && d.text.trim()).map((d) => {
      const base = `${ns}:${d.source_type}:${d.source_id}`;
      counter[base] = (counter[base] || 0) + 1;
      return { ...d, ns, key: `${base}:${counter[base]}`, hash: hash(`${gemini.embedModel()}|${d.title}|${d.text}`) };
    });
    const existing = new Map((await KnowledgeChunk.find({ ns }, { key: 1, hash: 1, source_type: 1 }).lean()).map((r) => [r.key, r]));
    const todo = chunks.filter((c) => existing.get(c.key)?.hash !== c.hash);
    result.unchanged = chunks.length - todo.length;
    if (todo.length) {
      const vectors = await gemini.embed(todo.map((c) => `${c.title}\n${c.text}`), 'RETRIEVAL_DOCUMENT');
      for (let i = 0; i < todo.length; i++) {
        const c = todo[i];
        if (existing.has(c.key)) result.updated += 1; else result.added += 1;
        await KnowledgeChunk.updateOne({ key: c.key }, {
          $set: { ns, key: c.key, source_type: c.source_type, source_id: c.source_id, title: c.title, url: c.url, text: c.text, meta: c.meta || null, hash: c.hash, model: gemini.embedModel(), embedding: vectors[i] },
        }, { upsert: true });
      }
    }
    // Xóa đoạn không còn — chỉ với loại nguồn đã thu thập thành công (nguồn lỗi tạm thời thì giữ dữ liệu cũ)
    const keep = new Set(chunks.map((c) => c.key));
    const stale = [...existing.values()].filter((r) => !keep.has(r.key) && okTypes.has(r.source_type)).map((r) => r.key);
    if (stale.length) await KnowledgeChunk.deleteMany({ key: { $in: stale } });
    result.removed = stale.length;
    result.total = (await load(ns)).length;
    result.ms = Date.now() - started;
    status[ns] = { ...result, at: new Date().toISOString() };
    return result;
  })().finally(() => { running = null; });
  return running;
};

const reindexAll = async () => {
  const out = [];
  for (const ns of ['CHAT', 'SAFETY', 'HANDBOOK']) {
    try { out.push(await reindex(ns)); } catch (err) { status[ns] = { error: err.message, at: new Date().toISOString() }; out.push({ ns, error: err.message }); }
  }
  return out;
};

// Tìm k đoạn liên quan nhất. Điểm = cosine (vector đã chuẩn hóa) + tối đa 0.15 theo tỷ lệ từ khóa của câu hỏi có trong đoạn
const STOP = new Set(['la', 'co', 'khong', 'cho', 'toi', 'minh', 'ban', 'cua', 'va', 'thi', 'bao', 'nhieu', 'nao', 'gi', 'the', 'duoc', 'can', 'o', 'tai', 'voi', 'nhu', 'em', 'a', 'oi', 'hay', 'neu', 'phai', 'mot', 'cac', 'nhung', 'trong', 'khi', 'de', 'vay', 'sao', 'lam']);
// filter: (đoạn) => true/false, vd chỉ lấy đoạn sổ tay của vai trò người hỏi
const search = async (ns, query, { k = 6, minScore = 0.45, filter = null } = {}) => {
  const rows = (cache[ns] || await load(ns)).filter((r) => !filter || filter(r));
  if (!rows.length) return [];
  const [q] = await gemini.embed([query], 'RETRIEVAL_QUERY');
  const words = [...new Set(fold(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)))];
  return rows.map((r) => {
    let dot = 0;
    for (let i = 0; i < q.length; i++) dot += q[i] * (r.embedding[i] || 0);
    const hit = words.length ? words.filter((w) => r.folded.includes(w)).length / words.length : 0;
    return { ...r, score: dot + 0.15 * hit, cosine: dot };
  }).filter((r) => r.score >= minScore).sort((a, b) => b.score - a.score).slice(0, k)
    .map(({ embedding, folded, ...r }) => r);
};

let timer = null;
const start = () => {
  const minutes = Number(process.env.KNOWLEDGE_REFRESH_MINUTES) || 30;
  const run = () => reindexAll().then((r) => console.log('📚 [RAG] Nạp kho kiến thức:', r.map((x) => (x.error ? `${x.ns} lỗi ${x.error}` : `${x.ns} ${x.total} đoạn (+${x.added} ~${x.updated} -${x.removed})${x.failed_sources.length ? ` | lỗi: ${x.failed_sources.join(', ')}` : ''}`)).join(' | '))).catch((e) => console.warn('[RAG] Lỗi nạp kho:', e.message));
  setTimeout(run, 5000); // đợi các service khác khởi động
  timer = setInterval(run, minutes * 60 * 1000);
  timer.unref();
};

module.exports = { reindex, reindexAll, search, start, status: () => status, fold };
