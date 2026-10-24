import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';
import { NEWS_TABS, ARTICLES, PAGE_SIZE, formatDate } from '../data/mockNews';

export default function NewsPage() {
  const [tab, setTab] = useState('news');
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState(ARTICLES);
  const [loading, setLoading] = useState(true);

  // Ánh xạ an toàn danh mục từ database sang tab frontend
  const mapCategoryToTab = (cat) => {
    if (!cat) return 'news';
    const lower = String(cat).toLowerCase();
    if (lower.includes('sự kiện') || lower.includes('event')) return 'event';
    if (lower.includes('giới thiệu') || lower.includes('about')) return 'about';
    return 'news';
  };

  useEffect(() => {
    let isMounted = true;

    fetch('http://localhost:4000/api/media/news')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể kết nối API tin tức');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;

        const rawList = Array.isArray(data) ? data : (data.data || []);
        if (rawList.length > 0) {
          const normalized = rawList.map((item) => ({
            id: item.id,
            slug: item.slug,
            category: mapCategoryToTab(item.category),
            categoryLabel: item.category || 'Tin tức',
            date: item.published_at || item.createdAt || item.date || new Date().toISOString(),
            image: item.image_url || item.thumbnail_url || item.image || null,
            title: item.title,
            summary: item.summary || item.description || (Array.isArray(item.content) ? item.content[0] : item.content) || '',
            content: item.content
          }));
          setArticles(normalized);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Dùng dữ liệu fallback do chưa kết nối được API:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const list = useMemo(() => {
    return articles
      .filter((a) => a.category === tab)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [articles, tab]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageItems = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeTab = (id) => {
    setTab(id);
    setPage(1);
  };

  const goTo = (n) => {
    setPage(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary">Tin tức và sự kiện</h1>
        <p className="text-base-content/60 mt-1">Kiến thức chăm sóc da và hoạt động mới nhất từ GlowSkin.</p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {NEWS_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={`btn btn-sm rounded-full ${tab === t.id ? 'btn-primary' : 'btn-outline btn-primary'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-16 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Chưa có bài viết nào trong danh mục này.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((a) => (
              <Link
                key={a.slug || a.id}
                to={`/news/${a.slug || a.id}`}
                className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow duration-300 overflow-hidden border border-base-200"
              >
                <figure>
                  {a.image ? (
                    <img src={a.image} alt={a.title} className="h-44 w-full object-cover" />
                  ) : (
                    <div className="h-44 w-full bg-primary/10 flex items-center justify-center">
                      <Newspaper className="w-10 h-10 text-primary/50" />
                    </div>
                  )}
                </figure>
                <div className="card-body">
                  <div className="flex justify-between items-center text-xs text-base-content/60">
                    <span>{formatDate(a.date)}</span>
                    <span className="badge badge-sm badge-outline badge-primary">{a.categoryLabel}</span>
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
                <button
                  className="join-item btn btn-sm"
                  disabled={page === 1}
                  onClick={() => goTo(page - 1)}
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`join-item btn btn-sm ${n === page ? 'btn-primary' : ''}`}
                    onClick={() => goTo(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  className="join-item btn btn-sm"
                  disabled={page === totalPages}
                  onClick={() => goTo(page + 1)}
                  aria-label="Trang sau"
                >
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