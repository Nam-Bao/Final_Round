import React from 'react';

// Hiển thị nội dung bài viết. Giống frontend-admin/components/content/ArticleBody.jsx (bản xem trước khi soạn) — sửa cú pháp thì sửa cả hai.
// Cú pháp: ## Tiêu đề, ### Tiêu đề nhỏ, > trích dẫn, - gạch đầu dòng, 1. danh sách số, **đậm**, [chữ](link),
// ![chú thích](https://ảnh), !video[chú thích](https://youtube hoặc mp4). Chỉ dựng bằng React, không chèn HTML thô.

const IMAGE = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;
const VIDEO = /^!video\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;
const BULLET = /^[-•*]\s+/;
const NUMBER = /^\d+[.)]\s+/;

export const youtubeId = (url = '') => url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1] || null;

export function VideoEmbed({ url, title }) {
  const id = youtubeId(url);
  if (id) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingTop: '56.25%' }}>
        <iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube-nocookie.com/embed/${id}`} title={title || 'Video'}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
      </div>
    );
  }
  return <video src={url} controls preload="metadata" className="w-full rounded-xl bg-black max-h-[480px]" />;
}

// **đậm** và [chữ](https://... hoặc /duong-dan)
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https:\/\/|\/)[^)\s]*\))/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold text-slate-800">{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]*)\)$/);
    if (link) return <a key={i} href={link[2]} target={link[2].startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="text-teal-700 underline">{link[1]}</a>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// Tách nội dung thành các khối: heading, quote, list, image, video, paragraph
export const parseBlocks = (content) => {
  const blocks = [];
  let current = null;
  const flush = () => { if (current) blocks.push(current); current = null; };
  for (const raw of String(content || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    let m;
    if ((m = line.match(VIDEO))) { flush(); blocks.push({ type: 'video', caption: m[1], url: m[2] }); continue; }
    if ((m = line.match(IMAGE))) { flush(); blocks.push({ type: 'image', caption: m[1], url: m[2] }); continue; }
    if (line.startsWith('### ')) { flush(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    const kind = line.startsWith('>') ? 'quote' : BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : 'p';
    const value = kind === 'quote' ? line.replace(/^>\s?/, '') : kind === 'ul' ? line.replace(BULLET, '') : kind === 'ol' ? line.replace(NUMBER, '') : line;
    if (!current || current.type !== kind) { flush(); current = { type: kind, lines: [] }; }
    current.lines.push(value);
  }
  flush();
  return blocks;
};

export default function ArticleBody({ content }) {
  return (
    <div className="space-y-4 text-[15px] text-slate-600 leading-relaxed">
      {parseBlocks(content).map((b, idx) => {
        switch (b.type) {
          case 'h2': return <h2 key={idx} className="text-xl font-bold text-slate-800 pt-2"><Inline text={b.text} /></h2>;
          case 'h3': return <h3 key={idx} className="text-lg font-semibold text-slate-800"><Inline text={b.text} /></h3>;
          case 'quote': return <blockquote key={idx} className="border-l-4 border-teal-500 bg-teal-50/60 rounded-r-lg px-4 py-3 italic text-slate-700">{b.lines.map((l, i) => <p key={i}><Inline text={l} /></p>)}</blockquote>;
          case 'ul': return <ul key={idx} className="list-disc pl-6 space-y-1">{b.lines.map((l, i) => <li key={i}><Inline text={l} /></li>)}</ul>;
          case 'ol': return <ol key={idx} className="list-decimal pl-6 space-y-1">{b.lines.map((l, i) => <li key={i}><Inline text={l} /></li>)}</ol>;
          case 'image': return (
            <figure key={idx} className="space-y-1.5">
              <img src={b.url} alt={b.caption || ''} loading="lazy" className="w-full rounded-xl object-cover" />
              {b.caption && <figcaption className="text-center text-sm text-slate-500 italic">{b.caption}</figcaption>}
            </figure>
          );
          case 'video': return (
            <figure key={idx} className="space-y-1.5">
              <VideoEmbed url={b.url} title={b.caption} />
              {b.caption && <figcaption className="text-center text-sm text-slate-500 italic">{b.caption}</figcaption>}
            </figure>
          );
          default: return <p key={idx}>{b.lines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}<Inline text={l} /></React.Fragment>)}</p>;
        }
      })}
    </div>
  );
}
