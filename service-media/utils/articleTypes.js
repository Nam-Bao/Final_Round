// Loại bài viết (= các tab ở trang Tin tức). Thứ tự ở đây là thứ tự tab hiển thị.
// Cột category của Articles luôn lưu tên tiếng Việt tương ứng (giữ cho dữ liệu / link cũ).
const ARTICLE_TYPES = {
  INTRO: 'Giới thiệu',
  EVENT: 'Sự kiện',
  KNOWLEDGE: 'Kiến thức da liễu',
  SKINCARE: 'Chăm sóc da',
  RESEARCH: 'Nghiên cứu',
};
const TYPE_KEYS = Object.keys(ARTICLE_TYPES);
const DEFAULT_TYPE = 'KNOWLEDGE';
// Loại bài bác sĩ được viết và gửi duyệt
const DOCTOR_TYPES = ['RESEARCH', 'KNOWLEDGE', 'SKINCARE'];

const typeLabel = (type) => ARTICLE_TYPES[type] || ARTICLE_TYPES[DEFAULT_TYPE];
// Tên danh mục cũ -> loại (bài tạo trước khi có article_type)
const typeFromCategory = (category = '') => {
  const name = String(category).trim().toLowerCase();
  if (name.startsWith('nghiên cứu')) return 'RESEARCH';
  return TYPE_KEYS.find((k) => ARTICLE_TYPES[k].toLowerCase() === name) || DEFAULT_TYPE;
};

module.exports = { ARTICLE_TYPES, TYPE_KEYS, DEFAULT_TYPE, DOCTOR_TYPES, typeLabel, typeFromCategory };
