// QUẢN LÝ QUY TẮC CHỐNG CHỈ ĐỊNH. Người duyệt duy nhất: QUẢN LÝ CHUNG (GEN_MANAGER).
// Luồng A - quản lý soạn: Nháp -> (bắt buộc) gửi bác sĩ xem xét -> bác sĩ trả lời đủ -> quản lý duyệt / từ chối.
//   Duyệt khi: mọi bác sĩ đã trả lời, ít nhất 1 Đồng ý, không ai Cần sửa / Không đồng ý. Sửa nội dung => về Nháp, gửi lại (vòng mới).
// Luồng B - bác sĩ đề xuất: bác sĩ soạn -> gửi quản lý -> quản lý duyệt / yêu cầu sửa (trả về bác sĩ) / từ chối,
//   hoặc gửi thêm bác sĩ khác xem xét (như luồng A). Quản lý không tự sửa nội dung đề xuất của bác sĩ.
// Sửa / ngưng quy tắc đang áp dụng: tạo BẢN MỚI (phiên bản +1) đi đúng 1 trong 2 luồng trên; bản cũ vẫn áp dụng tới khi bản mới được duyệt.
// Mọi thao tác ghi nhật ký kèm nội dung lúc đó.
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize, SafetySource, SafetyTarget, SafetyRule, SafetyRuleReview, SafetyRuleEvent, SpaService, TreatmentPackage } = require('../models');
const rules = require('../utils/safetyRules');

const MANAGER = 'GEN_MANAGER';
const SEVERITIES = Object.keys(rules.SEVERITY);
const VERDICTS = { AGREE: 'Đồng ý', CHANGES: 'Cần sửa', DISAGREE: 'Không đồng ý' };
const STATUS_LABEL = {
  DRAFT: 'Nháp', PROPOSED: 'Bác sĩ đề xuất, chờ quản lý', CHANGES_REQUESTED: 'Quản lý yêu cầu sửa', IN_REVIEW: 'Chờ bác sĩ xem xét',
  REVIEWED: 'Đã xem xét, chờ duyệt', ACTIVE: 'Đang áp dụng', REJECTED: 'Đã từ chối', SUPERSEDED: 'Đã thay bằng bản mới',
  INACTIVE: 'Đã ngưng áp dụng', APPLIED: 'Đề xuất ngưng đã thực hiện',
};
const CHANGE_LABEL = { NEW: 'Quy tắc mới', EDIT: 'Sửa quy tắc đang áp dụng', DEACTIVATE: 'Ngưng quy tắc đang áp dụng' };
const OPEN = ['DRAFT', 'PROPOSED', 'CHANGES_REQUESTED', 'IN_REVIEW', 'REVIEWED']; // đang xử lý
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const fail = (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.status ? undefined : error.message });
const clip = (v, n) => String(v || '').trim().slice(0, n);
const isHttp = (u) => /^https?:\/\/\S+$/i.test(String(u || ''));
const isManager = (req) => req.user.role === MANAGER;
const isOwner = (rule, req) => rule.created_by === req.user.id;

// ---------- Tên + vai trò nhân viên (người soạn / người gửi / bác sĩ / người duyệt)
const staffInfo = async (ids, authorization) => {
  const list = [...new Set(ids.filter(isUuid))];
  if (!list.length) return {};
  const res = await axios.get('http://localhost:4000/api/identity/users/staff-names', { params: { ids: list.join(',') }, headers: { Authorization: authorization } }).catch(() => null);
  return Object.fromEntries((res?.data?.data || []).map((u) => [u.id, u]));
};
const activeDoctors = async (authorization) => {
  const res = await axios.get('http://localhost:4000/api/identity/users/doctors', { headers: { Authorization: authorization } }).catch(() => null);
  return (res?.data?.data || []).map((d) => ({ id: d.id, name: d.Profile?.full_name || d.email }));
};
const personLabel = (info, id) => {
  if (!id) return 'Hệ thống';
  const u = info[id];
  return u ? `${u.role_label} ${u.name}` : 'Nhân viên';
};

const snapshotOf = (rule, target, sources) => ({
  change_type: rule.change_type, flag: rule.flag, condition: rules.FLAGS[rule.flag], severity: rule.severity, message: rule.message, change_reason: rule.change_reason || null,
  target: target ? { code: target.code, kind: target.kind, label: target.label, keywords: target.keywords, excludes: target.excludes, all_of: target.all_of } : null,
  sources: (sources || []).map((s) => ({ label: s.label, url: s.url })),
});
const logEvent = (rule, req, action, note, snapshot, t) => SafetyRuleEvent.create({
  rule_id: rule.id, actor_id: req?.user?.id || null, actor_role: req?.user?.role || null, action, note: note || null, snapshot: snapshot || null,
}, { transaction: t });

// ---------- Kiểm tra dữ liệu soạn
const validTargetInput = (t) => {
  const keywords = rules.cleanList(t?.keywords);
  if (clip(t?.label, 200).length < 3) throw bad('Nhập tên hoạt chất (ít nhất 3 ký tự)');
  if (!keywords.length) throw bad('Nhập ít nhất 1 từ khóa nhận diện hoạt chất trong bảng thành phần');
  if (keywords.some((k) => k.length > 80 || /[^\p{L}\p{N} .,/+()*-]/u.test(k))) throw bad('Từ khóa chỉ gồm chữ, số, khoảng trắng và dấu * ở cuối');
  return { label: clip(t.label, 200), keywords, excludes: rules.cleanList(t.excludes), all_of: t.all_of === true };
};
const codeFor = async (label, t) => {
  const base = rules.normalize(label).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'HOAT_CHAT';
  for (let i = 1; ; i += 1) {
    const code = i === 1 ? base : `${base}_${i}`;
    if (!await SafetyTarget.count({ where: { code }, transaction: t })) return code;
  }
};

