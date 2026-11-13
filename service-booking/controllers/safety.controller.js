const axios = require('axios');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { PatientSafety, SpaService, TreatmentPackage, Appointment, AiReviewLog } = require('../models');
const { historyCounts, findAlternatives } = require('../utils/alternatives');
const { FLAGS, counterFlags, hasCounterRule, proceduresOf, ingredientsOf, targetLabel, evaluate } = require('../utils/safetyRules');

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const screenedToday = (row) => !!row?.screened_at && dayjs(row.screened_at).isSame(dayjs(), 'day');

const systemWarning = (code, message) => ({ code, severity: 'CAUTION', severity_label: 'Thận trọng', condition: 'Sàng lọc an toàn', item: null, message, sources: [] });

// Dịch vụ, gói, sản phẩm được kê => danh sách để so với quy tắc. Không đọc được thành phần thì báo, không coi là an toàn
const collectItems = async ({ services = [], packages = [], medicines = [], authorization }) => {
  const [svcRows, pkgRows, productRes] = await Promise.all([
    services.length ? SpaService.findAll({ where: { id: services }, attributes: ['name'], raw: true }) : [],
    packages.length ? TreatmentPackage.findAll({ where: { id: packages }, attributes: ['name', 'description'], raw: true }) : [],
    medicines.length
      ? axios.get('http://localhost:4000/api/commerce/products/safety-info', { params: { ids: medicines.join(',') }, headers: { Authorization: authorization } }).catch(() => null)
      : { data: { data: [] } },
  ]);
  const products = productRes?.data?.data || [];
  const items = [
    ...svcRows.map((s) => ({ name: s.name, targets: proceduresOf(s.name), text: '' })),
    ...pkgRows.map((p) => ({ name: p.name, targets: proceduresOf(`${p.name} ${p.description || ''}`), text: '' })),
    ...products.map((p) => ({ name: p.name, targets: ingredientsOf(p.ingredients), text: `${p.name} ${p.ingredients || ''}` })),
  ];
  return { items, unknown: !productRes || products.some((p) => !p.ingredients) };
};

// Kiểm tra đơn kê của 1 hồ sơ người khám. Dùng cho màn hình bác sĩ, lúc hoàn tất khám và lúc chốt hoá đơn
const checkPrescription = async ({ patient_profile_id, services, packages, medicines, authorization }) => {
  if (!services?.length && !packages?.length && !medicines?.length) return [];
  const safety = isUuid(patient_profile_id) ? await PatientSafety.findByPk(patient_profile_id, { raw: true }) : null;
  const { items, unknown } = await collectItems({ services, packages, medicines, authorization });
  const warnings = evaluate({ flags: safety?.flags || [], allergies: safety?.allergies, items });
  if (!screenedToday(safety)) warnings.unshift(systemWarning('NOT_SCREENED', 'Chưa xác nhận sàng lọc an toàn trong lần khám này (thai kỳ, thuốc đang dùng, dị ứng).'));
  if (unknown) warnings.push(systemWarning('UNKNOWN_INGREDIENTS', 'Không đọc được thành phần của một số sản phẩm, chưa kiểm tra được.'));
  return warnings;
};

// CSKH phải xác nhận đã hỏi sàng lọc trong ngày trước khi chuyển khách cho bác sĩ. Lịch cũ không có hồ sơ người khám thì bỏ qua
const SCREENING_REQUIRED = 'Chưa xác nhận sàng lọc an toàn: hỏi khách các mục trong khung "Sàng lọc an toàn" rồi bấm "Xác nhận đã hỏi khách"';
const isScreenedForVisit = async (patient_profile_id, transaction) => {
  if (!isUuid(patient_profile_id)) return true;
  return screenedToday(await PatientSafety.findByPk(patient_profile_id, { raw: true, transaction }));
};

// [STAFF] GET /safety/flags
const getFlags = (req, res) => res.status(200).json({ data: Object.entries(FLAGS).map(([value, label]) => ({ value, label })) });

