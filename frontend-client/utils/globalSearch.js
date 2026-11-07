import axios from 'axios';
import { normalize } from '../components/ShopFilters';
import { getImages, productUrl } from '../components/ProductCard';

// Tìm kiếm chung toàn website: sản phẩm, dịch vụ, gói liệu trình, bác sĩ, bài viết.
// Tải danh sách công khai 1 lần (lần đầu bấm vào ô tìm kiếm), sau đó lọc ngay trên trình duyệt.
const API = '/api';
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export const SEARCH_GROUPS = [
  { key: 'product', label: 'Mỹ phẩm', more: (q) => `/shops?q=${encodeURIComponent(q)}` },
  { key: 'service', label: 'Dịch vụ', more: () => '/services' },
  { key: 'package', label: 'Gói liệu trình', more: () => '/goi-lieu-trinh' },
  { key: 'doctor', label: 'Bác sĩ', more: () => '/doi-ngu-bac-si' },
  { key: 'article', label: 'Bài viết', more: (q) => `/news?q=${encodeURIComponent(q)}` },
];

const list = (p) => p.then((r) => r.data?.data || []).catch(() => []);

let indexPromise = null;
export const loadSearchIndex = () => {
  if (!indexPromise) {
    indexPromise = Promise.all([
      list(axios.get(`${API}/commerce/products/shop`)),
      list(axios.get(`${API}/booking/spa-services`)),
      list(axios.get(`${API}/booking/packages`)),
      list(axios.get(`${API}/identity/users/doctors/public`)),
      list(axios.get(`${API}/media/news`, { params: { limit: 50 } })),
    ]).then(([products, services, packages, doctors, articles]) => [
      ...products.map((p) => ({
        type: 'product', id: p.id, title: p.name, to: productUrl(p), image: getImages(p.image_url)[0],
        subtitle: [p.ProductDetail?.brand, p.Category?.name, vnd(p.price)].filter(Boolean).join(' · '),
        text: [p.ProductDetail?.brand, p.Category?.name, p.ProductDetail?.short_description].join(' '),
      })),
      ...services.map((s) => ({
        type: 'service', id: s.id, title: s.name, to: `/services/${s.id}`, image: s.image_url || s.thumbnail_url,
        subtitle: [s.category, vnd(s.price)].filter(Boolean).join(' · '),
        text: [s.category, s.description].join(' '),
      })),
      ...packages.map((g) => {
        const price = Number(g.promotional_price) > 0 ? g.promotional_price : g.price;
        return {
          type: 'package', id: g.id, title: g.name, to: '/goi-lieu-trinh', image: g.thumbnail_url,
          subtitle: vnd(price), text: g.description || '',
        };
      }),
      ...doctors.map((d) => ({
        type: 'doctor', id: d.id, title: d.full_name, to: `/doi-ngu-bac-si?bs=${d.id}`, image: d.avatar,
        subtitle: [d.title, d.specialty].filter(Boolean).join(' · '),
        text: [d.title, d.specialty, d.workplace].join(' '),
      })),
      ...articles.map((a) => ({
        type: 'article', id: a.id, title: a.title, to: `/news/${a.slug}`, image: a.thumbnail_url,
        subtitle: a.category || '', text: [a.category, a.summary, (a.tags || []).join(' ')].join(' '),
      })),
    ].map((item) => ({ ...item, _title: normalize(item.title), _text: normalize(item.text) })));
    // Lỗi mạng: lần sau bấm vào ô tìm kiếm thì tải lại
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
};

// Mọi từ khoá đều phải có trong tên hoặc nội dung; khớp ở tên (nhất là đầu tên) xếp trước
export const searchIndex = (index, query) => {
  const q = normalize(query);
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .map((item) => {
      if (!words.every((w) => item._title.includes(w) || item._text.includes(w))) return null;
      const inTitle = words.filter((w) => item._title.includes(w)).length;
      const score = inTitle * 2 + (item._title.includes(q) ? 3 : 0) + (item._title.startsWith(q) ? 2 : 0);
      return { ...item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'vi'));
};

// Gom kết quả theo nhóm, mỗi nhóm tối đa `limit` mục (limit = Infinity: lấy hết)
export const groupResults = (results, limit) => SEARCH_GROUPS
  .map((g) => {
    const items = results.filter((r) => r.type === g.key);
    return { ...g, total: items.length, items: items.slice(0, limit) };
  })
  .filter((g) => g.total > 0);