// Trùng: quy tắc đang áp dụng / đang xử lý khác cùng tình trạng + đối tượng (trừ chính nó và quy tắc nó thay thế)
const checkDuplicate = async ({ flag, target_id, selfId, replacesId }, t) => {
  const exclude = [selfId, replacesId].filter(Boolean);
  const dup = await SafetyRule.findOne({
    where: { flag, target_id, status: { [Op.in]: ['ACTIVE', ...OPEN] }, change_type: { [Op.ne]: 'DEACTIVATE' }, ...(exclude.length ? { id: { [Op.notIn]: exclude } } : {}) },
    transaction: t,
  });
  if (!dup) return;
  // Bản sửa của chính quy tắc đang áp dụng kia thì không tính
  if (dup.status !== 'ACTIVE' && dup.replaces_rule_id && dup.replaces_rule_id === replacesId) return;
  throw bad(dup.status === 'ACTIVE' ? 'Đã có quy tắc đang áp dụng cho tình trạng và đối tượng này: hãy dùng "Sửa" ở quy tắc đó' : 'Đã có quy tắc khác đang soạn / chờ duyệt cho tình trạng và đối tượng này', 409);
};

// Đọc + kiểm tra nội dung soạn (tạo mới / sửa). Trả về giá trị đã chuẩn hoá
const readDraft = async (body, { selfId, replacesId } = {}, t) => {
  if (!rules.FLAGS[body.flag]) throw bad('Chọn tình trạng sàng lọc');
  if (!SEVERITIES.includes(body.severity)) throw bad('Chọn mức độ cảnh báo');
  const message = clip(body.message, 500);
  if (message.length < 10) throw bad('Lời nhắc cho bác sĩ / nhân viên ít nhất 10 ký tự');
  const sourceIds = [...new Set((Array.isArray(body.source_ids) ? body.source_ids : []).filter(isUuid))];
  if (sourceIds.length && await SafetySource.count({ where: { id: sourceIds }, transaction: t }) !== sourceIds.length) throw bad('Có nguồn không tồn tại');
  const newSources = (Array.isArray(body.new_sources) ? body.new_sources : []).slice(0, 5).map((s) => {
    const kind = ['LINK', 'DOCUMENT', 'CLINIC'].includes(s?.kind) ? s.kind : 'LINK';
    const label = clip(s?.label, 500);
    if (label.length < 5) throw bad('Tên nguồn ít nhất 5 ký tự (tên tài liệu, tác giả, năm...)');
    if (kind !== 'CLINIC' && !isHttp(s.url)) throw bad(`Nguồn "${label}" cần link tài liệu hoặc file tải lên`);
    return { kind, label, url: kind === 'CLINIC' ? null : clip(s.url, 1000) };
  });
  if (!sourceIds.length && !newSources.length) throw bad('Quy tắc phải có ít nhất 1 nguồn');
  let target = null; let newTarget = null;
  if (body.new_target) newTarget = validTargetInput(body.new_target);
  else {
    if (!isUuid(body.target_id)) throw bad('Chọn hoạt chất / thủ thuật');
    target = await SafetyTarget.findByPk(body.target_id, { transaction: t });
    if (!target || target.status !== 'ACTIVE') throw bad('Hoạt chất / thủ thuật không hợp lệ');
    await checkDuplicate({ flag: body.flag, target_id: target.id, selfId, replacesId }, t);
  }
  return { flag: body.flag, severity: body.severity, message, sourceIds, newSources, target, newTarget };
};
const saveSourcesAndTarget = async (draft, req, t, existingDraftTarget) => {
  const created = [];
  for (const s of draft.newSources) created.push(await SafetySource.create({ ...s, created_by: req.user.id }, { transaction: t }));
  let target = draft.target;
  if (draft.newTarget) {
    if (existingDraftTarget) target = await existingDraftTarget.update(draft.newTarget, { transaction: t });
    else target = await SafetyTarget.create({ ...draft.newTarget, code: await codeFor(draft.newTarget.label, t), kind: 'INGREDIENT', status: 'DRAFT', created_by: req.user.id }, { transaction: t });
  }
  const sources = [...(draft.sourceIds.length ? await SafetySource.findAll({ where: { id: draft.sourceIds }, transaction: t }) : []), ...created];
  return { target, sources };
};
const lockRule = async (id, t) => {
  if (!isUuid(id)) throw bad('Không tìm thấy quy tắc', 404);
  const rule = await SafetyRule.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!rule) throw bad('Không tìm thấy quy tắc', 404);
  return rule;
};

