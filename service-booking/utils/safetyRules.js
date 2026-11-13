// CẢNH BÁO CHỐNG CHỈ ĐỊNH KHI KÊ ĐƠN / BÁN TẠI QUẦY
// Quy tắc lưu trong database (SafetyRules), chỉ quy tắc ĐANG ÁP DỤNG mới được dùng. Mỗi quy tắc phải có nguồn.
// Thêm / sửa quy tắc qua trang "Quy tắc an toàn": quản lý soạn -> bác sĩ xem xét -> quản lý duyệt (controllers/safetyRule.controller.js).
// Lần đầu chạy: nạp các quy tắc đã đọc nguồn trong utils/safetyRules.seed.js.
// Hệ thống chỉ nhắc, không thay bác sĩ quyết định: bác sĩ vẫn kê được nhưng phải ghi lý do (lưu ở SafetyOverride).
const { SafetySource, SafetyTarget, SafetyRule, SafetyRuleEvent } = require('../models');
const SEED = require('./safetyRules.seed');

const SEVERITY = { CONTRAINDICATED: 'Chống chỉ định', CAUTION: 'Thận trọng', INFO: 'Lưu ý' };

// Câu hỏi sàng lọc (cố định). Tình trạng thay đổi được (thai kỳ, thuốc...) nên phải xác nhận lại mỗi lần khám
const FLAGS = {
  PREGNANT: 'Đang mang thai',
  PLANNING_PREGNANCY: 'Đang có kế hoạch mang thai',
  BREASTFEEDING: 'Đang cho con bú',
  ISOTRETINOIN: 'Đang dùng hoặc vừa ngưng isotretinoin uống',
  ANTICOAGULANT: 'Đang dùng thuốc chống đông / có rối loạn đông máu',
  KELOID: 'Cơ địa sẹo lồi',
  ACTIVE_INFECTION: 'Đang nhiễm trùng da / herpes ở vùng điều trị',
  ACTIVE_ACNE: 'Đang có mụn viêm ở vùng điều trị',
  IMMUNOSUPPRESSED: 'Suy giảm miễn dịch / đang hoá trị',
  CHRONIC_SKIN: 'Chàm, vảy nến mức vừa đến nặng',
  AUTOIMMUNE: 'Có bệnh tự miễn',
  ELECTRONIC_IMPLANT: 'Có máy tạo nhịp tim hoặc thiết bị điện cấy ghép',
  METAL_IMPLANT_FACE: 'Có cấy ghép kim loại vùng mặt',
};

// Bỏ dấu, chữ thường để so tên dịch vụ và thành phần
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Từ khóa so theo nguyên từ; "*" ở cuối = khớp cả từ dài hơn (peel* khớp peeling)
const keywordRe = (kw) => {
  const n = normalize(kw).trim().replace(/\s+/g, ' ');
  const prefix = n.endsWith('*');
  const body = escapeRe(prefix ? n.slice(0, -1).trim() : n);
  return new RegExp(`(^|[^a-z0-9])${body}${prefix ? '' : '($|[^a-z0-9])'}`);
};
const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x || '').trim()).filter((x) => x.replace('*', '').length >= 2))];
// Hàm so 1 đối tượng với văn bản (bảng thành phần / tên dịch vụ)
const compileTarget = (t) => {
  const keywords = cleanList(t.keywords).map(keywordRe);
  const excludes = cleanList(t.excludes).map((e) => normalize(e).replace(/\s+/g, ' '));
  return (text) => {
    let s = normalize(text).replace(/\s+/g, ' ');
    excludes.forEach((e) => { s = s.split(e).join(' '); });
    const hits = keywords.map((re) => re.test(s));
    return hits.length > 0 && (t.all_of ? hits.every(Boolean) : hits.some(Boolean));
  };
};

// Bộ quy tắc đang dùng (nạp từ DB, giữ trong bộ nhớ, nạp lại khi có quy tắc được duyệt)
const buildStore = ({ sources = [], targets = [], rules = [] }) => ({
  sources: new Map(sources.map((s) => [s.id, { label: s.label, url: s.url || null }])),
  targets: new Map(targets.map((t) => [t.code, { code: t.code, id: t.id, kind: t.kind, label: t.label, match: compileTarget(t) }])),
  rules: rules.map((r) => ({ flag: r.flag, target: r.target_code, severity: r.severity, message: r.message, source_ids: r.source_ids || [], id: r.id })),
});
let store = buildStore({});

const reload = async () => {
  const rules = await SafetyRule.findAll({ where: { status: 'ACTIVE' }, raw: true });
  const targetIds = [...new Set(rules.map((r) => r.target_id))];
  const targets = await SafetyTarget.findAll({ where: { id: targetIds }, raw: true });
  // Thủ thuật / hoạt chất đang dùng nhưng chưa có quy tắc nào vẫn được nhận diện (để hiện tên thủ thuật cho AI)
  const extra = await SafetyTarget.findAll({ where: { status: 'ACTIVE' }, raw: true });
  const allTargets = [...new Map([...extra, ...targets].map((t) => [t.id, t])).values()];
  const codeOf = new Map(allTargets.map((t) => [t.id, t.code]));
  const sources = await SafetySource.findAll({ raw: true });
  store = buildStore({ sources, targets: allTargets, rules: rules.filter((r) => codeOf.has(r.target_id)).map((r) => ({ ...r, target_code: codeOf.get(r.target_id) })) });
  return store.rules.length;
};

