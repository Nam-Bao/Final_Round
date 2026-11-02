import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Newspaper, Search, FlaskConical, Pin, X } from 'lucide-react';

const API = 'http://localhost:4000/api/media/news';
const PAGE_SIZE = 6;

// Tin tức: danh mục và bài viết đều lấy từ service-media (phân trang ở server)
export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);
  const q = searchParams.get('q') || '';
  const tag = searchParams.get('tag') || '';
  const type = searchParams.get('type') || ''; // loại bài = tab (INTRO, EVENT, KNOWLEDGE, SKINCARE, RESEARCH)
  const [keyword, setKeyword] = useState(q);

  const [types, setTypes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    fetch(`${API}/categories`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setTypes(data.data || []))
      .catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    let isMounted = true;
    setStatus('loading');
    const query = new URLSearchParams({ page, limit: PAGE_SIZE, ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(type ? { type } : {}) });
    fetch(`${API}?${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .then((data) => {
        if (!isMounted) return;
        setArticles(data.data || []);
        setTotalPages(Math.max(data.pagination?.totalPages || 1, 1));
        setStatus('ok');
      })
      .catch(() => isMounted && setStatus('error'));
    return () => { isMounted = false; };
  }, [page, q, tag, type]);

  useEffect(() => { setKeyword(q); }, [q]);

  // Giữ các bộ lọc khác, bỏ số trang khi đổi bộ lọc
  const filters = { q, tag, type };
  const updateFilters = (patch) => setSearchParams(Object.fromEntries(Object.entries({ ...filters, ...patch }).filter(([, v]) => v)));
  const submitSearch = (e) => { e.preventDefault(); updateFilters({ q: keyword.trim() }); };
  const goTo = (n) => {
    setSearchParams(Object.fromEntries(Object.entries({ ...filters, page: n }).filter(([, v]) => v)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = types.reduce((s, t) => s + t.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Tin tức</h1>
          <p className="text-base-content/60 mt-1">Kiến thức chăm sóc da, nghiên cứu từ bác sĩ, ưu đãi và hoạt động mới nhất từ GlowSkin.</p>
        </div>
        <form onSubmit={submitSearch} className="join w-full sm:w-80">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm bài viết..." maxLength={100}
            className="input input-bordered input-sm join-item w-full" />
          <button type="submit" className="btn btn-primary btn-sm join-item text-white" aria-label="Tìm"><Search className="w-4 h-4" /></button>
        </form>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {[{ type: '', count: totalCount, label: 'Tất cả' }, ...types].map((t) => {
          const research = t.type === 'RESEARCH'; // tab nghiên cứu của bác sĩ tô màu riêng
          const active = type === t.type;
          return (
            <button key={t.type || 'all'} role="tab" aria-selected={active} onClick={() => updateFilters({ type: t.type })}
              className={`btn btn-sm rounded-full gap-1 ${research ? (active ? 'btn-secondary' : 'btn-outline btn-secondary') : (active ? 'btn-primary' : 'btn-outline btn-primary')}`}>
              {research && <FlaskConical className="w-4 h-4" />}
              {research ? 'Nghiên cứu của bác sĩ' : t.label} <span className="opacity-70">({t.count})</span>
            </button>
          );
        })}
      </div>

      {(q || tag) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {q && <span className="badge badge-lg gap-1">Từ khóa: "{q}" <button onClick={() => updateFilters({ q: '' })} aria-label="Bỏ từ khóa"><X className="w-3 h-3" /></button></span>}
          {tag && <span className="badge badge-lg gap-1">#{tag} <button onClick={() => updateFilters({ tag: '' })} aria-label="Bỏ thẻ"><X className="w-3 h-3" /></button></span>}
        </div>
      )}

      {status === 'loading' ? (
        <div className="flex justify-center items-center py-24">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : status === 'error' ? (
        <div className="alert alert-error">Không tải được tin tức, vui lòng thử lại sau.</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">{q || tag ? 'Không tìm thấy bài viết phù hợp.' : 'Chưa có bài viết nào trong danh mục này.'}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <Link
                key={a.id}
                to={`/news/${a.slug}`}
                className="card bg-base-100 shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden border border-base-200"
              >
                <figure className="relative">
                  {(a.is_featured || a.article_type === 'RESEARCH') && (
                    <div className="absolute top-2 left-2 flex gap-1">
                      {a.is_featured && <span className="badge badge-warning gap-1 text-xs"><Pin className="w-3 h-3" /> Nổi bật</span>}
                      {a.article_type === 'RESEARCH' && <span className="badge badge-secondary gap-1 text-xs"><FlaskConical className="w-3 h-3" /> Nghiên cứu</span>}
                    </div>
                  )}
                  {a.thumbnail_url ? (
                    <img src={a.thumbnail_url} alt={a.title} className="h-44 w-full object-cover" />
                  ) : (
                    <div className="h-44 w-full bg-primary/10 flex items-center justify-center">
                      <Newspaper className="w-10 h-10 text-primary/50" />
                    </div>
                  )}
                </figure>
                <div className="card-body">
                  <div className="flex justify-between items-center text-xs text-base-content/60">
                    <span>{dayjs(a.published_at).format('DD/MM/YYYY')}</span>
                    <span className="badge badge-sm badge-outline badge-primary">{a.category}</span>
                  </div>
                  <h2 className="card-title text-secondary line-clamp-2 mt-1">{a.title}</h2>
                  <p className="text-gray-600 line-clamp-3">{a.summary}</p>
                  {a.author_name && <p className="text-xs text-base-content/50 mt-1">{a.author_name}{a.author_title ? ` · ${a.author_title}` : ''}</p>}
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center">
              <div className="join">
                <button className="join-item btn btn-sm" disabled={page === 1} onClick={() => goTo(page - 1)} aria-label="Trang trước">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={`join-item btn btn-sm ${n === page ? 'btn-primary' : ''}`} onClick={() => goTo(n)}>
                    {n}
                  </button>
                ))}
                <button className="join-item btn btn-sm" disabled={page === totalPages} onClick={() => goTo(page + 1)} aria-label="Trang sau">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