// ---------- Đọc
const getMeta = async (req, res) => {
  try {
    const [targets, sources, doctors] = await Promise.all([
      SafetyTarget.findAll({ where: { status: 'ACTIVE' }, order: [['kind', 'ASC'], ['label', 'ASC']], raw: true }),
      SafetySource.findAll({ order: [['createdAt', 'ASC']], raw: true }),
      activeDoctors(req.headers.authorization),
    ]);
    res.status(200).json({
      data: {
        flags: Object.entries(rules.FLAGS).map(([value, label]) => ({ value, label })),
        severities: SEVERITIES.map((value) => ({ value, label: rules.SEVERITY[value] })),
        targets, sources, doctors, status_labels: STATUS_LABEL, verdicts: VERDICTS, change_labels: CHANGE_LABEL,
      },
    });
  } catch (error) { fail(res, error); }
};

// Gắn đối tượng, nguồn, người soạn (kèm vai trò), ý kiến vòng hiện tại, quy tắc được thay thế
const decorate = async (rows, authorization, { withHistory = false } = {}) => {
  if (!rows.length) return [];
  const replaced = await SafetyRule.findAll({ where: { id: rows.map((r) => r.replaces_rule_id).filter(Boolean) }, raw: true });
  const targetMap = new Map((await SafetyTarget.findAll({ where: { id: [...new Set([...rows, ...replaced].map((r) => r.target_id))] }, raw: true })).map((t) => [t.id, t]));
  const sourceMap = new Map((await SafetySource.findAll({ where: { id: [...new Set(rows.flatMap((r) => r.source_ids || []))] }, raw: true })).map((s) => [s.id, s]));
  const reviews = await SafetyRuleReview.findAll({ where: { rule_id: rows.map((r) => r.id) }, order: [['createdAt', 'ASC']], raw: true });
  const events = withHistory ? await SafetyRuleEvent.findAll({ where: { rule_id: rows.map((r) => r.id) }, order: [['createdAt', 'ASC']], raw: true }) : [];
  // Bản sửa / đề xuất ngưng đang xử lý của các quy tắc đang áp dụng
  const openRevisions = await SafetyRule.findAll({ where: { replaces_rule_id: rows.map((r) => r.id), status: { [Op.in]: OPEN } }, attributes: ['id', 'replaces_rule_id', 'change_type', 'status'], raw: true });
  const info = await staffInfo([...rows.flatMap((r) => [r.created_by, r.decided_by]), ...reviews.map((v) => v.reviewer_id), ...events.map((e) => e.actor_id)], authorization);
  const withVerdict = (v) => ({ ...v, reviewer_name: personLabel(info, v.reviewer_id), verdict_label: VERDICTS[v.verdict] || 'Chưa trả lời' });
  const targetOf = (id) => targetMap.get(id) || null;
  return rows.map((r) => {
    const old = replaced.find((x) => x.id === r.replaces_rule_id);
    return {
      ...r,
      status_label: STATUS_LABEL[r.status], change_label: CHANGE_LABEL[r.change_type] || CHANGE_LABEL.NEW,
      condition: rules.FLAGS[r.flag], severity_label: rules.SEVERITY[r.severity],
      target: targetOf(r.target_id),
      sources: (r.source_ids || []).map((id) => sourceMap.get(id)).filter(Boolean),
      created_by_name: personLabel(info, r.created_by), created_by_role: info[r.created_by]?.role || (r.created_by ? null : 'SYSTEM'),
      decided_by_name: r.decided_by ? personLabel(info, r.decided_by) : null,
      reviews: reviews.filter((v) => v.rule_id === r.id && v.round === r.review_round && r.review_round > 0).map(withVerdict),
      replaces: old ? { id: old.id, version: old.version, status: old.status, status_label: STATUS_LABEL[old.status], flag: old.flag, condition: rules.FLAGS[old.flag], severity: old.severity, severity_label: rules.SEVERITY[old.severity], message: old.message, target: targetMap.get(old.target_id) || null } : null,
      open_revision: openRevisions.find((x) => x.replaces_rule_id === r.id) || null,
      ...(withHistory ? {
        past_reviews: reviews.filter((v) => v.rule_id === r.id && v.round !== r.review_round).map(withVerdict),
        events: events.filter((e) => e.rule_id === r.id).map((e) => ({ ...e, actor_name: personLabel(info, e.actor_id) })),
      } : {}),
    };
  });
};

// GET /safety-rules?status=A,B — quản lý: mọi trạng thái; bác sĩ: chỉ quy tắc đang áp dụng
const listRules = async (req, res) => {
  try {
    let statuses = String(req.query.status || 'ACTIVE').split(',').filter((s) => STATUS_LABEL[s]);
    if (!statuses.length) statuses = ['ACTIVE'];
    if (!isManager(req)) statuses = ['ACTIVE'];
    const rows = await SafetyRule.findAll({ where: { status: { [Op.in]: statuses } }, order: [['updatedAt', 'DESC']], raw: true });
    const counts = isManager(req)
      ? Object.fromEntries((await SafetyRule.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true })).map((x) => [x.status, Number(x.n)]))
      : {};
    res.status(200).json({ data: await decorate(rows, req.headers.authorization), counts });
  } catch (error) { fail(res, error); }
};