// Lần đầu: nạp quy tắc khởi tạo (đã đọc nguồn trực tiếp) với trạng thái đang áp dụng
const seedIfEmpty = async () => {
  if (await SafetyRule.count()) return 0;
  const sourceId = {};
  for (const [code, s] of Object.entries(SEED.SOURCES)) {
    const [row] = await SafetySource.findOrCreate({ where: { code }, defaults: { code, kind: s.url ? 'LINK' : 'CLINIC', label: s.label, url: s.url } });
    sourceId[code] = row.id;
  }
  const targetId = {};
  for (const t of SEED.TARGETS) {
    const [row] = await SafetyTarget.findOrCreate({ where: { code: t.code }, defaults: { ...t, excludes: t.excludes || [], all_of: !!t.all_of, status: 'ACTIVE' } });
    targetId[t.code] = row.id;
  }
  const now = new Date();
  for (const r of SEED.RULES) {
    const rule = await SafetyRule.create({
      flag: r.flag, target_id: targetId[r.target], severity: r.severity, message: r.message,
      source_ids: r.sources.map((c) => sourceId[c]), status: 'ACTIVE', origin: 'SYSTEM', decided_at: now,
      decision_note: 'Quy tắc khởi tạo của hệ thống (đã đọc nguồn trực tiếp)',
    });
    await SafetyRuleEvent.create({ rule_id: rule.id, action: 'SEEDED', note: 'Nạp từ bộ quy tắc khởi tạo' });
  }
  return SEED.RULES.length;
};

const init = async () => {
  const seeded = await seedIfEmpty();
  if (seeded) console.log(`🛡️  Đã nạp ${seeded} quy tắc chống chỉ định khởi tạo`);
  const n = await reload();
  console.log(`🛡️  Đang áp dụng ${n} quy tắc chống chỉ định`);
};

const targetsOf = (kind, text, s = store) => [...s.targets.values()].filter((t) => t.kind === kind && t.match(text)).map((t) => t.code);
const proceduresOf = (text, s) => targetsOf('PROCEDURE', text, s);
const ingredientsOf = (text, s) => targetsOf('INGREDIENT', text, s);
const targetLabel = (code, s = store) => s.targets.get(code)?.label || code;

// Bỏ các cách ghi "không có dị ứng", và so theo nguyên từ để "mat" không khớp vào "kem mat"
const NO_ALLERGY = /^(khong|ko|chua|none|n\/a)\b/;
const allergyTerms = (text) => String(text || '').split(/[,;\n]/).map((t) => normalize(t).trim()).filter((t) => t.length >= 3 && !NO_ALLERGY.test(t));
const hasTerm = (haystack, term) => new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`).test(haystack);

const toWarning = (r, itemName, s) => ({
  code: `${r.flag}:${r.target}`, severity: r.severity, severity_label: SEVERITY[r.severity],
  condition: FLAGS[r.flag], item: itemName, message: r.message,
  sources: r.source_ids.map((id) => s.sources.get(id)).filter(Boolean),
});

// items: [{ name, targets: ['PEEL', ...], text: 'bảng thành phần' }]
const evaluate = ({ flags = [], allergies = '', items = [] }, s = store) => {
  const warnings = [];
  const terms = allergyTerms(allergies);
  for (const item of items) {
    s.rules.filter((r) => flags.includes(r.flag) && item.targets.includes(r.target)).forEach((r) => warnings.push(toWarning(r, item.name, s)));
    const haystack = normalize(item.text);
    terms.filter((t) => hasTerm(haystack, t)).forEach((t) => warnings.push({
      code: `ALLERGY:${t}`, severity: 'CONTRAINDICATED', severity_label: SEVERITY.CONTRAINDICATED, condition: 'Dị ứng đã ghi trong hồ sơ', item: item.name,
      message: `Hồ sơ ghi dị ứng "${t}", sản phẩm có thành phần này.`, sources: [],
    }));
  }
  const rank = { CONTRAINDICATED: 0, CAUTION: 1, INFO: 2 };
  return warnings.sort((a, b) => rank[a.severity] - rank[b.severity]);
};

// Câu hỏi khi NVBH bán mỹ phẩm tại quầy: các tình trạng có quy tắc với HOẠT CHẤT (thủ thuật không bán tại quầy)
const counterFlags = (s = store) => [...new Set(s.rules.filter((r) => s.targets.get(r.target)?.kind === 'INGREDIENT').map((r) => r.flag))]
  .sort((a, b) => Object.keys(FLAGS).indexOf(a) - Object.keys(FLAGS).indexOf(b));
const hasCounterRule = (targets, s = store) => {
  const flags = counterFlags(s);
  return s.rules.some((r) => flags.includes(r.flag) && targets.includes(r.target));
};

// Bộ quy tắc thử (nút "Thử quy tắc"): bộ đang dùng + 1 quy tắc nháp.
// Bản sửa: bỏ bản cũ ra, thay bằng bản nháp. Đề xuất ngưng: chỉ bỏ bản cũ.
const storeWith = (draft, { removeRuleId = null, deactivate = false } = {}) => {
  const next = { sources: store.sources, targets: new Map(store.targets), rules: store.rules.filter((r) => r.id !== removeRuleId) };
  if (draft?.target) next.targets.set(draft.target.code, { ...draft.target, match: compileTarget(draft.target) });
  if (draft?.rule && !deactivate) next.rules.push(draft.rule);
  return next;
};

module.exports = {
  SEVERITY, FLAGS, init, reload, normalize, compileTarget, cleanList,
  proceduresOf, ingredientsOf, targetLabel, evaluate, counterFlags, hasCounterRule, storeWith,
  getStore: () => store,
};
