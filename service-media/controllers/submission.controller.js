const { Op } = require('sequelize');
const { sequelize, Article, ArticleSubmission, ArticleReview } = require('../models');
const { text, optionalUrl, stringList, checkContentMedia } = require('../utils/validate');
const { uniqueSlug } = require('./news.controller');
const { ARTICLE_TYPES } = require('../utils/articleTypes');

// Quy trình: bác sĩ soạn (DRAFT) -> gửi duyệt (PENDING) -> quản lý duyệt (APPROVED, tự đăng lên web)
// hoặc yêu cầu chỉnh sửa (CHANGES_REQUESTED, kèm lý do) -> bác sĩ sửa và gửi lại (PENDING, phiên bản + 1).
// Mỗi lần gửi lưu snapshot nội dung vào ArticleReviews nên bài cũ không bị mất.
const MANAGER_ROLES = ['ADMIN', 'GEN_MANAGER'];
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED', 'APPROVED'];
const CONTENT_FIELDS = ['title', 'summary', 'content', 'thumbnail_url', 'video_url', 'tags', 'sources', 'author_title'];
const MIN_CONTENT = 300;

const isManager = (user) => MANAGER_ROLES.includes(user.role);
const snapshotOf = (s) => Object.fromEntries(CONTENT_FIELDS.map((k) => [k, s[k]]));