// [BÁC SĨ] GET /safety-rules/reviews/mine?status=PENDING|DONE — quy tắc được giao xem xét
const myReviews = async (req, res) => {
  try {
    const pending = req.query.status !== 'DONE';
    const reviews = await SafetyRuleReview.findAll({
      where: { reviewer_id: req.user.id, replaced: false, verdict: pending ? 'PENDING' : { [Op.ne]: 'PENDING' } },
      order: [['updatedAt', 'DESC']], limit: 200, raw: true,
    });
    const list = await decorate(await SafetyRule.findAll({ where: { id: [...new Set(reviews.map((v) => v.rule_id))] }, raw: true }), req.headers.authorization);
    const data = reviews.map((v) => ({ review: v, rule: list.find((r) => r.id === v.rule_id) }))
      .filter((x) => x.rule && (!pending || (x.rule.review_round === x.review.round && x.rule.status === 'IN_REVIEW')));
    res.status(200).json({ data });
  } catch (error) { fail(res, error); }
};

// [BÁC SĨ] GET /safety-rules/proposals/mine — đề xuất của tôi
const myProposals = async (req, res) => {
  try {
    const rows = await SafetyRule.findAll({ where: { created_by: req.user.id, origin: 'DOCTOR' }, order: [['updatedAt', 'DESC']], limit: 200, raw: true });
    res.status(200).json({ data: await decorate(rows, req.headers.authorization) });
  } catch (error) { fail(res, error); }
};

// GET /safety-rules/:id — quản lý xem mọi quy tắc; bác sĩ xem quy tắc đang áp dụng, đề xuất của mình, quy tắc được giao xem xét
const getRule = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) throw bad('Không tìm thấy quy tắc', 404);
    const rule = await SafetyRule.findByPk(req.params.id, { raw: true });
    if (!rule) throw bad('Không tìm thấy quy tắc', 404);
    if (!isManager(req) && !['ACTIVE', 'SUPERSEDED', 'INACTIVE'].includes(rule.status) && !isOwner(rule, req)
      && !await SafetyRuleReview.count({ where: { rule_id: rule.id, reviewer_id: req.user.id } })) throw bad('Bạn không được xem quy tắc này', 403);
    const [data] = await decorate([rule], req.headers.authorization, { withHistory: true });
    res.status(200).json({ data });
  } catch (error) { fail(res, error); }
};

// ---------- Soạn / sửa
// POST /safety-rules — quản lý soạn (Nháp) / bác sĩ đề xuất (body.submit = true: gửi luôn cho quản lý)
const createRule = async (req, res) => {
  try {
    const doctor = req.user.role === 'DOCTOR';
    const rule = await sequelize.transaction(async (t) => {
      const draft = await readDraft(req.body, {}, t);
      const { target, sources } = await saveSourcesAndTarget(draft, req, t);
      const submit = doctor && req.body.submit === true;
      const row = await SafetyRule.create({
        flag: draft.flag, target_id: target.id, severity: draft.severity, message: draft.message,
        source_ids: sources.map((s) => s.id), status: submit ? 'PROPOSED' : 'DRAFT', origin: doctor ? 'DOCTOR' : 'MANAGER', created_by: req.user.id,
        change_type: 'NEW', version: 1, submitted_at: submit ? new Date() : null, change_reason: clip(req.body.change_reason, 1000) || null,
      }, { transaction: t });
      await logEvent(row, req, 'CREATED', null, snapshotOf(row, target, sources), t);
      if (submit) await logEvent(row, req, 'PROPOSED', null, null, t);
      return row;
    });
    res.status(201).json({
      message: doctor ? (rule.status === 'PROPOSED' ? 'Đã gửi đề xuất cho quản lý' : 'Đã lưu nháp đề xuất') : 'Đã lưu nháp. Chọn bác sĩ xem xét để gửi duyệt',
      data: rule,
    });
  } catch (error) { fail(res, error); }
};

// POST /safety-rules/:id/revise { change_type: EDIT|DEACTIVATE, reason } — sửa / ngưng quy tắc đang áp dụng: tạo bản mới (Nháp)
const reviseRule = async (req, res) => {
  try {
    const changeType = req.body.change_type === 'DEACTIVATE' ? 'DEACTIVATE' : 'EDIT';
    const reason = clip(req.body.reason, 1000);
    if (reason.length < 10) throw bad(changeType === 'DEACTIVATE' ? 'Ghi lý do ngưng áp dụng (ít nhất 10 ký tự)' : 'Ghi lý do cần sửa (ít nhất 10 ký tự)');
    const doctor = req.user.role === 'DOCTOR';
    const row = await sequelize.transaction(async (t) => {
      const active = await lockRule(req.params.id, t);
      if (active.status !== 'ACTIVE') throw bad('Chỉ sửa / ngưng được quy tắc đang áp dụng');
      const open = await SafetyRule.findOne({ where: { replaces_rule_id: active.id, status: { [Op.in]: OPEN } }, transaction: t });
      if (open) throw bad('Quy tắc này đang có 1 bản sửa / đề xuất ngưng chưa xử lý xong', 409);
      const created = await SafetyRule.create({
        flag: active.flag, target_id: active.target_id, severity: active.severity, message: active.message, source_ids: active.source_ids,
        status: 'DRAFT', origin: doctor ? 'DOCTOR' : 'MANAGER', created_by: req.user.id,
        change_type: changeType, replaces_rule_id: active.id, change_reason: reason, version: (active.version || 1) + 1,
      }, { transaction: t });
      await logEvent(created, req, 'REVISION_CREATED', `${CHANGE_LABEL[changeType]} (phiên bản ${active.version || 1} -> ${created.version}): ${reason}`, null, t);
      await logEvent(active, req, 'REVISION_CREATED', `${doctor ? 'Bác sĩ' : 'Quản lý'} tạo ${changeType === 'DEACTIVATE' ? 'đề xuất ngưng' : 'bản sửa'}: ${reason}`, null, t);
      return created;
    });
    res.status(201).json({ message: changeType === 'DEACTIVATE' ? 'Đã tạo đề xuất ngưng (Nháp). Gửi đi để xử lý' : 'Đã tạo bản sửa (Nháp). Sửa nội dung rồi gửi đi', data: row });
  } catch (error) { fail(res, error); }
};

