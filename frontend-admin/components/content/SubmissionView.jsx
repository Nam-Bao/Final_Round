import React, { useState } from 'react';
import { Tag, Timeline, Button, Modal, Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ArticleBody, { VideoEmbed } from './ArticleBody';
import { REVIEW_ACTION } from './contentApi';

// Xem bài như khách sẽ thấy trên web (dùng cho cả bản hiện tại và các phiên bản cũ đã gửi)
export function ArticlePreview({ article, authorName, authorAvatar }) {
  return (
    <article className="space-y-4 max-w-3xl mx-auto">
      {article.category && <Tag color="purple">{article.category}</Tag>}
      <h1 className="text-2xl font-bold text-slate-800 leading-snug !mb-0">{article.title}</h1>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Avatar size="small" src={authorAvatar} icon={!authorAvatar && <UserOutlined />} />
        <span className="font-medium text-gray-700">{authorName}</span>
        {article.author_title && <span>· {article.author_title}</span>}
      </div>
      {article.thumbnail_url && <img src={article.thumbnail_url} alt="" className="w-full max-h-80 object-cover rounded-xl" />}
      {article.summary && <p className="text-base font-medium text-slate-700 leading-relaxed">{article.summary}</p>}
      {article.video_url && <VideoEmbed url={article.video_url} />}
      <ArticleBody content={article.content} />
      {article.tags?.length > 0 && <div className="flex flex-wrap gap-1">{article.tags.map((t) => <Tag key={t}>#{t}</Tag>)}</div>}
      {article.sources?.length > 0 && (
        <div className="border-t pt-3">
          <div className="font-semibold text-slate-700 mb-1">Tài liệu tham khảo</div>
          <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-0.5">{article.sources.map((s, i) => <li key={i} className="break-words">{s}</li>)}</ol>
        </div>
      )}
    </article>
  );
}

// Lịch sử gửi / duyệt; mỗi lần gửi xem lại được nội dung đã gửi lúc đó
export function ReviewHistory({ submission }) {
  const [snapshot, setSnapshot] = useState(null);
  const reviews = submission.reviews || [];
  if (!reviews.length) return <p className="text-gray-400 text-sm">Chưa gửi duyệt lần nào.</p>;
  return (
    <>
      <Timeline items={reviews.map((r) => {
        const action = REVIEW_ACTION[r.action] || { color: 'gray', label: r.action };
        return {
          color: action.color === 'default' ? 'gray' : action.color,
          children: (
            <div className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Tag color={action.color}>{action.label}</Tag>
                <span className="text-gray-500">Bản {r.version} · {dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}</span>
                {r.snapshot && <Button size="small" type="link" className="!px-0" onClick={() => setSnapshot(r)}>Xem nội dung đã gửi</Button>}
              </div>
              {r.note && (
                <div className={`mt-1 whitespace-pre-line rounded-md px-3 py-2 ${r.action === 'CHANGES_REQUESTED' ? 'bg-orange-50 border border-orange-200 text-orange-900' : 'bg-gray-50 text-gray-700'}`}>
                  {r.note}
                </div>
              )}
            </div>
          ),
        };
      })} />
      <Modal title={snapshot ? `Nội dung bản ${snapshot.version} (gửi lúc ${dayjs(snapshot.createdAt).format('HH:mm DD/MM/YYYY')})` : ''}
        open={!!snapshot} onCancel={() => setSnapshot(null)} footer={null} width={860} centered
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}>
        {snapshot && <ArticlePreview article={snapshot.snapshot} authorName={submission.author_name} authorAvatar={submission.author_avatar} />}
      </Modal>
    </>
  );
}
