import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';

const API = 'http://localhost:4000/api/media/news';
const PAGE_SIZE = 6;

// Tin tức: danh mục và bài viết đều lấy từ service-media (phân trang ở server)
export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);

  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    fetch(`${API}/categories`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setCategories(data.data || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let isMounted = true;
    setStatus('loading');
    const query = new URLSearchParams({ page, limit: PAGE_SIZE, ...(category ? { category } : {}) });
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
  }, [category, page]);

  const changeCategory = (value) => setSearchParams(value ? { category: value } : {});
  const goTo = (n) => {
    setSearchParams({ ...(category ? { category } : {}), page: n });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalCount = categories.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Tin tức</h1>
        <p className="text-base-content/60 mt-1">Kiến thức chăm sóc da, ưu đãi và hoạt động mới nhất từ GlowSkin.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {[{ category: '', count: totalCount, label: 'Tất cả' }, ...categories].map((c) => (
          <button
            key={c.category || 'all'}
            role="tab"
            aria-selected={category === c.category}
            onClick={() => changeCategory(c.category)}
            className={`btn btn-sm rounded-full ${category === c.category ? 'btn-primary' : 'btn-outline btn-primary'}`}
          >
            {c.label || c.category} <span className="opacity-70">({c.count})</span>
          </button>
        ))}
      </div>

      {status === 'loading' ? (
        <div className="flex justify-center items-center py-24">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      ) : status === 'error' ? (
        <div className="alert alert-error">Không tải được tin tức, vui lòng thử lại sau.</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Chưa có bài viết nào trong danh mục này.</p>
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
                <figure>
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
