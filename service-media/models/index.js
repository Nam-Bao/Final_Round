const { Sequelize, DataTypes, Op } = require('sequelize');
const { ARTICLE_TYPES, TYPE_KEYS, DEFAULT_TYPE, typeFromCategory } = require('../utils/articleTypes');

// Đọc từ .env; giá trị mặc định khớp docker-compose cho môi trường dev
const sequelize = new Sequelize(process.env.DB_NAME || 'media_db', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || 'password', {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5436),
  dialect: 'postgres',
  logging: false
});

// Nội dung bài viết (content) là văn bản có cú pháp đơn giản, hiển thị bằng React (không chèn HTML thô):
//   ## Tiêu đề mục   ### Tiêu đề nhỏ   > Trích dẫn   - gạch đầu dòng   1. danh sách số   **chữ đậm**
//   ![chú thích](https://...ảnh)      !video[chú thích](https://...youtube hoặc file mp4)
const Article = sequelize.define('Article', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false, unique: true },
  summary: { type: DataTypes.TEXT },
  content: { type: DataTypes.TEXT },
  thumbnail_url: { type: DataTypes.STRING },
  category: { type: DataTypes.STRING, defaultValue: ARTICLE_TYPES[DEFAULT_TYPE] }, // tên loại bài (tự đặt theo article_type)
  author_id: { type: DataTypes.UUID },
  author_name: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PUBLISHED', 'DRAFT', 'HIDDEN'), defaultValue: 'PUBLISHED' },
  published_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }, // đặt ngày trong tương lai = hẹn giờ đăng
  // ---- Các cột bổ sung (tự thêm vào bảng cũ khi service khởi động, xem syncSchema) ----
  article_type: { type: DataTypes.STRING(20), defaultValue: DEFAULT_TYPE }, // INTRO | EVENT | KNOWLEDGE | SKINCARE | RESEARCH (utils/articleTypes.js)
  author_title: { type: DataTypes.STRING(120) },   // vd. "BS.CKI Da liễu"
  author_avatar: { type: DataTypes.STRING(500) },
  video_url: { type: DataTypes.STRING(500) },      // video chính đặt đầu bài (YouTube hoặc file đã tải lên)
  tags: { type: DataTypes.JSONB, defaultValue: [] },
  sources: { type: DataTypes.JSONB, defaultValue: [] }, // tài liệu tham khảo, mỗi phần tử 1 dòng
  is_featured: { type: DataTypes.BOOLEAN, defaultValue: false }, // ghim lên đầu trang Tin tức
  view_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  submission_id: { type: DataTypes.UUID },         // bài do bác sĩ gửi duyệt
  updated_by: { type: DataTypes.UUID },
});

// Bài bác sĩ soạn và gửi quản lý duyệt. Duyệt => tạo / cập nhật bài trong Articles.
// Bị yêu cầu chỉnh sửa => bác sĩ sửa ngay trên bài này rồi gửi lại; mọi phiên bản đã gửi lưu trong ArticleReviews.
const ArticleSubmission = sequelize.define('ArticleSubmission', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  author_id: { type: DataTypes.UUID, allowNull: false },
  author_name: { type: DataTypes.STRING },
  author_title: { type: DataTypes.STRING(120) },
  author_avatar: { type: DataTypes.STRING(500) },
  title: { type: DataTypes.STRING, allowNull: false },
  summary: { type: DataTypes.TEXT },
  content: { type: DataTypes.TEXT },
  thumbnail_url: { type: DataTypes.STRING(500) },
  video_url: { type: DataTypes.STRING(500) },
  category: { type: DataTypes.STRING(50), defaultValue: ARTICLE_TYPES.RESEARCH },
  tags: { type: DataTypes.JSONB, defaultValue: [] },
  sources: { type: DataTypes.JSONB, defaultValue: [] },
  // DRAFT: đang soạn | PENDING: chờ duyệt | CHANGES_REQUESTED: cần chỉnh sửa | APPROVED: đã duyệt và đăng
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // số lần đã gửi duyệt
  submitted_at: { type: DataTypes.DATE },
  reviewed_by: { type: DataTypes.UUID },
  reviewed_at: { type: DataTypes.DATE },
  review_note: { type: DataTypes.TEXT },       // lý do / yêu cầu chỉnh sửa gần nhất
  article_id: { type: DataTypes.UUID },        // bài đã đăng (sau lần duyệt đầu tiên)
});