// [STAFF] GET /safety/patients/:id
const getPatientSafety = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const row = await PatientSafety.findByPk(req.params.id, { raw: true });
    res.status(200).json({
      data: {
        flags: row?.flags || [], allergies: row?.allergies || '', screened_at: row?.screened_at || null, screened_today: screenedToday(row),
        // Khách khai khi mua tại quầy (chưa phải sàng lọc của lần khám): CSKH điền vào form rồi tự xác nhận
        counter: row?.counter_reported_at ? { flags: row.counter_flags || [], allergies: row.counter_allergies || '', reported_at: row.counter_reported_at } : null,
      },
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] PUT /safety/patients/:id { flags, allergies } — lưu = đã hỏi khách trong lần khám này
const savePatientSafety = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const flags = Array.isArray(req.body.flags) ? [...new Set(req.body.flags)] : [];
    if (flags.some((f) => !FLAGS[f])) return res.status(400).json({ message: 'Thông tin sàng lọc không hợp lệ' });
    const allergies = String(req.body.allergies || '').trim().slice(0, 500);
    await PatientSafety.upsert({ patient_profile_id: req.params.id, flags, allergies, screened_at: new Date(), screened_by: req.user.id });
    res.status(200).json({ message: 'Đã lưu sàng lọc an toàn' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] POST /safety/check { patient_profile_id, spa_services, treatment_package, prescriptions }
const checkSafety = async (req, res) => {
  try {
    const { patient_profile_id, spa_services = [], treatment_package, prescriptions = [] } = req.body;
    if (!isUuid(patient_profile_id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const warnings = await checkPrescription({
      patient_profile_id, services: spa_services, packages: treatment_package ? [treatment_package] : [],
      medicines: prescriptions.map((p) => p?.product_id).filter(Boolean), authorization: req.headers.authorization,
    });
    res.status(200).json({ data: warnings });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] POST /safety/ai-review { patient_profile_id, spa_services, treatment_package, prescriptions, diagnosis, symptoms }
// AI rà soát thêm đơn đang kê và gợi ý sản phẩm thay thế. Chỉ để bác sĩ tham khảo: không chặn kê đơn, không bỏ cảnh báo
// của bảng quy tắc. Sản phẩm AI gợi ý phải có trong danh mục đang bán và qua được bảng quy tắc với tình trạng của khách.
const AI_SEVERITY = { CONTRAINDICATED: 'Chống chỉ định', CAUTION: 'Thận trọng', INFO: 'Lưu ý' };
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const aiReview = async (req, res) => {
  try {
    const { patient_profile_id, spa_services = [], treatment_package, prescriptions = [] } = req.body;
    if (!isUuid(patient_profile_id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const medicines = prescriptions.map((p) => p?.product_id).filter(isUuid);
    const packages = isUuid(treatment_package) ? [treatment_package] : [];
    const services = (Array.isArray(spa_services) ? spa_services : []).filter(isUuid);
    if (!services.length && !packages.length && !medicines.length) return res.status(400).json({ message: 'Chưa có mục nào trong đơn để AI rà soát' });
    const authorization = req.headers.authorization;
    const headers = { Authorization: authorization };
    const diagnosis = clip(req.body.diagnosis, 300);

    const [safety, svcRows, pkgRows, productRes, catalogRes, ruleWarnings, pastVisits] = await Promise.all([
      PatientSafety.findByPk(patient_profile_id, { raw: true }),
      services.length ? SpaService.findAll({ where: { id: services }, attributes: ['name', 'description'], raw: true }) : [],
      packages.length ? TreatmentPackage.findAll({ where: { id: packages }, attributes: ['name', 'description'], raw: true }) : [],
      medicines.length ? axios.get('http://localhost:4000/api/commerce/products/safety-info', { params: { ids: medicines.join(',') }, headers }) : { data: { data: [] } },
      medicines.length ? axios.get('http://localhost:4000/api/commerce/products/safety-catalog', { headers }).catch(() => ({ data: { data: [] } })) : { data: { data: [] } },
      checkPrescription({ patient_profile_id, services, packages, medicines, authorization }),
      medicines.length
        ? Appointment.findAll({ where: { status: ['COMPLETED', 'WAITING_FOR_SALE'], diagnosis: { [Op.ne]: null } }, attributes: ['diagnosis', 'prescribed_medicines'], order: [['createdAt', 'DESC']], limit: 3000, raw: true })
        : [],
    ]);
    const products = productRes.data.data || [];
    const catalog = (catalogRes.data.data || []).filter((p) => !medicines.includes(p.id));
    const flags = safety?.flags || [];

    // Sản phẩm thay thế theo quy tắc + lịch sử kê đơn (utils/alternatives.js). Tính trước khi gọi AI để AI lỗi vẫn có
    const history = historyCounts(pastVisits, diagnosis);
    const patient = { flags, allergies: safety?.allergies };
    const flaggedNames = new Set(ruleWarnings.filter((w) => w.severity !== 'INFO' && w.item).map((w) => w.item));
    const alternativesFor = (names, exclude = []) => findAlternatives({
      flagged: products.filter((x) => names.has(x.name)),
      catalog: catalog.filter((c) => !exclude.includes(c.id)), patient, history, hasDiagnosis: !!diagnosis,
    });
    const alternatives = alternativesFor(flaggedNames);
    const untagged = products.filter((x) => flaggedNames.has(x.name) && !(x.concerns || []).length).map((x) => x.name);

    const prescription = [
      ...svcRows.map((x) => ({ type: 'Dịch vụ', name: x.name, detail: clip(x.description, 300), procedures: proceduresOf(x.name).map((k) => targetLabel(k)) })),
      ...pkgRows.map((x) => ({ type: 'Gói liệu trình', name: x.name, detail: clip(x.description, 300), procedures: proceduresOf(`${x.name} ${x.description || ''}`).map((k) => targetLabel(k)) })),
      ...products.map((x) => {
        const qty = prescriptions.find((p) => p.product_id === x.id)?.quantity || 1;
        return { type: 'Sản phẩm', name: x.name, quantity: qty, ingredients: clip(x.ingredients, 800) || 'Chưa có bảng thành phần', manufacturer_warnings: clip(x.warnings, 300) };
      }),
    ];
    const input = {
      patient: {
        screening: flags.map((f) => FLAGS[f]).filter(Boolean),
        screened_today: screenedToday(safety),
        allergies: clip(safety?.allergies, 300) || 'Không ghi nhận',
        diagnosis, symptoms: clip(req.body.symptoms, 500),
      },
      prescription,
      rule_warnings: ruleWarnings.map((w) => ({ item: w.item, severity: w.severity_label, message: w.message })),
    };
    const base = {
      alternatives, untagged,
      checked_at: new Date().toISOString(),
      note: 'Sản phẩm thay thế do hệ thống chọn theo quy tắc và lịch sử kê đơn; nhận xét AI chỉ để tham khảo. Bác sĩ quyết định, cảnh báo của bảng quy tắc vẫn áp dụng khi hoàn tất khám.',
    };

    let ai;
    try {
      ai = (await axios.post('http://localhost:4000/api/ai/safety-review', input, { headers, timeout: 120000 })).data.data;
    } catch (error) {
      // AI lỗi / hết lượt: vẫn trả sản phẩm thay thế theo quy tắc
      return res.status(200).json({ data: { ...base, summary: '', warnings: [], questions: [], ai_error: error.response?.data?.message || 'Không gọi được AI, bác sĩ đánh giá theo cảnh báo hệ thống' } });
    }

    // Kiểm tra lại kết quả AI: chỉ giữ cảnh báo về mục có trong đơn, đúng mức độ
    const names = prescription.map((x) => x.name);
    const warnings = (ai.warnings || [])
      .map((w) => ({ ...w, item: names.find((n) => n.toLowerCase() === String(w.item || '').trim().toLowerCase()) }))
      .filter((w) => AI_SEVERITY[w.severity] && w.item)
      .slice(0, 8)
      .map((w) => ({ item: w.item, severity: w.severity, severity_label: AI_SEVERITY[w.severity], message: clip(w.message, 500), basis: clip(w.basis, 300) }));
    // Sản phẩm AI cảnh báo thêm (mức Thận trọng / Chống chỉ định) cũng được tìm sản phẩm thay thế theo quy tắc
    const aiFlagged = new Set(warnings.filter((w) => w.severity !== 'INFO' && !flaggedNames.has(w.item)).map((w) => w.item));
    if (aiFlagged.size) alternatives.push(...alternativesFor(aiFlagged, alternatives.map((x) => x.product_id)));

    // Lưu theo lịch khám: khi hoàn tất khám, cảnh báo AI (Thận trọng / Chống chỉ định) về mục còn trong đơn phải được xác nhận
    let recorded = false;
    if (isUuid(req.body.appointment_id)) {
      const apt = await Appointment.findByPk(req.body.appointment_id, { attributes: ['id', 'doctor_id', 'patient_profile_id'], raw: true });
      if (apt && apt.patient_profile_id === patient_profile_id && (req.user.role !== 'DOCTOR' || apt.doctor_id === req.user.id)) {
        await AiReviewLog.create({ appointment_id: apt.id, patient_profile_id, doctor_id: req.user.id, item_names: names, warnings, model: ai.model || null });
        recorded = true;
      }
    }

    res.status(200).json({
      data: {
        ...base, alternatives,
        summary: clip(ai.summary, 600), warnings, questions: (ai.questions || []).slice(0, 3).map((q) => clip(q, 300)),
        model: ai.model, recorded,
        must_confirm: recorded && warnings.some((w) => w.severity !== 'INFO'),
      },
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// ===== BÁN TẠI QUẦY (NVBH) =====
const sanitizeAnswers = (answers) => ({
  flags: [...new Set((Array.isArray(answers?.flags) ? answers.flags : []).filter((f) => counterFlags().includes(f)))],
  allergies: String(answers?.allergies || '').trim().slice(0, 500),
});

// Hồ sơ "Bản thân" của tài khoản khách (đơn tại quầy luôn gắn tài khoản; khách mới thì NVBH tạo nhanh kèm hồ sơ này)
const selfProfileOf = async (customer_id, headers) => {
  if (!isUuid(customer_id)) return null;
  const res = await axios.get(`http://localhost:4000/api/identity/profile/patients/user/${customer_id}`, { headers }).catch(() => null);
  const profiles = res?.data?.data || [];
  return profiles.find((p) => p.relationship === 'Bản thân') || profiles[0] || null;
};

// Câu trả lời có sẵn để điền trước: lấy bản MỚI NHẤT giữa sàng lọc của lần khám (CSKH xác nhận) và lần khai tại quầy trước
const prefillOf = (row) => {
  if (!row) return null;
  const screening = row.screened_at ? { flags: (row.flags || []).filter((f) => counterFlags().includes(f)), allergies: row.allergies || '', at: row.screened_at, source: 'Sàng lọc khi khám' } : null;
  const counter = row.counter_reported_at ? { flags: row.counter_flags || [], allergies: row.counter_allergies || '', at: row.counter_reported_at, source: 'Khai khi mua tại quầy' } : null;
  if (!screening || !counter) return screening || counter;
  return new Date(counter.at) > new Date(screening.at) ? counter : screening;
};

// [NVBH] POST /safety/counter-check { customer_id?, product_ids, answers?: { flags, allergies } }
// Đơn có sản phẩm chứa hoạt chất trong bảng quy tắc (hoặc trùng dị ứng đã biết) thì phải hỏi khách; trả câu hỏi, câu trả lời điền sẵn và cảnh báo.
// service-commerce gọi lại API này khi tạo đơn để kiểm tra trên server.
const counterCheck = async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.product_ids) ? req.body.product_ids : []).filter(isUuid).slice(0, 50);
    const questions = counterFlags().map((f) => ({ value: f, label: FLAGS[f] }));
    if (!ids.length) return res.status(200).json({ data: { needs_screening: false, questions, warnings: [], prefill: null, profile_id: null } });
    const headers = { Authorization: req.headers.authorization };
    const [productRes, profile] = await Promise.all([
      axios.get('http://localhost:4000/api/commerce/products/safety-info', { params: { ids: ids.join(',') }, headers }),
      selfProfileOf(req.body.customer_id, headers),
    ]);
    const products = productRes.data.data || [];
    const row = profile ? await PatientSafety.findByPk(profile.id, { raw: true }) : null;
    const prefill = prefillOf(row);
    const items = products.map((p) => ({ name: p.name, targets: ingredientsOf(p.ingredients), text: `${p.name} ${p.ingredients || ''}` }));

    const given = req.body.answers ? sanitizeAnswers(req.body.answers) : (prefill ? sanitizeAnswers(prefill) : { flags: [], allergies: '' });
    const warnings = evaluate({ flags: given.flags, allergies: given.allergies, items });
    const needs_screening = items.some((i) => hasCounterRule(i.targets)) || warnings.length > 0;
    res.status(200).json({
      data: {
        needs_screening, questions, profile_id: profile?.id || null, prefill,
        answers: given, warnings,
        has_contraindication: warnings.some((w) => w.severity === 'CONTRAINDICATED'),
        missing_ingredients: products.filter((p) => !p.ingredients).map((p) => p.name),
      },
    });
  } catch (error) { res.status(500).json({ message: 'Không kiểm tra được an toàn', error: error.message }); }
};

// [NỘI BỘ] POST /safety/counter-report { patient_profile_id, flags, allergies, order_id, reported_by } — commerce gọi sau khi tạo đơn
const counterReport = async (req, res) => {
  try {
    const { patient_profile_id, order_id, reported_by } = req.body;
    if (!isUuid(patient_profile_id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const { flags, allergies } = sanitizeAnswers(req.body);
    const values = { counter_flags: flags, counter_allergies: allergies, counter_reported_at: new Date(), counter_reported_by: isUuid(reported_by) ? reported_by : null, counter_order_id: isUuid(order_id) ? order_id : null };
    const row = await PatientSafety.findByPk(patient_profile_id);
    if (row) await row.update(values);
    else await PatientSafety.create({ patient_profile_id, flags: [], ...values }); // chưa từng sàng lọc: screened_at để trống
    res.status(200).json({ message: 'Đã ghi câu trả lời tại quầy vào hồ sơ' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// Cảnh báo AI (Thận trọng / Chống chỉ định) của lần rà soát mới nhất, chỉ giữ mục còn trong đơn lúc hoàn tất khám.
// Định dạng giống cảnh báo bảng quy tắc để dùng chung hộp xác nhận và lưu vào SafetyOverride.
const aiWarningsFor = async ({ appointment_id, services = [], packages = [], medicines = [], authorization }) => {
  const log = await AiReviewLog.findOne({ where: { appointment_id }, order: [['createdAt', 'DESC']], raw: true });
  if (!log) return [];
  const { items } = await collectItems({ services, packages, medicines, authorization });
  const current = items.map((i) => i.name.toLowerCase());
  return (log.warnings || [])
    .filter((w) => w.severity !== 'INFO' && current.includes(String(w.item || '').toLowerCase()))
    .map((w) => ({
      code: `AI:${w.item}`, source: 'AI', severity: w.severity, severity_label: w.severity_label || AI_SEVERITY[w.severity],
      condition: 'AI rà soát đơn (tham khảo, chưa có trong bảng quy tắc)', item: w.item, message: w.message,
      sources: [{ label: `Căn cứ AI${log.model ? ` (${log.model})` : ''}: ${w.basis || 'không ghi'}`, url: null }],
    }));
};

module.exports = { aiWarningsFor, counterCheck, counterReport, aiReview, SCREENING_REQUIRED, isScreenedForVisit, checkPrescription, getFlags, getPatientSafety, savePatientSafety, checkSafety };
