const { Op } = require('sequelize');
const { Article } = require('../models');

const toSlug = (text = '') =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const getPublishedArticles = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 9, 50);
    const { category, q } = req.query;

    const where = { status: 'PUBLISHED' };
    if (category) where.category = category;
    if (q) where.title = { [Op.iLike]: `%${q}%` };

    const { rows, count } = await Article.findAndCountAll({
      where,
      attributes: { exclude: ['content'] },
      order: [['published_at', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    res.status(200).json({
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server khi lấy tin tức', error: error.message });
  }
};

const getArticleBySlug = async (req, res) => {
  try {
    const article = await Article.findOne({ where: { slug: req.params.slug, status: 'PUBLISHED' } });
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    res.status(200).json({ data: article });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getAllArticlesForAdmin = async (req, res) => {
  try {
    const articles = await Article.findAll({ attributes: { exclude: ['content'] }, order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: articles });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getArticleByIdForAdmin = async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    res.status(200).json({ data: article });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [PUBLIC] GET /news/categories — danh mục đang có bài đăng và số bài (để trang Tin tức hiện tab theo dữ liệu thật)
const getCategories = async (req, res) => {
  try {
    const rows = await Article.findAll({
      where: { status: 'PUBLISHED' },
      attributes: ['category', [Article.sequelize.fn('COUNT', Article.sequelize.col('id')), 'count']],
      group: ['category'],
      order: [[Article.sequelize.literal('count'), 'DESC']],
      raw: true
    });
    res.status(200).json({ data: rows.map(r => ({ category: r.category, count: Number(r.count) })) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const STATUSES = ['PUBLISHED', 'DRAFT', 'HIDDEN'];

// Kiểm tra dữ liệu bài viết từ admin; trả về { data } hoặc { error }
const pickArticleFields = (body, isCreate) => {
  const data = {};
  for (const key of ['title', 'summary', 'content', 'category', 'author_name']) {
    if (body[key] !== undefined) data[key] = String(body[key] ?? '').trim();
  }
  if (isCreate && !data.title) return { error: 'Vui lòng nhập tiêu đề' };
  if (data.title !== undefined && (!data.title || data.title.length > 200)) return { error: 'Tiêu đề từ 1 đến 200 ký tự' };
  if (data.category !== undefined && (!data.category || data.category.length > 50)) return { error: 'Danh mục từ 1 đến 50 ký tự' };
  if (data.content !== undefined && data.content.length > 20000) return { error: 'Nội dung tối đa 20.000 ký tự' };
  if (body.thumbnail_url !== undefined) {
    const url = body.thumbnail_url ? String(body.thumbnail_url).trim() : null;
    if (url && !/^https:\/\/\S{1,500}$/.test(url)) return { error: 'Ảnh bìa phải là đường dẫn https hợp lệ' };
    data.thumbnail_url = url;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: 'Trạng thái không hợp lệ' };
    data.status = body.status;
  }
  return { data };
};

const createArticle = async (req, res) => {
  try {
    const { data, error } = pickArticleFields(req.body, true);
    if (error) return res.status(400).json({ message: error });

    const article = await Article.create({
      ...data,
      slug: `${toSlug(data.title)}-${Date.now().toString(36)}`,
      author_id: req.user.id,
      author_name: data.author_name || 'Ban biên tập GlowSkin',
      published_at: new Date()
    });
    res.status(201).json({ message: 'Tạo bài viết thành công', data: article });
  } catch (error) {
    res.status(500).json({ message: 'Không thể tạo bài viết', error: error.message });
  }
};

const updateArticle = async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    const { data, error } = pickArticleFields(req.body, false);
    if (error) return res.status(400).json({ message: error });
    // Bài nháp / đã ẩn được đăng lần đầu: ngày đăng là lúc chuyển sang PUBLISHED
    if (data.status === 'PUBLISHED' && article.status !== 'PUBLISHED') data.published_at = new Date();
    await article.update(data);
    res.status(200).json({ message: 'Cập nhật thành công', data: article });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    await article.update({ status: 'HIDDEN' });
    res.status(200).json({ message: 'Đã gỡ bài viết' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi gỡ bài', error: error.message });
  }
};

module.exports = {
  getPublishedArticles, getArticleBySlug, getCategories, getAllArticlesForAdmin,
  getArticleByIdForAdmin, createArticle, updateArticle, deleteArticle
};
