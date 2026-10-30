import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, Calendar, User, Newspaper } from 'lucide-react';

const API = 'http://localhost:4000/api/media/news';

// Nội dung bài viết là văn bản thuần: đoạn cách nhau bằng dòng trống, dòng "- " là gạch đầu dòng, "1. " là danh sách số.
// Hiển thị bằng React (không dùng HTML thô) nên nội dung không chèn được mã độc.
function ArticleContent({ content }) {
  const blocks = String(content || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-base-content/80 leading-relaxed">
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        const bullets = lines.filter((l) => /^[-•]\s+/.test(l));
        const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l));
        // Đoạn có tiêu đề + danh sách (vd. "Quyền lợi:" rồi các dòng "- ...")
        if (bullets.length || numbered.length) {
          const isNumbered = numbered.length > bullets.length;
          const items = isNumbered ? numbered : bullets;
          const intro = lines.filter((l) => !items.includes(l));
          const List = isNumbered ? 'ol' : 'ul';
          return (
            <div key={idx} className="space-y-2">
              {intro.map((l, i) => <p key={i} className="font-medium text-base-content">{l}</p>)}
              <List className={`${isNumbered ? 'list-decimal' : 'list-disc'} pl-6 space-y-1`}>
                {items.map((l, i) => <li key={i}>{l.replace(/^([-•]|\d+[.)])\s+/, '')}</li>)}
              </List>
            </div>
          );
        }
        return <p key={idx} className="whitespace-pre-line">{block}</p>;
      })}
    </div>
  );
}

export default function NewsDetailPage() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let isMounted = true;
    setStatus('loading');
    window.scrollTo({ top: 0 });
    fetch(`${API}/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (res.status === 404) return isMounted && setStatus('notfound');
        if (!res.ok) throw new Error(res.status);
        const data = (await res.json()).data;
        if (!isMounted) return;
        setArticle(data);
        setStatus('ok');
        // Bài cùng danh mục
        const list = await fetch(`${API}?limit=4&category=${encodeURIComponent(data.category)}`).then((r) => (r.ok ? r.json() : { data: [] }));
        if (isMounted) setRelated((list.data || []).filter((a) => a.id !== data.id).slice(0, 3));
      })
      .catch(() => isMounted && setStatus('error'));
    return () => { isMounted = false; };
  }, [slug]);

  if (status === 'loading') {
    return <div className="flex justify-center py-24"><span className="loading loading-spinner loading-lg text-primary"></span></div>;
  }
  if (status !== 'ok') {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-base-content/60">
          {status === 'notfound' ? 'Bài viết không tồn tại hoặc đã được gỡ.' : 'Không tải được bài viết, vui lòng thử lại sau.'}
        </p>
        <Link to="/news" className="btn btn-primary btn-sm">Quay lại Tin tức</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <Link to="/news" className="btn btn-ghost btn-sm gap-1">
        <ArrowLeft className="w-4 h-4" /> Tin tức
      </Link>

      <article className="space-y-5">
        <Link to={`/news?category=${encodeURIComponent(article.category)}`} className="badge badge-primary badge-outline">
          {article.category}
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary leading-snug">{article.title}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-base-content/60">
          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {dayjs(article.published_at).format('DD/MM/YYYY')}</span>
          {article.author_name && <span className="flex items-center gap-1"><User className="w-4 h-4" /> {article.author_name}</span>}
        </div>

        {article.thumbnail_url && (
          <img src={article.thumbnail_url} alt={article.title} className="w-full max-h-96 object-cover rounded-2xl" />
        )}
        {article.summary && <p className="text-lg font-medium text-base-content/80 leading-relaxed">{article.summary}</p>}
        <ArticleContent content={article.content} />
      </article>

      {related.length > 0 && (
        <section className="space-y-3 border-t border-base-200 pt-6">
          <h2 className="text-lg font-bold text-secondary">Bài viết cùng chủ đề</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((a) => (
              <Link key={a.id} to={`/news/${a.slug}`} className="card bg-base-100 border border-base-200 overflow-hidden hover:shadow-md transition-shadow">
                {a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt={a.title} className="h-24 w-full object-cover" />
                ) : (
                  <div className="h-24 bg-primary/10 flex items-center justify-center"><Newspaper className="w-6 h-6 text-primary/50" /></div>
                )}
                <span className="p-3 text-sm font-semibold text-secondary line-clamp-2">{a.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