// PUT /safety-rules/:id — sửa nội dung. Quản lý: quy tắc quản lý soạn (Nháp / Chờ xem xét / Đã xem xét) => về Nháp.
// Bác sĩ: đề xuất của mình ở Nháp / Quản lý yêu cầu sửa. Đề xuất NGƯNG không sửa nội dung (chỉ lý do qua tạo lại).
const updateRule = async (req, res) => {
  try {
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (rule.change_type === 'DEACTIVATE') throw bad('Đề xuất ngưng không sửa nội dung; từ chối rồi tạo đề xuất mới nếu cần');
      if (isManager(req)) {
        if (rule.origin !== 'MANAGER') throw bad('Không sửa đề xuất của bác sĩ: dùng "Yêu cầu sửa" để trả về bác sĩ', 403);
        if (!['DRAFT', 'IN_REVIEW', 'REVIEWED'].includes(rule.status)) throw bad('Quy tắc ở trạng thái này không sửa được');
      } else {
        if (!isOwner(rule, req) || rule.origin !== 'DOCTOR') throw bad('Bạn chỉ sửa được đề xuất của mình', 403);
        if (!['DRAFT', 'CHANGES_REQUESTED'].includes(rule.status)) throw bad('Đề xuất đang chờ quản lý xử lý, chưa sửa được');
      }
      const oldTarget = await SafetyTarget.findByPk(rule.target_id, { transaction: t });
      const draft = await readDraft(req.body, { selfId: rule.id, replacesId: rule.replaces_rule_id }, t);
      const { target, sources } = await saveSourcesAndTarget(draft, req, t, oldTarget?.status === 'DRAFT' ? oldTarget : null);
      const wasInReview = ['IN_REVIEW', 'REVIEWED'].includes(rule.status);
      if (wasInReview) await SafetyRuleReview.update({ replaced: true }, { where: { rule_id: rule.id, round: rule.review_round, verdict: 'PENDING' }, transaction: t });
      await rule.update({
        flag: draft.flag, target_id: target.id, severity: draft.severity, message: draft.message, source_ids: sources.map((s) => s.id),
        status: isManager(req) ? 'DRAFT' : rule.status, change_reason: req.body.change_reason !== undefined ? (clip(req.body.change_reason, 1000) || rule.change_reason) : rule.change_reason,
      }, { transaction: t });
      await logEvent(rule, req, 'EDITED', wasInReview ? 'Sửa nội dung: ý kiến bác sĩ của vòng trước hết hiệu lực, cần gửi xem xét lại' : null, snapshotOf(rule, target, sources), t);
    });
    res.status(200).json({ message: isManager(req) ? 'Đã lưu. Quy tắc về Nháp, cần gửi bác sĩ xem xét' : 'Đã lưu đề xuất. Bấm "Gửi quản lý" khi xong' });
  } catch (error) { fail(res, error); }
};

// [BÁC SĨ] POST /safety-rules/:id/propose — gửi đề xuất cho quản lý (lần đầu hoặc sau khi sửa theo yêu cầu)
const proposeRule = async (req, res) => {
  try {
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (!isOwner(rule, req) || rule.origin !== 'DOCTOR') throw bad('Bạn chỉ gửi được đề xuất của mình', 403);
      if (!['DRAFT', 'CHANGES_REQUESTED'].includes(rule.status)) throw bad('Đề xuất đã được gửi');
      if (rule.replaces_rule_id && (await SafetyRule.findByPk(rule.replaces_rule_id, { transaction: t }))?.status !== 'ACTIVE') throw bad('Quy tắc gốc không còn áp dụng');
      await rule.update({ status: 'PROPOSED', submitted_at: new Date() }, { transaction: t });
      await logEvent(rule, req, 'PROPOSED', clip(req.body.note, 1000), null, t);
    });
    res.status(200).json({ message: 'Đã gửi đề xuất cho quản lý' });
  } catch (error) { fail(res, error); }
};

// [QUẢN LÝ] POST /safety-rules/:id/request-changes { note } — trả đề xuất của bác sĩ về để sửa
const requestChanges = async (req, res) => {
  try {
    const note = clip(req.body.note, 1000);
    if (note.length < 10) throw bad('Ghi rõ nội dung cần bác sĩ sửa (ít nhất 10 ký tự)');
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (rule.origin !== 'DOCTOR' || !['PROPOSED', 'REVIEWED'].includes(rule.status)) throw bad('Chỉ yêu cầu sửa được đề xuất của bác sĩ đang chờ quản lý');
      await rule.update({ status: 'CHANGES_REQUESTED', decision_note: note }, { transaction: t });
      await logEvent(rule, req, 'CHANGES_REQUESTED', note, null, t);
    });
    res.status(200).json({ message: 'Đã trả đề xuất về bác sĩ kèm yêu cầu sửa' });
  } catch (error) { fail(res, error); }
};

