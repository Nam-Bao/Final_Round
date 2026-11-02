const { Op } = require('sequelize');
const { Article } = require('../models');
const { toSlug, text, optionalUrl, stringList, optionalDate, checkContentMedia } = require('../utils/validate');
const { ARTICLE_TYPES, TYPE_KEYS, typeLabel, typeFromCategory } = require('../utils/articleTypes');

const STATUSES = ['PUBLISHED', 'DRAFT', 'HIDDEN'];
const MAX_CONTENT = 50000;

// Bài đang hiện trên web: đã đăng và đã tới giờ đăng (published_at trong tương lai = hẹn giờ)
const liveWhere = () => ({ status: 'PUBLISHED', published_at: { [Op.lte]: new Date() } });

const uniqueSlug = (title) => `${toSlug(title) || 'bai-viet'}-${Date.now().toString(36)}`;

// [PUBLIC] GET /news?page&limit&type&q&tag (category=tên loại vẫn nhận cho link cũ)
const getPublishedArticles = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 9, 50);
    const { category, q, tag } = req.query;
    const type = req.query.type || (category ? typeFromCategory(category) : '');

    const where = liveWhere();
    if (type && TYPE_KEYS.includes(type)) where.article_type = type;
    if (tag) where.tags = { [Op.contains]: [String(tag)] };
    if (q) {
      const like = `%${String(q).slice(0, 100)}%`;
      where[Op.or] = [{ title: { [Op.iLike]: like } }, { summary: { [Op.iLike]: like } }];
    }

    const { rows, count } = await Article.findAndCountAll({
      where,
      attributes: { exclude: ['content', 'sources'] },
      order: [['is_featured', 'DESC NULLS LAST'], ['published_at', 'DESC']],
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

// [PUBLIC] GET /news/:slug — mỗi lần mở bài tăng 1 lượt xem
const getArticleBySlug = async (req, res) => {
  try {
    const article = await Article.findOne({ where: { slug: req.params.slug, ...liveWhere() } });
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    await article.increment('view_count', { silent: true }); // tự cập nhật luôn giá trị trên object
    res.status(200).json({ data: article });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [PUBLIC] GET /news/categories — các loại bài và số bài đang đăng (tab ở trang Tin tức), theo thứ tự cố định
const getCategories = async (req, res) => {
  try {
    const rows = await Article.findAll({
      where: liveWhere(),
      attributes: ['article_type', [Article.sequelize.fn('COUNT', Article.sequelize.col('id')), 'count']],
      group: ['article_type'],
      raw: true
    });
    const counts = Object.fromEntries(rows.map((r) => [r.article_type, Number(r.count)]));
    res.status(200).json({ data: TYPE_KEYS.map((type) => ({ type, label: ARTICLE_TYPES[type], count: counts[type] || 0 })) });
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

// Kiểm tra dữ liệu bài viết từ quản lý; trả về { data } hoặc { error }
const pickArticleFields = (body, isCreate) => {
  try {
    const data = {};
    for (const key of ['title', 'summary', 'content', 'author_name', 'author_title']) {
      if (body[key] !== undefined) data[key] = text(body[key]);
    }
    if (isCreate && !data.title) return { error: 'Vui lòng nhập tiêu đề' };
    if (data.title !== undefined && (!data.title || data.title.length > 200)) return { error: 'Tiêu đề từ 1 đến 200 ký tự' };
    if (data.summary !== undefined && data.summary.length > 500) return { error: 'Tóm tắt tối đa 500 ký tự' };
    if (data.author_title !== undefined && data.author_title.length > 120) return { error: 'Chức danh tác giả tối đa 120 ký tự' };
    if (data.content !== undefined) {
      if (data.content.length > MAX_CONTENT) return { error: `Nội dung tối đa ${MAX_CONTENT.toLocaleString('vi-VN')} ký tự` };
      checkContentMedia(data.content);
    }
    if (body.thumbnail_url !== undefined) data.thumbnail_url = optionalUrl(body.thumbnail_url, 'Ảnh bìa');
    if (body.video_url !== undefined) data.video_url = optionalUrl(body.video_url, 'Video');
    if (body.tags !== undefined) data.tags = stringList(body.tags, { max: 10, maxLength: 40, separator: /[,\n]/ });
    if (body.sources !== undefined) data.sources = stringList(body.sources, { max: 30, maxLength: 500 });
    if (body.is_featured !== undefined) data.is_featured = !!body.is_featured;
    if (body.published_at !== undefined) data.published_at = optionalDate(body.published_at, 'Ngày đăng') || new Date();
    if (body.article_type !== undefined) {
      if (!TYPE_KEYS.includes(body.article_type)) return { error: 'Loại bài viết không hợp lệ' };
      data.article_type = body.article_type;
      data.category = typeLabel(body.article_type);
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return { error: 'Trạng thái không hợp lệ' };
      data.status = body.status;
    }
    return { data };
  } catch (err) {
    return { error: err.message };
  }
};

const createArticle = async (req, res) => {
  try {
    const { data, error } = pickArticleFields(req.body, true);
    if (error) return res.status(400).json({ message: error });
    if (!data.article_type) return res.status(400).json({ message: 'Vui lòng chọn loại bài viết' });

    const article = await Article.create({
      ...data,
      slug: uniqueSlug(data.title),
      author_id: req.user.id,
      author_name: data.author_name || 'Ban biên tập GlowSkin',
      published_at: data.published_at || new Date(),
      updated_by: req.user.id,
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
    // Bài nháp / đã ẩn được đăng lần đầu mà không hẹn giờ: ngày đăng là lúc chuyển sang PUBLISHED
    if (data.status === 'PUBLISHED' && article.status !== 'PUBLISHED' && data.published_at === undefined) data.published_at = new Date();
    await article.update({ ...data, updated_by: req.user.id });
    res.status(200).json({ message: 'Cập nhật thành công', data: article });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

// Gỡ bài = ẩn (vẫn giữ dữ liệu để khôi phục)
const deleteArticle = async (req, res) => {
  try {
    const article = await Article.findByPk(req.params.id);
    if (!article) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    await article.update({ status: 'HIDDEN', updated_by: req.user.id });
    res.status(200).json({ message: 'Đã gỡ bài viết' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi gỡ bài', error: error.message });
  }
};

module.exports = {
  getPublishedArticles, getArticleBySlug, getCategories, getAllArticlesForAdmin,
  getArticleByIdForAdmin, createArticle, updateArticle, deleteArticle, uniqueSlug
};