// Tên + ảnh bác sĩ lấy từ service-identity (token chỉ chứa id, role) để tác giả không tự khai tên người khác
const fetchDoctor = async (doctorId) => {
  try {
    const base = (process.env.IDENTITY_SERVICE_URL || 'http://localhost:4001').replace(/\/+$/, '');
    const res = await fetch(`${base}/users/doctors/public`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const { data } = await res.json();
    return (data || []).find((d) => d.id === doctorId) || null;
  } catch {
    return null;
  }
};

const pickFields = (body) => {
  const data = {};
  for (const key of ['title', 'summary', 'content', 'author_title']) {
    if (body[key] !== undefined) data[key] = text(body[key]);
  }
  if (data.title !== undefined && (!data.title || data.title.length > 200)) throw new Error('Tiêu đề từ 1 đến 200 ký tự');
  if (data.summary !== undefined && data.summary.length > 500) throw new Error('Tóm tắt tối đa 500 ký tự');
  if (data.author_title !== undefined && data.author_title.length > 120) throw new Error('Chức danh tối đa 120 ký tự');
  if (data.content !== undefined) {
    if (data.content.length > 50000) throw new Error('Nội dung tối đa 50.000 ký tự');
    checkContentMedia(data.content);
  }
  if (body.thumbnail_url !== undefined) data.thumbnail_url = optionalUrl(body.thumbnail_url, 'Ảnh bìa');
  if (body.video_url !== undefined) data.video_url = optionalUrl(body.video_url, 'Video');
  if (body.tags !== undefined) data.tags = stringList(body.tags, { max: 10, maxLength: 40, separator: /[,\n]/ });
  if (body.sources !== undefined) data.sources = stringList(body.sources, { max: 30, maxLength: 500 });
  return data;
};

// Điều kiện tối thiểu của một bài nghiên cứu trước khi gửi duyệt
const readyToSubmit = (s) => {
  if (!s.title) return 'Vui lòng nhập tiêu đề';
  if (!s.summary || s.summary.length < 30) return 'Tóm tắt cần ít nhất 30 ký tự';
  if (!s.content || s.content.length < MIN_CONTENT) return `Nội dung cần ít nhất ${MIN_CONTENT} ký tự`;
  if (!s.thumbnail_url) return 'Vui lòng tải ảnh bìa';
  return null;
};

const loadOwn = async (req, res) => {
  const submission = await ArticleSubmission.findByPk(req.params.id);
  if (!submission || (submission.author_id !== req.user.id && !isManager(req.user))) {
    res.status(404).json({ message: 'Không tìm thấy bài viết' });
    return null;
  }
  return submission;
};

const logReview = (submission, action, req, note, transaction) => ArticleReview.create({
  submission_id: submission.id,
  version: submission.version,
  action,
  note: note || null,
  actor_id: req.user.id,
  actor_role: req.user.role,
  snapshot: action === 'SUBMITTED' ? snapshotOf(submission) : null,
}, { transaction });

// [DOCTOR] GET /submissions/mine
const getMySubmissions = async (req, res) => {
  try {
    const rows = await ArticleSubmission.findAll({
      where: { author_id: req.user.id },
      attributes: { exclude: ['content'] },
      order: [['updatedAt', 'DESC']],
    });
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [MANAGER] GET /submissions?status= — bản nháp chưa gửi lần nào là của riêng bác sĩ nên không hiện
const getSubmissionsForManager = async (req, res) => {
  try {
    const where = { version: { [Op.gt]: 0 } };
    if (req.query.status) where.status = String(req.query.status);
    const rows = await ArticleSubmission.findAll({ where, attributes: { exclude: ['content'] }, order: [['submitted_at', 'DESC']] });
    const pending = await ArticleSubmission.count({ where: { status: 'PENDING' } });
    res.json({ data: rows, pending });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// GET /submissions/:id — kèm lịch sử duyệt và các phiên bản đã gửi
const getSubmission = async (req, res) => {
  try {
    const submission = await loadOwn(req, res);
    if (!submission) return;
    const reviews = await ArticleReview.findAll({ where: { submission_id: submission.id }, order: [['createdAt', 'DESC']] });
    const article = submission.article_id
      ? await Article.findByPk(submission.article_id, { attributes: ['id', 'slug', 'status', 'published_at', 'view_count'] })
      : null;
    res.json({ data: { ...submission.toJSON(), reviews, article } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [DOCTOR] POST /submissions — tạo bản nháp (submit=true thì gửi duyệt luôn)
const createSubmission = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const data = pickFields(req.body);
    if (!data.title) throw new Error('Vui lòng nhập tiêu đề');
    const doctor = await fetchDoctor(req.user.id);
    const submission = await ArticleSubmission.create({
      ...data,
      category: ARTICLE_TYPES.RESEARCH, // bài bác sĩ gửi luôn thuộc loại Nghiên cứu
      author_id: req.user.id,
      author_name: doctor?.full_name || 'Bác sĩ GlowSkin',
      author_avatar: doctor?.avatar || null,
    }, { transaction: t });

    if (req.body.submit) {
      const error = readyToSubmit(submission);
      if (error) throw new Error(error);
      await submission.update({ status: 'PENDING', version: 1, submitted_at: new Date() }, { transaction: t });
      await logReview(submission, 'SUBMITTED', req, null, t);
    }
    await t.commit();
    res.status(201).json({ message: req.body.submit ? 'Đã gửi bài cho quản lý duyệt' : 'Đã lưu bản nháp', data: submission });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// [DOCTOR] PUT /submissions/:id — sửa bài (nháp, bị yêu cầu chỉnh sửa, hoặc bài đã đăng muốn cập nhật)
const updateSubmission = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const submission = await ArticleSubmission.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!submission || submission.author_id !== req.user.id) {
      await t.rollback();
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }
    if (!EDITABLE.includes(submission.status)) throw new Error('Bài đang chờ duyệt, hãy rút lại trước khi sửa');

    const data = pickFields(req.body);
    const doctor = await fetchDoctor(req.user.id);
    if (doctor) Object.assign(data, { author_name: doctor.full_name, author_avatar: doctor.avatar });
    // Sửa bài đã đăng => thành bản nháp mới; bài trên web giữ nguyên cho tới khi quản lý duyệt bản sửa
    if (submission.status === 'APPROVED') data.status = 'DRAFT';
    await submission.update(data, { transaction: t });

    if (req.body.submit) {
      const error = readyToSubmit(submission);
      if (error) throw new Error(error);
      await submission.update({ status: 'PENDING', version: submission.version + 1, submitted_at: new Date() }, { transaction: t });
      await logReview(submission, 'SUBMITTED', req, text(req.body.note).slice(0, 1000), t);
    }
    await t.commit();
    res.json({ message: req.body.submit ? 'Đã gửi bài cho quản lý duyệt' : 'Đã lưu thay đổi', data: submission });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// [DOCTOR] POST /submissions/:id/withdraw — rút bài đang chờ duyệt về để sửa tiếp
const withdrawSubmission = async (req, res) => {
  try {
    const [count] = await ArticleSubmission.update(
      { status: 'DRAFT' },
      { where: { id: req.params.id, author_id: req.user.id, status: 'PENDING' } }
    );
    if (!count) return res.status(400).json({ message: 'Chỉ rút được bài của bạn đang chờ duyệt' });
    const submission = await ArticleSubmission.findByPk(req.params.id);
    await logReview(submission, 'WITHDRAWN', req);
    res.json({ message: 'Đã rút bài về bản nháp' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [DOCTOR] DELETE /submissions/:id — chỉ xóa được bản nháp chưa từng gửi duyệt
const deleteSubmission = async (req, res) => {
  try {
    const count = await ArticleSubmission.destroy({ where: { id: req.params.id, author_id: req.user.id, status: 'DRAFT', version: 0 } });
    if (!count) return res.status(400).json({ message: 'Chỉ xóa được bản nháp chưa gửi duyệt lần nào' });
    res.json({ message: 'Đã xóa bản nháp' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [MANAGER] POST /submissions/:id/approve — duyệt và tự động đăng (hoặc cập nhật bài đã đăng)
const approveSubmission = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const submission = await ArticleSubmission.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!submission) throw new Error('Không tìm thấy bài viết');
    if (submission.status !== 'PENDING') throw new Error('Bài không còn ở trạng thái chờ duyệt');

    const fields = {
      title: submission.title,
      summary: submission.summary,
      content: submission.content,
      thumbnail_url: submission.thumbnail_url,
      video_url: submission.video_url,
      category: ARTICLE_TYPES.RESEARCH,
      tags: submission.tags,
      sources: submission.sources,
      author_id: submission.author_id,
      author_name: submission.author_name,
      author_title: submission.author_title,
      author_avatar: submission.author_avatar,
      article_type: 'RESEARCH',
      updated_by: req.user.id,
    };
    if (req.body.is_featured !== undefined) fields.is_featured = !!req.body.is_featured;

    let article = submission.article_id ? await Article.findByPk(submission.article_id, { transaction: t }) : null;
    if (article) {
      await article.update({ ...fields, status: 'PUBLISHED' }, { transaction: t });
    } else {
      article = await Article.create({
        ...fields, slug: uniqueSlug(submission.title), status: 'PUBLISHED', published_at: new Date(), submission_id: submission.id,
      }, { transaction: t });
    }

    const note = text(req.body.note).slice(0, 2000);
    await submission.update({
      status: 'APPROVED', article_id: article.id, reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note || null,
    }, { transaction: t });
    await logReview(submission, 'APPROVED', req, note, t);
    await t.commit();
    res.json({ message: 'Đã duyệt và đăng bài lên website', data: { article_id: article.id, slug: article.slug } });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

// [MANAGER] POST /submissions/:id/request-changes — không duyệt, bắt buộc ghi lý do / yêu cầu chỉnh sửa
const requestChanges = async (req, res) => {
  const note = text(req.body.note);
  if (note.length < 10) return res.status(400).json({ message: 'Vui lòng ghi rõ lý do / nội dung cần chỉnh sửa (ít nhất 10 ký tự)' });
  if (note.length > 2000) return res.status(400).json({ message: 'Lý do tối đa 2.000 ký tự' });
  const t = await sequelize.transaction();
  try {
    const submission = await ArticleSubmission.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!submission) throw new Error('Không tìm thấy bài viết');
    if (submission.status !== 'PENDING') throw new Error('Bài không còn ở trạng thái chờ duyệt');
    await submission.update({ status: 'CHANGES_REQUESTED', reviewed_by: req.user.id, reviewed_at: new Date(), review_note: note }, { transaction: t });
    await logReview(submission, 'CHANGES_REQUESTED', req, note, t);
    await t.commit();
    res.json({ message: 'Đã gửi yêu cầu chỉnh sửa cho bác sĩ' });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getMySubmissions, getSubmissionsForManager, getSubmission, createSubmission, updateSubmission,
  withdrawSubmission, deleteSubmission, approveSubmission, requestChanges, MANAGER_ROLES,
};
