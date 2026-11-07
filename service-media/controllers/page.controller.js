const { Op } = require('sequelize');
const { Article, Banner, ClinicInfo, Popup } = require('../models');
const { LINK_URL, text, optionalUrl, optionalDate } = require('../utils/validate');
const { TYPE_KEYS } = require('../utils/articleTypes');

// Banner trang chủ và popup quảng cáo do quản lý cấu hình

const FREQUENCIES = ['ONCE', 'DAILY', 'SESSION'];

// Đang bật và nằm trong khung thời gian hiển thị
const liveWhere = () => {
  const now = new Date();
  return {
    is_active: true,
    [Op.and]: [
      { [Op.or]: [{ start_at: null }, { start_at: { [Op.lte]: now } }] },
      { [Op.or]: [{ end_at: null }, { end_at: { [Op.gt]: now } }] },
    ],
  };
};

const int = (value, label, min, max) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} phải là số nguyên từ ${min} đến ${max}`);
  return n;
};

const checkPeriod = (data, current = {}) => {
  const start = data.start_at !== undefined ? data.start_at : current.start_at;
  const end = data.end_at !== undefined ? data.end_at : current.end_at;
  if (start && end && new Date(end) <= new Date(start)) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu');
};

const pickBanner = (body, isCreate) => {
  const data = {};
  if (body.title !== undefined || isCreate) {
    data.title = text(body.title);
    if (!data.title || data.title.length > 150) throw new Error('Tiêu đề banner từ 1 đến 150 ký tự');
  }
  if (body.subtitle !== undefined) {
    data.subtitle = text(body.subtitle) || null;
    if (data.subtitle && data.subtitle.length > 300) throw new Error('Mô tả tối đa 300 ký tự');
  }
  if (body.image_url !== undefined || isCreate) {
    data.image_url = optionalUrl(body.image_url, 'Ảnh banner');
    if (!data.image_url) throw new Error('Vui lòng tải ảnh banner');
  }
  if (body.mobile_image_url !== undefined) data.mobile_image_url = optionalUrl(body.mobile_image_url, 'Ảnh cho điện thoại');
  if (body.link_url !== undefined) data.link_url = optionalUrl(body.link_url, 'Liên kết', LINK_URL);
  if (body.button_text !== undefined) {
    data.button_text = text(body.button_text) || null;
    if (data.button_text && data.button_text.length > 40) throw new Error('Chữ trên nút tối đa 40 ký tự');
  }
  if (body.show_text !== undefined) data.show_text = !!body.show_text;
  if (body.sort_order !== undefined) data.sort_order = int(body.sort_order || 0, 'Thứ tự', 0, 999);
  if (body.is_active !== undefined) data.is_active = !!body.is_active;
  if (body.start_at !== undefined) data.start_at = optionalDate(body.start_at, 'Thời gian bắt đầu');
  if (body.end_at !== undefined) data.end_at = optionalDate(body.end_at, 'Thời gian kết thúc');
  return data;
};

const pickPopup = (body, isCreate) => {
  const data = {};
  if (body.name !== undefined || isCreate) {
    data.name = text(body.name);
    if (!data.name || data.name.length > 100) throw new Error('Tên popup từ 1 đến 100 ký tự');
  }
  if (body.title !== undefined) {
    data.title = text(body.title) || null;
    if (data.title && data.title.length > 150) throw new Error('Tiêu đề tối đa 150 ký tự');
  }
  if (body.content !== undefined) {
    data.content = text(body.content) || null;
    if (data.content && data.content.length > 1000) throw new Error('Nội dung tối đa 1.000 ký tự');
  }
  if (body.image_url !== undefined) data.image_url = optionalUrl(body.image_url, 'Ảnh popup');
  if (body.link_url !== undefined) data.link_url = optionalUrl(body.link_url, 'Liên kết', LINK_URL);
  if (body.button_text !== undefined) {
    data.button_text = text(body.button_text) || null;
    if (data.button_text && data.button_text.length > 40) throw new Error('Chữ trên nút tối đa 40 ký tự');
  }
  if (body.frequency !== undefined) {
    if (!FREQUENCIES.includes(body.frequency)) throw new Error('Tần suất hiển thị không hợp lệ');
    data.frequency = body.frequency;
  }
  if (body.delay_seconds !== undefined) data.delay_seconds = int(body.delay_seconds || 0, 'Thời gian chờ', 0, 60);
  if (body.priority !== undefined) data.priority = int(body.priority || 0, 'Độ ưu tiên', 0, 100);
  if (body.pages !== undefined) {
    const pages = (Array.isArray(body.pages) ? body.pages : []).map(text).filter(Boolean);
    if (pages.length > 20 || pages.some((p) => !/^\/[\w\-/]{0,100}$/.test(p))) throw new Error('Trang hiển thị phải là đường dẫn bắt đầu bằng "/"');
    data.pages = [...new Set(pages)];
  }
  if (body.is_active !== undefined) data.is_active = !!body.is_active;
  if (body.start_at !== undefined) data.start_at = optionalDate(body.start_at, 'Thời gian bắt đầu');
  if (body.end_at !== undefined) data.end_at = optionalDate(body.end_at, 'Thời gian kết thúc');
  if (isCreate && !data.title && !data.image_url) throw new Error('Popup cần có tiêu đề hoặc ảnh');
  return data;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// [PUBLIC] POST /pages/banners/:id/click, /pages/popups/:id/click — khách bấm vào banner / popup
const trackClick = (Model) => async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) return res.status(400).json({ message: 'Mã không hợp lệ' });
    await Model.increment('click_count', { where: { id: req.params.id }, silent: true });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [MANAGER] GET /pages/stats — lượt bấm banner, popup và lượt xem bài viết theo loại cho trang tổng quan
const getContentStats = async (req, res) => {
  try {
    const clicks = { attributes: ['id', 'click_count', 'is_active'], order: [['click_count', 'DESC']], limit: 5 };
    const [bannerRows, popupRows, articles] = await Promise.all([
      Banner.findAll({ ...clicks, attributes: [...clicks.attributes, 'title'] }),
      Popup.findAll({ ...clicks, attributes: [...clicks.attributes, 'name'] }),
      Article.findAll({ where: { status: 'PUBLISHED' }, attributes: ['id', 'title', 'slug', 'article_type', 'view_count'], order: [['view_count', 'DESC']], raw: true }),
    ]);
    const by_type = TYPE_KEYS.map((type) => {
      const list = articles.filter((a) => a.article_type === type);
      return { type, articles: list.length, views: list.reduce((sum, a) => sum + a.view_count, 0), top: list[0] || null };
    }).filter((row) => row.articles > 0).sort((a, b) => b.views - a.views);
    res.json({
      data: {
        clicks: [
          ...bannerRows.map((b) => ({ id: b.id, kind: 'BANNER', name: b.title, clicks: b.click_count, is_active: b.is_active })),
          ...popupRows.map((p) => ({ id: p.id, kind: 'POPUP', name: p.name, clicks: p.click_count, is_active: p.is_active })),
        ].sort((a, b) => b.clicks - a.clicks),
        by_type,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const CLINIC_TEXT_FIELDS = { address: ['Địa chỉ', 300], map_query: ['Địa điểm bản đồ', 300], working_hours: ['Giờ khám', 100], consult_hours: ['Giờ tư vấn', 100] };
const CLINIC_URL_FIELDS = { zalo_url: 'Zalo', facebook_url: 'Facebook', instagram_url: 'Instagram', tiktok_url: 'TikTok', youtube_url: 'YouTube' };

const pickClinicInfo = (body) => {
  const hotline = text(body.hotline).replace(/\s/g, '');
  if (hotline && !/^0\d{9,10}$/.test(hotline)) throw new Error('Hotline phải bắt đầu bằng 0, gồm 10 hoặc 11 số');
  const data = { hotline: hotline || null };
  for (const [field, [label, max]] of Object.entries(CLINIC_TEXT_FIELDS)) {
    data[field] = text(body[field]) || null;
    if (data[field] && data[field].length > max) throw new Error(`${label} tối đa ${max} ký tự`);
  }
  for (const [field, label] of Object.entries(CLINIC_URL_FIELDS)) data[field] = optionalUrl(body[field], label);
  return data;
};

const clinicInfo = {
  // [PUBLIC] GET /pages/clinic-info
  get: async (req, res) => {
    try {
      const row = await ClinicInfo.findOne({ attributes: { exclude: ['id', 'updated_by', 'createdAt', 'updatedAt'] } });
      res.json({ data: row || {} });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  },
  // [MANAGER] PUT /pages/clinic-info
  update: async (req, res) => {
    let data;
    try { data = pickClinicInfo(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
    try {
      const row = await ClinicInfo.findOne();
      const saved = row ? await row.update({ ...data, updated_by: req.user.id }) : await ClinicInfo.create({ ...data, updated_by: req.user.id });
      res.json({ message: 'Đã lưu thông tin phòng khám', data: saved });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  },
};

// Tạo bộ CRUD giống nhau cho banner và popup
const crud = (Model, pick, label, publicOrder) => ({
  listPublic: async (req, res) => {
    try {
      const rows = await Model.findAll({
        where: liveWhere(),
        attributes: { exclude: ['created_by', 'updated_by', 'is_active'] },
        order: publicOrder,
      });
      res.json({ data: rows });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  },
  listAdmin: async (req, res) => {
    try {
      res.json({ data: await Model.findAll({ order: publicOrder }) });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const data = pick(req.body, true);
      checkPeriod(data);
      const row = await Model.create({ ...data, created_by: req.user.id, updated_by: req.user.id });
      res.status(201).json({ message: `Đã tạo ${label}`, data: row });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const row = await Model.findByPk(req.params.id);
      if (!row) return res.status(404).json({ message: `Không tìm thấy ${label}` });
      const data = pick(req.body, false);
      checkPeriod(data, row);
      await row.update({ ...data, updated_by: req.user.id });
      res.json({ message: `Đã cập nhật ${label}`, data: row });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },
  remove: async (req, res) => {
    try {
      const count = await Model.destroy({ where: { id: req.params.id } });
      if (!count) return res.status(404).json({ message: `Không tìm thấy ${label}` });
      res.json({ message: `Đã xóa ${label}` });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  },
});

const banners = crud(Banner, pickBanner, 'banner', [['sort_order', 'ASC'], ['createdAt', 'DESC']]);
const popups = crud(Popup, pickPopup, 'popup', [['priority', 'DESC'], ['createdAt', 'DESC']]);

module.exports = { banners, popups, clinicInfo, getContentStats, trackBannerClick: trackClick(Banner), trackPopupClick: trackClick(Popup) };