// [QUẢN LÝ] POST /safety-rules/:id/submit { reviewer_ids } — gửi bác sĩ xem xét (quy tắc quản lý soạn: bắt buộc; đề xuất của bác sĩ: tùy chọn, gửi thêm)
const submitRule = async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body.reviewer_ids) ? req.body.reviewer_ids : []).filter(isUuid))];
    if (!ids.length) throw bad('Chọn ít nhất 1 bác sĩ xem xét');
    const doctors = await activeDoctors(req.headers.authorization);
    if (ids.some((id) => !doctors.find((d) => d.id === id))) throw bad('Chỉ chọn được bác sĩ đang làm việc');
    const names = Object.fromEntries(doctors.map((d) => [d.id, d.name]));
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      const allowed = rule.origin === 'DOCTOR' ? ['PROPOSED'] : ['DRAFT'];
      if (!allowed.includes(rule.status)) throw bad(rule.origin === 'DOCTOR' ? 'Chỉ gửi thêm bác sĩ khi đề xuất đang chờ quản lý' : 'Chỉ gửi xem xét được quy tắc ở trạng thái Nháp');
      if (ids.includes(rule.created_by)) throw bad('Không chọn chính bác sĩ đề xuất để xem xét');
      if (rule.replaces_rule_id && (await SafetyRule.findByPk(rule.replaces_rule_id, { transaction: t }))?.status !== 'ACTIVE') throw bad('Quy tắc gốc không còn áp dụng');
      const round = rule.review_round + 1;
      await rule.update({ status: 'IN_REVIEW', review_round: round, submitted_at: new Date() }, { transaction: t });
      await SafetyRuleReview.bulkCreate(ids.map((reviewer_id) => ({ rule_id: rule.id, round, reviewer_id })), { transaction: t });
      await logEvent(rule, req, 'SUBMITTED', `Vòng ${round}: gửi ${ids.map((id) => `Bác sĩ ${names[id] || ''}`.trim()).join(', ')}`, null, t);
    });
    res.status(200).json({ message: 'Đã gửi bác sĩ xem xét' });
  } catch (error) { fail(res, error); }
};

// [QUẢN LÝ] POST /safety-rules/:id/reviewers { replace_id, reviewer_id } — bác sĩ chậm trả lời: đổi sang bác sĩ khác
const replaceReviewer = async (req, res) => {
  try {
    const { replace_id, reviewer_id } = req.body;
    if (!isUuid(replace_id) || !isUuid(reviewer_id) || replace_id === reviewer_id) throw bad('Chọn bác sĩ cần đổi và bác sĩ thay thế');
    const doctors = await activeDoctors(req.headers.authorization);
    if (!doctors.find((d) => d.id === reviewer_id)) throw bad('Chỉ chọn được bác sĩ đang làm việc');
    const names = Object.fromEntries(doctors.map((d) => [d.id, d.name]));
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (rule.status !== 'IN_REVIEW') throw bad('Quy tắc không ở trạng thái chờ bác sĩ xem xét');
      if (reviewer_id === rule.created_by) throw bad('Không chọn chính bác sĩ đề xuất để xem xét');
      const old = await SafetyRuleReview.findOne({ where: { rule_id: rule.id, round: rule.review_round, reviewer_id: replace_id, replaced: false }, transaction: t });
      if (!old || old.verdict !== 'PENDING') throw bad('Chỉ đổi được bác sĩ chưa trả lời');
      if (await SafetyRuleReview.count({ where: { rule_id: rule.id, round: rule.review_round, reviewer_id, replaced: false }, transaction: t })) throw bad('Bác sĩ này đã có trong danh sách xem xét');
      await old.update({ replaced: true }, { transaction: t });
      await SafetyRuleReview.create({ rule_id: rule.id, round: rule.review_round, reviewer_id }, { transaction: t });
      await logEvent(rule, req, 'REVIEWER_REPLACED', `Đổi Bác sĩ ${names[replace_id] || ''} sang Bác sĩ ${names[reviewer_id] || ''}`, null, t);
    });
    res.status(200).json({ message: 'Đã đổi bác sĩ xem xét' });
  } catch (error) { fail(res, error); }
};

// [BÁC SĨ] POST /safety-rules/:id/review { verdict, comment }
const reviewRule = async (req, res) => {
  try {
    const { verdict } = req.body;
    if (!VERDICTS[verdict]) throw bad('Chọn Đồng ý / Cần sửa / Không đồng ý');
    const comment = clip(req.body.comment, 2000);
    if (verdict !== 'AGREE' && comment.length < 10) throw bad('Ghi rõ lý do / nội dung cần sửa (ít nhất 10 ký tự)');
    let done = false;
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (rule.status !== 'IN_REVIEW') throw bad('Quy tắc không còn chờ xem xét (có thể quản lý vừa sửa hoặc từ chối)');
      const review = await SafetyRuleReview.findOne({ where: { rule_id: rule.id, round: rule.review_round, reviewer_id: req.user.id, replaced: false }, transaction: t });
      if (!review) throw bad('Bạn không được giao xem xét quy tắc này', 403);
      if (review.verdict !== 'PENDING') throw bad('Bạn đã trả lời quy tắc này');
      await review.update({ verdict, comment: comment || null, responded_at: new Date() }, { transaction: t });
      await logEvent(rule, req, 'REVIEWED', `${VERDICTS[verdict]}${comment ? `: ${comment}` : ''}`, null, t);
      const left = await SafetyRuleReview.count({ where: { rule_id: rule.id, round: rule.review_round, replaced: false, verdict: 'PENDING' }, transaction: t });
      if (!left) { await rule.update({ status: 'REVIEWED' }, { transaction: t }); done = true; }
    });
    res.status(200).json({ message: done ? 'Đã gửi ý kiến. Các bác sĩ đã trả lời đủ, quy tắc chuyển cho quản lý' : 'Đã gửi ý kiến' });
  } catch (error) { fail(res, error); }
};

