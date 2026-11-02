import React, { useEffect, useState } from 'react';
import { Search, X, SlidersHorizontal, Star } from 'lucide-react';

export const PRICE_RANGES = [
  { key: 'u200', label: 'Dưới 200.000đ', min: 0, max: 200000 },
  { key: '200-500', label: '200.000đ - 500.000đ', min: 200000, max: 500000 },
  { key: '500-1000', label: '500.000đ - 1.000.000đ', min: 500000, max: 1000000 },
  { key: 'o1000', label: 'Trên 1.000.000đ', min: 1000000, max: Infinity },
];

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'best_selling', label: 'Bán chạy nhất' },
  { key: 'price_asc', label: 'Giá thấp đến cao' },
  { key: 'price_desc', label: 'Giá cao đến thấp' },
  { key: 'rating', label: 'Đánh giá cao nhất' },
  { key: 'reviews', label: 'Nhiều đánh giá nhất' },
  { key: 'name', label: 'Tên A - Z' },
];

export const EMPTY_FILTERS = { q: '', cat: '', price: '', min: '', max: '', rating: '', stock: false, sort: 'newest' };

// Bỏ dấu tiếng Việt để tìm "sua rua mat" vẫn ra "Sữa rửa mặt"
const normalize = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

// Lọc + sắp xếp danh sách sản phẩm theo bộ lọc hiện tại
export function applyShopFilters(products, f) {
  const words = normalize(f.q).split(/\s+/).filter(Boolean);
  const range = PRICE_RANGES.find((r) => r.key === f.price);
  const min = f.min !== '' ? Number(f.min) : range?.min ?? 0;
  const max = f.max !== '' ? Number(f.max) : range?.max ?? Infinity;
  const minRating = Number(f.rating) || 0;

  const list = products.filter((p) => {
    const price = Number(p.price);
    if (words.length) {
      const text = normalize(`${p.name} ${p.Category?.name || ''}`);
      if (!words.every((w) => text.includes(w))) return false;
    }
    if (f.cat && p.Category?.id !== f.cat) return false;
    // Khoảng có sẵn không tính mốc trên (500.000đ chỉ thuộc "500.000đ - 1.000.000đ"); khoảng tự nhập tính cả 2 mốc
    const customMax = f.max !== '';
    if (price < min || (customMax || !range ? price > max : price >= max)) return false;
    if (minRating && !(p.review_count > 0 && Number(p.avg_rating) >= minRating)) return false;
    if (f.stock && !(p.stock_quantity > 0)) return false;
    return true;
  });

  const byPrice = (a, b) => Number(a.price) - Number(b.price);
  const sorters = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    best_selling: (a, b) => (b.sold_count || 0) - (a.sold_count || 0),
    price_asc: byPrice,
    price_desc: (a, b) => byPrice(b, a),
    rating: (a, b) => Number(b.avg_rating) - Number(a.avg_rating) || b.review_count - a.review_count,
    reviews: (a, b) => b.review_count - a.review_count || Number(b.avg_rating) - Number(a.avg_rating),
    name: (a, b) => a.name.localeCompare(b.name, 'vi'),
  };
  // Hàng hết luôn xếp sau hàng còn
  return list.sort((a, b) => (b.stock_quantity > 0) - (a.stock_quantity > 0) || (sorters[f.sort] || sorters.newest)(a, b));
}

// Đếm số bộ lọc đang bật (không tính sắp xếp)
export const countActiveFilters = (f) => [f.q, f.cat, f.price || f.min || f.max, f.rating, f.stock].filter(Boolean).length;

const Chip = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap transition ${active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}>
    {children}
  </button>
);

