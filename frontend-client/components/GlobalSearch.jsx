import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, X, Loader2, ArrowRight } from 'lucide-react';
import { loadSearchIndex, searchIndex, groupResults } from '../utils/globalSearch';

const PER_GROUP = 3;

// Ảnh nhỏ cho 1 kết quả (bác sĩ: ảnh tròn)
export function ResultThumb({ item }) {
  const round = item.type === 'doctor' ? 'rounded-full' : 'rounded-lg';
  return item.image
    ? <img src={item.image} alt="" loading="lazy" className={`w-10 h-10 object-cover shrink-0 bg-slate-100 ${round}`} />
    : <span className={`w-10 h-10 shrink-0 bg-slate-100 ${round}`} />;
}

// Ô tìm kiếm chung trên thanh menu: gợi ý tức thì theo nhóm, Enter => trang /tim-kiem
export default function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // Chuyển trang => đóng gợi ý
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  // Bấm ra ngoài => đóng
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const ensureIndex = () => {
    if (index || loading) return;
    setLoading(true);
    loadSearchIndex().then(setIndex).catch(() => {}).finally(() => setLoading(false));
  };

  const groups = useMemo(() => (index && q.trim() ? groupResults(searchIndex(index, q), PER_GROUP) : []), [index, q]);
  const total = groups.reduce((s, g) => s + g.total, 0);

  const submit = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/tim-kiem?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div ref={boxRef} className="relative">
      <form onSubmit={submit} role="search"
        className="flex items-center gap-2 bg-base-200/70 border border-transparent focus-within:border-primary focus-within:bg-base-100 rounded-full px-3 h-9 w-44 xl:w-64 transition-all">
        <Search className="w-4 h-4 text-base-content/50 shrink-0" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { ensureIndex(); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          placeholder="Tìm sản phẩm, dịch vụ, bác sĩ..." maxLength={100} aria-label="Tìm kiếm"
          className="w-full bg-transparent outline-none text-sm" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Xoá"><X className="w-4 h-4 text-base-content/40 hover:text-base-content" /></button>}
      </form>

      {open && q.trim() && (
        <div className="absolute right-0 mt-2 w-[26rem] max-w-[90vw] max-h-[70vh] overflow-y-auto bg-base-100 border border-base-200 rounded-2xl shadow-xl z-[60]">
          {!index ? (
            <div className="flex items-center gap-2 p-4 text-sm text-base-content/60"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải dữ liệu tìm kiếm...</div>
          ) : total === 0 ? (
            <div className="p-4 text-sm text-base-content/60">Không tìm thấy kết quả cho "<b>{q.trim()}</b>".</div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.key} className="py-2 border-b border-base-200 last:border-0">
                  <div className="flex items-center justify-between px-4 py-1">
                    <span className="text-xs font-semibold uppercase text-base-content/50">{g.label} ({g.total})</span>
                  </div>
                  {g.items.map((item) => (
                    <Link key={`${item.type}-${item.id}`} to={item.to} className="flex items-center gap-3 px-4 py-2 hover:bg-base-200/70">
                      <ResultThumb item={item} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium line-clamp-1">{item.title}</span>
                        {item.subtitle && <span className="block text-xs text-base-content/55 line-clamp-1">{item.subtitle}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
              <button type="button" onClick={submit} className="w-full flex items-center justify-center gap-1 p-3 text-sm font-medium text-primary hover:bg-base-200/70">
                Xem tất cả {total} kết quả <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
