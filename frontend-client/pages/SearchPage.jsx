import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { loadSearchIndex, searchIndex, groupResults } from '../utils/globalSearch';
import { ResultThumb } from '../components/GlobalSearch';

const PER_GROUP = 8;

// Trang kết quả tìm kiếm chung: /tim-kiem?q=...
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [draft, setDraft] = useState(q);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => { loadSearchIndex().then(setIndex).catch(() => setError(true)); }, []);
  useEffect(() => { setDraft(q); }, [q]);

  const groups = useMemo(() => (index ? groupResults(searchIndex(index, q), PER_GROUP) : []), [index, q]);
  const total = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) setSearchParams({ q: draft.trim() }); }}
        className="flex items-center gap-2 bg-base-100 border border-base-300 focus-within:border-primary rounded-2xl px-4 h-12 shadow-sm">
        <Search className="w-5 h-5 text-base-content/50" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tìm sản phẩm, dịch vụ, gói liệu trình, bác sĩ, bài viết..."
          maxLength={100} className="flex-1 bg-transparent outline-none" autoFocus />
        <button type="submit" className="btn btn-primary btn-sm">Tìm</button>
      </form>

      {!q.trim() ? (
        <p className="text-base-content/60">Nhập từ khoá để tìm (gõ không dấu cũng được), ví dụ: "mun", "chong nang", "retinol", "tham nam".</p>
      ) : error ? (
        <p className="text-error">Không tải được dữ liệu tìm kiếm, vui lòng thử lại.</p>
      ) : !index ? (
        <div className="flex justify-center py-16"><span className="loading loading-spinner loading-lg text-primary"></span></div>
      ) : (
        <>
          <p className="text-base-content/70">Tìm thấy <b>{total}</b> kết quả cho "<b>{q}</b>"</p>
          {total === 0 && <p className="text-base-content/60">Thử từ khoá ngắn hơn hoặc khác đi, ví dụ tên hoạt chất hoặc tên thương hiệu.</p>}
          {groups.map((g) => (
            <section key={g.key} className="bg-base-100 border border-base-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-secondary">{g.label} <span className="text-base-content/50 font-normal">({g.total})</span></h2>
                {g.total > g.items.length && (
                  <Link to={g.more(q)} className="text-sm text-primary flex items-center gap-1 hover:underline">Xem thêm <ArrowRight className="w-4 h-4" /></Link>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {g.items.map((item) => (
                  <Link key={`${item.type}-${item.id}`} to={item.to} className="flex items-center gap-3 p-2 rounded-xl hover:bg-base-200/70">
                    <ResultThumb item={item} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium line-clamp-1">{item.title}</span>
                      {item.subtitle && <span className="block text-xs text-base-content/55 line-clamp-1">{item.subtitle}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
