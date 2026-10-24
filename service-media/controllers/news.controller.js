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

const createArticle = async (req, res) => {
  try {
    const { title, summary, content, thumbnail_url, category, status, author_name } = req.body;
    if (!title) return res.status(400).json({ message: 'Vui lòng nhập tiêu đề' });

    const article = await Article.create({
      title,
      slug: `${toSlug(title)}-${Date.now().toString(36)}`,
      summary, content, thumbnail_url, category, status,
      author_id: req.user.id,
      author_name: author_name || 'GlowSkin'
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
    const { title, summary, content, thumbnail_url, category, status, author_name } = req.body;
    await article.update({ title, summary, content, thumbnail_url, category, status, author_name });
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
  getPublishedArticles, getArticleBySlug, getAllArticlesForAdmin,
  getArticleByIdForAdmin, createArticle, updateArticle, deleteArticle
};