// [QUẢN LÝ] POST /safety-rules/:id/approve { note }
// Quy tắc quản lý soạn: phải qua bác sĩ xem xét (Đã xem xét, mọi bác sĩ Đồng ý). Đề xuất của bác sĩ: duyệt khi đang chờ quản lý,
// hoặc sau khi các bác sĩ được gửi thêm đều Đồng ý. Bản sửa: bản cũ -> "Đã thay". Đề xuất ngưng: bản cũ -> "Đã ngưng".
const approveRule = async (req, res) => {
  try {
    let message = 'Đã duyệt: quy tắc bắt đầu áp dụng';
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      const direct = rule.origin === 'DOCTOR' && rule.status === 'PROPOSED';
      if (!direct && rule.status !== 'REVIEWED') {
        throw bad(rule.origin === 'MANAGER' && rule.status === 'DRAFT' ? 'Quy tắc quản lý soạn phải gửi bác sĩ xem xét trước khi duyệt' : 'Quy tắc chưa ở trạng thái duyệt được');
      }
      if (!direct) {
        const reviews = await SafetyRuleReview.findAll({ where: { rule_id: rule.id, round: rule.review_round, replaced: false }, transaction: t });
        if (!reviews.length || reviews.some((v) => v.verdict === 'PENDING')) throw bad('Còn bác sĩ chưa trả lời');
        if (reviews.some((v) => v.verdict !== 'AGREE')) throw bad('Có bác sĩ chọn Cần sửa / Không đồng ý: sửa rồi gửi lại, yêu cầu bác sĩ sửa, hoặc từ chối');
      }
      const now = new Date();
      const note = clip(req.body.note, 1000) || null;
      const old = rule.replaces_rule_id ? await SafetyRule.findByPk(rule.replaces_rule_id, { transaction: t, lock: t.LOCK.UPDATE }) : null;
      if (rule.replaces_rule_id && old?.status !== 'ACTIVE') throw bad('Quy tắc gốc không còn áp dụng');
      if (rule.change_type === 'DEACTIVATE') {
        await old.update({ status: 'INACTIVE', decided_by: req.user.id, decided_at: now }, { transaction: t });
        await rule.update({ status: 'APPLIED', decided_by: req.user.id, decided_at: now, decision_note: note }, { transaction: t });
        await logEvent(old, req, 'DEACTIVATED', `Ngưng áp dụng theo đề xuất phiên bản ${rule.version}: ${rule.change_reason}`, null, t);
        await logEvent(rule, req, 'APPROVED', note, null, t);
        message = 'Đã duyệt: quy tắc ngưng áp dụng';
        return;
      }
      await checkDuplicate({ flag: rule.flag, target_id: rule.target_id, selfId: rule.id, replacesId: rule.replaces_rule_id }, t);
      const target = await SafetyTarget.findByPk(rule.target_id, { transaction: t });
      if (target.status === 'DRAFT') await target.update({ status: 'ACTIVE' }, { transaction: t });
      if (old) {
        await old.update({ status: 'SUPERSEDED', decided_by: req.user.id, decided_at: now }, { transaction: t });
        await logEvent(old, req, 'SUPERSEDED', `Thay bằng phiên bản ${rule.version}`, null, t);
        message = `Đã duyệt: phiên bản ${rule.version} thay cho phiên bản ${old.version || 1}`;
      }
      await rule.update({ status: 'ACTIVE', decided_by: req.user.id, decided_at: now, decision_note: note }, { transaction: t });
      const sources = await SafetySource.findAll({ where: { id: rule.source_ids }, transaction: t });
      await logEvent(rule, req, 'APPROVED', note, snapshotOf(rule, target, sources), t);
    });
    await rules.reload();
    res.status(200).json({ message });
  } catch (error) { fail(res, error); }
};

// [QUẢN LÝ] POST /safety-rules/:id/reject { note }
const rejectRule = async (req, res) => {
  try {
    const note = clip(req.body.note, 1000);
    if (note.length < 10) throw bad('Ghi lý do từ chối (ít nhất 10 ký tự)');
    await sequelize.transaction(async (t) => {
      const rule = await lockRule(req.params.id, t);
      if (!OPEN.includes(rule.status)) throw bad('Quy tắc không ở trạng thái từ chối được');
      if (rule.origin === 'DOCTOR' && rule.status === 'DRAFT') throw bad('Bác sĩ chưa gửi đề xuất này');
      await rule.update({ status: 'REJECTED', decided_by: req.user.id, decided_at: new Date(), decision_note: note }, { transaction: t });
      await SafetyRuleReview.update({ replaced: true }, { where: { rule_id: rule.id, round: rule.review_round, verdict: 'PENDING' }, transaction: t });
      await logEvent(rule, req, 'REJECTED', note, null, t);
    });
    res.status(200).json({ message: 'Đã từ chối' });
  } catch (error) { fail(res, error); }
};