// Lịch sử duyệt: mỗi lần gửi lưu nguyên nội dung (snapshot) để xem lại bài cũ và đối chiếu yêu cầu chỉnh sửa
const ArticleReview = sequelize.define('ArticleReview', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  submission_id: { type: DataTypes.UUID, allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false },
  action: { type: DataTypes.STRING(20), allowNull: false }, // SUBMITTED | APPROVED | CHANGES_REQUESTED | WITHDRAWN
  note: { type: DataTypes.TEXT },
  actor_id: { type: DataTypes.UUID },
  actor_role: { type: DataTypes.STRING(20) },
  snapshot: { type: DataTypes.JSONB },
}, { updatedAt: false });

// Banner trang chủ (dạng trình chiếu)
const Banner = sequelize.define('Banner', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING(150), allowNull: false },
  subtitle: { type: DataTypes.STRING(300) },
  image_url: { type: DataTypes.STRING(500), allowNull: false },
  mobile_image_url: { type: DataTypes.STRING(500) },
  link_url: { type: DataTypes.STRING(500) },   // "/duong-dan-noi-bo" hoặc https://...
  button_text: { type: DataTypes.STRING(40) },
  show_text: { type: DataTypes.BOOLEAN, defaultValue: true }, // tắt khi ảnh đã có sẵn chữ
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  start_at: { type: DataTypes.DATE },          // để trống = hiện ngay
  end_at: { type: DataTypes.DATE },            // để trống = không hết hạn
  created_by: { type: DataTypes.UUID },
  updated_by: { type: DataTypes.UUID },
});

// Popup quảng cáo hiện khi khách vào website
const Popup = sequelize.define('Popup', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false }, // tên nội bộ để quản lý
  title: { type: DataTypes.STRING(150) },
  content: { type: DataTypes.TEXT },
  image_url: { type: DataTypes.STRING(500) },
  link_url: { type: DataTypes.STRING(500) },
  button_text: { type: DataTypes.STRING(40) },
  frequency: { type: DataTypes.STRING(20), defaultValue: 'DAILY' }, // ONCE | DAILY | SESSION
  delay_seconds: { type: DataTypes.INTEGER, defaultValue: 3 },
  pages: { type: DataTypes.JSONB, defaultValue: [] },               // [] = mọi trang; ['/', '/shops'] = chỉ các trang này
  priority: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  start_at: { type: DataTypes.DATE },
  end_at: { type: DataTypes.DATE },
  created_by: { type: DataTypes.UUID },
  updated_by: { type: DataTypes.UUID },
});

ArticleSubmission.hasMany(ArticleReview, { foreignKey: 'submission_id', as: 'reviews' });
ArticleReview.belongsTo(ArticleSubmission, { foreignKey: 'submission_id' });

const MODELS = [Article, ArticleSubmission, ArticleReview, Banner, Popup];

// sync() chỉ tạo bảng còn thiếu, KHÔNG thêm cột mới vào bảng đã có => tự thêm các cột còn thiếu.
// Chỉ thêm, không sửa / xóa cột nên không mất dữ liệu (khác với sync({ alter: true })).
const syncSchema = async () => {
  await sequelize.sync();
  const qi = sequelize.getQueryInterface();
  const added = [];
  for (const model of MODELS) {
    const table = model.getTableName();
    const existing = await qi.describeTable(table);
    for (const [name, attr] of Object.entries(model.getAttributes())) {
      const field = attr.field || name;
      if (existing[field]) continue;
      const isNow = attr.defaultValue === DataTypes.NOW || attr.defaultValue instanceof DataTypes.NOW;
      const defaultValue = isNow ? undefined : attr.defaultValue;
      await qi.addColumn(table, field, { type: attr.type, allowNull: true, defaultValue });
      added.push(`${table}.${field}`);
    }
  }
  // Bài cũ (loại NEWS / chưa có loại): suy ra loại từ tên danh mục; luôn đồng bộ category = tên loại
  const legacy = await Article.findAll({ where: { [Op.or]: [{ article_type: null }, { article_type: { [Op.notIn]: TYPE_KEYS } }] } });
  for (const article of legacy) {
    const type = typeFromCategory(article.category);
    await article.update({ article_type: type, category: ARTICLE_TYPES[type] }, { silent: true });
  }
  if (legacy.length) added.push(`(chuyển loại cho ${legacy.length} bài cũ)`);
  return added;
};

module.exports = { sequelize, Article, ArticleSubmission, ArticleReview, Banner, Popup, syncSchema };