export default function ShopFilters({ filters, onChange, categories, total, shown }) {
  const [search, setSearch] = useState(filters.q);
  const [priceDraft, setPriceDraft] = useState({ min: filters.min, max: filters.max });
  const [showMore, setShowMore] = useState(false);

  // Gõ tìm kiếm: chờ 300ms mới lọc để không giật khi gõ nhanh
  useEffect(() => {
    if (search === filters.q) return undefined;
    const timer = setTimeout(() => onChange({ q: search }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Đồng bộ ô nhập khi bộ lọc bị xóa từ ngoài (nút Xóa bộ lọc, URL)
  useEffect(() => { setSearch(filters.q); }, [filters.q]);
  useEffect(() => { setPriceDraft({ min: filters.min, max: filters.max }); }, [filters.min, filters.max]);

  const applyCustomPrice = (e) => {
    e.preventDefault();
    const min = priceDraft.min === '' ? '' : String(Math.max(0, Number(priceDraft.min) || 0));
    const max = priceDraft.max === '' ? '' : String(Math.max(0, Number(priceDraft.max) || 0));
    // Nhập ngược (từ > đến) thì tự đảo lại
    const swap = min !== '' && max !== '' && Number(min) > Number(max);
    onChange({ price: '', min: swap ? max : min, max: swap ? min : max });
  };

  const activeCount = countActiveFilters(filters);
  const activeTags = [
    filters.q && { label: `"${filters.q}"`, clear: { q: '' } },
    filters.cat && { label: categories.find((c) => c.id === filters.cat)?.name || 'Danh mục', clear: { cat: '' } },
    filters.price && { label: PRICE_RANGES.find((r) => r.key === filters.price)?.label, clear: { price: '' } },
    (filters.min || filters.max) && {
      label: `${filters.min ? Number(filters.min).toLocaleString('vi-VN') : '0'}đ - ${filters.max ? `${Number(filters.max).toLocaleString('vi-VN')}đ` : 'không giới hạn'}`,
      clear: { min: '', max: '' },
    },
    filters.rating && { label: `Từ ${filters.rating} sao`, clear: { rating: '' } },
    filters.stock && { label: 'Còn hàng', clear: { stock: false } },
  ].filter(Boolean);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm space-y-3">
      {/* Tìm kiếm + sắp xếp */}
      <div className="flex flex-col md:flex-row gap-3">
        <label className="flex-1 flex items-center gap-2 border border-slate-200 rounded-xl px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên sản phẩm, danh mục (gõ không dấu cũng được)..."
            className="w-full py-2.5 outline-none text-sm bg-transparent" maxLength={100} />
          {search && <button type="button" onClick={() => { setSearch(''); onChange({ q: '' }); }} aria-label="Xóa từ khóa"><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>}
        </label>
        <div className="flex gap-2">
          <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} className="select select-bordered select-sm h-auto min-h-0 py-2 rounded-xl text-sm">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <button type="button" onClick={() => setShowMore((v) => !v)}
            className={`px-3 rounded-xl border text-sm flex items-center gap-1.5 whitespace-nowrap ${showMore ? 'border-teal-500 text-teal-700 bg-teal-50' : 'border-slate-200 text-slate-600'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Bộ lọc{activeCount > 0 && <span className="bg-teal-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeCount}</span>}
          </button>
        </div>
      </div>

      {/* Danh mục */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={!filters.cat} onClick={() => onChange({ cat: '' })}>Tất cả</Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={filters.cat === c.id} onClick={() => onChange({ cat: filters.cat === c.id ? '' : c.id })}>
            {c.name} <span className="opacity-60">({c.count})</span>
          </Chip>
        ))}
      </div>

      {/* Bộ lọc mở rộng */}
      {showMore && (
        <div className="grid md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Khoảng giá</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRICE_RANGES.map((r) => (
                <Chip key={r.key} active={filters.price === r.key} onClick={() => onChange({ price: filters.price === r.key ? '' : r.key, min: '', max: '' })}>{r.label}</Chip>
              ))}
            </div>
            <form onSubmit={applyCustomPrice} className="flex items-center gap-1.5">
              <input type="number" min={0} step={10000} placeholder="Từ" value={priceDraft.min} onChange={(e) => setPriceDraft({ ...priceDraft, min: e.target.value })}
                className="input input-bordered input-sm w-full" />
              <span className="text-slate-400">-</span>
              <input type="number" min={0} step={10000} placeholder="Đến" value={priceDraft.max} onChange={(e) => setPriceDraft({ ...priceDraft, max: e.target.value })}
                className="input input-bordered input-sm w-full" />
              <button type="submit" className="btn btn-sm btn-outline">Áp dụng</button>
            </form>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Đánh giá</p>
            <div className="flex flex-wrap gap-2">
              {[4, 3].map((n) => (
                <Chip key={n} active={filters.rating === String(n)} onClick={() => onChange({ rating: filters.rating === String(n) ? '' : String(n) })}>
                  <span className="inline-flex items-center gap-1">Từ {n} <Star className="w-3.5 h-3.5 fill-current" /></span>
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Tình trạng</p>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={filters.stock} onChange={(e) => onChange({ stock: e.target.checked })} />
              Chỉ hiện sản phẩm còn hàng
            </label>
          </div>
        </div>
      )}

      {/* Kết quả + bộ lọc đang bật */}
      <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
        <span className="text-slate-500">Hiển thị <b className="text-slate-800">{shown}</b> / {total} sản phẩm</span>
        {activeTags.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs">
            {t.label}
            <button type="button" onClick={() => onChange(t.clear)} aria-label={`Bỏ lọc ${t.label}`}><X className="w-3 h-3" /></button>
          </span>
        ))}
        {activeCount > 0 && (
          <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })} className="text-xs text-red-500 hover:underline ml-auto">Xóa bộ lọc</button>
        )}
      </div>
    </div>
  );
}