// ---------- Xem trước / thử
const previewTarget = async (req, res) => {
  try {
    const kind = req.body.kind === 'PROCEDURE' ? 'PROCEDURE' : 'INGREDIENT';
    const t = { keywords: rules.cleanList(req.body.keywords), excludes: rules.cleanList(req.body.excludes), all_of: req.body.all_of === true };
    if (!t.keywords.length) return res.status(200).json({ data: { products: [], services: [], total_products: 0 } });
    const match = rules.compileTarget(t);
    if (kind === 'INGREDIENT') {
      const catalog = (await axios.get('http://localhost:4000/api/commerce/products/safety-catalog', { headers: { Authorization: req.headers.authorization } })).data.data || [];
      return res.status(200).json({ data: { products: catalog.filter((p) => match(`${p.name} ${p.ingredients}`)).map((p) => ({ id: p.id, name: p.name, prescription: p.prescription })), total_products: catalog.length, services: [] } });
    }
    const [svc, pkg] = await Promise.all([SpaService.findAll({ attributes: ['id', 'name'], raw: true }), TreatmentPackage.findAll({ attributes: ['id', 'name', 'description'], raw: true })]);
    res.status(200).json({ data: { products: [], services: [...svc.filter((s) => match(s.name)).map((s) => ({ id: s.id, name: s.name, type: 'Dịch vụ' })), ...pkg.filter((p) => match(`${p.name} ${p.description || ''}`)).map((p) => ({ id: p.id, name: p.name, type: 'Gói' }))] } });
  } catch (error) { fail(res, error); }
};

// POST /safety-rules/test { rule, replaces_rule_id?, change_type?, scenario } — chạy bảng quy tắc đang dùng + quy tắc nháp (bản sửa thì thay bản cũ)
const testRule = async (req, res) => {
  try {
    const r = req.body.rule || {};
    const sc = req.body.scenario || {};
    let draft = null;
    if (rules.FLAGS[r.flag] && SEVERITIES.includes(r.severity)) {
      let target;
      if (r.new_target) { const v = validTargetInput(r.new_target); target = { ...v, code: '__DRAFT__', kind: 'INGREDIENT' }; }
      else if (isUuid(r.target_id)) { const row = await SafetyTarget.findByPk(r.target_id, { raw: true }); if (row) target = row; }
      if (target) draft = { target: { code: target.code, kind: target.kind, label: target.label, keywords: target.keywords, excludes: target.excludes, all_of: target.all_of }, rule: { flag: r.flag, target: target.code, severity: r.severity, message: clip(r.message, 500) || '(lời nhắc của quy tắc nháp)', source_ids: [], id: '__DRAFT__' } };
    }
    const store = rules.storeWith(draft, { removeRuleId: isUuid(req.body.replaces_rule_id) ? req.body.replaces_rule_id : null, deactivate: req.body.change_type === 'DEACTIVATE' });
    const flags = (Array.isArray(sc.flags) ? sc.flags : []).filter((f) => rules.FLAGS[f]);
    const ids = (list) => (Array.isArray(list) ? list : []).filter(isUuid).slice(0, 20);
    const [products, svc, pkg] = await Promise.all([
      ids(sc.product_ids).length ? axios.get('http://localhost:4000/api/commerce/products/safety-info', { params: { ids: ids(sc.product_ids).join(',') }, headers: { Authorization: req.headers.authorization } }).then((x) => x.data.data || []) : [],
      ids(sc.service_ids).length ? SpaService.findAll({ where: { id: ids(sc.service_ids) }, attributes: ['name'], raw: true }) : [],
      ids(sc.package_ids).length ? TreatmentPackage.findAll({ where: { id: ids(sc.package_ids) }, attributes: ['name', 'description'], raw: true }) : [],
    ]);
    const items = [
      ...svc.map((s) => ({ name: s.name, targets: rules.proceduresOf(s.name, store), text: '' })),
      ...pkg.map((p) => ({ name: p.name, targets: rules.proceduresOf(`${p.name} ${p.description || ''}`, store), text: '' })),
      ...products.map((p) => ({ name: p.name, targets: rules.ingredientsOf(p.ingredients, store), text: `${p.name} ${p.ingredients || ''}`, no_ingredients: !p.ingredients })),
    ];
    const warnings = rules.evaluate({ flags, allergies: clip(sc.allergies, 500), items }, store)
      .map((w) => ({ ...w, from_draft: !!draft && req.body.change_type !== 'DEACTIVATE' && w.code === `${draft.rule.flag}:${draft.rule.target}` }));
    res.status(200).json({ data: { warnings, items: items.map((i) => ({ name: i.name, targets: i.targets.map((c) => rules.targetLabel(c, store)), no_ingredients: !!i.no_ingredients })) } });
  } catch (error) { fail(res, error); }
};

module.exports = {
  getMeta, listRules, myReviews, myProposals, getRule, createRule, reviseRule, updateRule, proposeRule, requestChanges,
  submitRule, replaceReviewer, reviewRule, approveRule, rejectRule, previewTarget, testRule, STATUS_LABEL,
};
