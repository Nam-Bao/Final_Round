import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, Calendar, Eye, Clock, Newspaper, FlaskConical, Link2, Check, BookOpen, Stethoscope } from 'lucide-react';
import ArticleBody, { VideoEmbed } from '../components/ArticleBody';
import { applyPageMeta } from '../utils/pageMeta';
import { copyText } from '../utils/copyText';

const API = '/api/media/news';

// Thời gian đọc ước tính: ~220 từ / phút
const readingMinutes = (text = '') => Math.max(1, Math.round(String(text).split(/\s+/).filter(Boolean).length / 220));

export default function NewsDetailPage() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [related, setRelated] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error
  const [copied, setCopied] = useState(false);

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
        const list = await fetch(`${API}?limit=4&type=${encodeURIComponent(data.article_type)}`).then((r) => (r.ok ? r.json() : { data: [] }));
        if (isMounted) setRelated((list.data || []).filter((a) => a.id !== data.id).slice(0, 3));
      })
      .catch(() => isMounted && setStatus('error'));
    return () => { isMounted = false; };
  }, [slug]);

  // Tiêu đề, mô tả, ảnh cho Google và khi chia sẻ; quản lý không nhập thì lấy từ chính bài viết
  useEffect(() => {
    if (!article) return undefined;
    return applyPageMeta({
      title: `${article.seo_title || article.title} | GlowSkin Clinic`,
      description: article.seo_description || article.summary,
      image: article.share_image || article.thumbnail_url,
      url: window.location.href,
    });
  }, [article]);

  const copyLink = async () => {
    try {
      await copyText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* trình duyệt chặn clipboard */ }
  };

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

  const isResearch = article.article_type === 'RESEARCH';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="text-sm breadcrumbs text-base-content/60">
        <ul>
          <li><Link to="/news" className="gap-1"><ArrowLeft className="w-4 h-4" /> Tin tức</Link></li>
          <li><Link to={`/news?type=${article.article_type}`}>{article.category}</Link></li>
        </ul>
      </div>

      <article className="bg-white rounded-3xl border border-base-200 shadow-sm p-5 sm:p-8 space-y-5">
        <div className="flex flex-wrap gap-2">
          <Link to={`/news?type=${article.article_type}`} className={`badge gap-1 ${isResearch ? 'badge-secondary' : 'badge-primary badge-outline'}`}>
            {isResearch && <FlaskConical className="w-3 h-3" />}{article.category}
          </Link>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary leading-snug">{article.title}</h1>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-base-200 py-3">
          <div className="flex items-center gap-3">
            {article.author_avatar
              ? <img src={article.author_avatar} alt={article.author_name} className="w-10 h-10 rounded-full object-cover" />
              : <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">{isResearch ? <Stethoscope className="w-5 h-5" /> : <Newspaper className="w-5 h-5" />}</div>}
            <div className="leading-tight">
              <div className="font-semibold text-slate-800">{article.author_name || 'Ban biên tập GlowSkin'}</div>
              {article.author_title && <div className="text-xs text-base-content/60">{article.author_title}</div>}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-base-content/60">
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {dayjs(article.published_at).format('DD/MM/YYYY')}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {readingMinutes(article.content)} phút đọc</span>
            <span className="flex items-center gap-1"><Eye className="w-4 h-4" /> {(article.view_count || 0).toLocaleString('vi-VN')} lượt xem</span>
          </div>
        </div>

        {article.summary && <p className="text-lg font-medium text-slate-700 leading-relaxed">{article.summary}</p>}
        {article.video_url
          ? <VideoEmbed url={article.video_url} title={article.title} />
          : article.thumbnail_url && <img src={article.thumbnail_url} alt={article.title} className="w-full max-h-[420px] object-cover rounded-2xl" />}

        <ArticleBody content={article.content} />

        {article.sources?.length > 0 && (
          <section className="bg-slate-50 rounded-2xl p-4 sm:p-5">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-primary" /> Tài liệu tham khảo</h2>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600">
              {article.sources.map((s, i) => (
                <li key={i} className="break-words">
                  {/^https:\/\/\S+$/.test(s) ? <a href={s} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">{s}</a> : s}
                </li>
              ))}
            </ol>
          </section>
        )}

        {isResearch && (
          <p className="text-xs text-base-content/50 italic">
            Nội dung mang tính tham khảo, không thay thế chẩn đoán của bác sĩ. Vui lòng <Link to="/booking" className="underline">đặt lịch khám</Link> để được tư vấn phù hợp với tình trạng da của bạn.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-200 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {(article.tags || []).map((t) => (
              <Link key={t} to={`/news?tag=${encodeURIComponent(t)}`} className="badge badge-ghost hover:badge-primary">#{t}</Link>
            ))}
          </div>
          <button onClick={copyLink} className="btn btn-sm btn-outline gap-1">
            {copied ? <><Check className="w-4 h-4" /> Đã sao chép</> : <><Link2 className="w-4 h-4" /> Sao chép liên kết</>}
          </button>
        </div>
      </article>

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-secondary">Bài viết cùng chủ đề</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((a) => (
              <Link key={a.id} to={`/news/${a.slug}`} className="card bg-base-100 border border-base-200 overflow-hidden hover:shadow-md transition-shadow">
                {a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt={a.title} className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-28 bg-primary/10 flex items-center justify-center"><Newspaper className="w-6 h-6 text-primary/50" /></div>
                )}
                <div className="p-3 space-y-1">
                  <span className="text-sm font-semibold text-secondary line-clamp-2">{a.title}</span>
                  <span className="text-xs text-base-content/50">{dayjs(a.published_at).format('DD/MM/YYYY')}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
