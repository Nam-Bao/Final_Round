// Kiểm tra dữ liệu chung cho bài viết, banner, popup

const HTTPS_URL = /^https:\/\/[^\s"'<>]{1,490}$/;
// Link khi bấm vào banner / popup: đường dẫn nội bộ ("/shops") hoặc https
const LINK_URL = /^(\/[^\s"'<>]{0,300}|https:\/\/[^\s"'<>]{1,490})$/;

const toSlug = (text = '') =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

const text = (value) => String(value ?? '').trim();

// Trả về null nếu để trống, chuỗi nếu hợp lệ, hoặc ném lỗi
const optionalUrl = (value, label, pattern = HTTPS_URL) => {
  const url = text(value);
  if (!url) return null;
  if (!pattern.test(url)) throw new Error(`${label} phải là đường dẫn ${pattern === LINK_URL ? 'bắt đầu bằng "/" hoặc https://' : 'https hợp lệ'}`);
  return url;
};

// Mảng chuỗi (thẻ, tài liệu tham khảo): nhận mảng hoặc chuỗi nhiều dòng / cách nhau dấu phẩy
const stringList = (value, { max, maxLength, separator = /\n/ }) => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(separator);
  const items = [...new Set(raw.map(text).filter(Boolean))];
  if (items.length > max) throw new Error(`Tối đa ${max} mục`);
  if (items.some((i) => i.length > maxLength)) throw new Error(`Mỗi mục tối đa ${maxLength} ký tự`);
  return items;
};

const optionalDate = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} không hợp lệ`);
  return d;
};

// Đường dẫn ảnh / video nằm trong nội dung bài viết cũng phải là https
const checkContentMedia = (content) => {
  const urls = [...String(content || '').matchAll(/!(?:video)?\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[1].trim());
  if (urls.some((u) => !HTTPS_URL.test(u))) throw new Error('Ảnh / video chèn trong nội dung phải là đường dẫn https');
};

module.exports = { HTTPS_URL, LINK_URL, toSlug, text, optionalUrl, stringList, optionalDate, checkContentMedia };
