import React, { useEffect, useState } from 'react';
import { Star, X } from 'lucide-react';

const RATING_LABELS = ['', 'Rất tệ', 'Không hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];

// Hộp thoại chấm sao + nhận xét, dùng cho cả đánh giá sản phẩm và bác sĩ
export default function ReviewModal({ isOpen, title, subtitle, onClose, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setRating(5); setHover(0); setComment(''); setError(''); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ rating, comment: comment.trim() });
    } catch (err) {
      setError(err.response?.data?.message || 'Không gửi được đánh giá, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  const shown = hover || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg text-slate-800">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} aria-label={`${n} sao`}>
                <Star className={`w-9 h-9 ${n <= shown ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
          <span className="text-sm font-medium text-amber-600">{RATING_LABELS[shown]}</span>
        </div>

        <textarea
          className="textarea textarea-bordered w-full h-28"
          placeholder="Chia sẻ trải nghiệm thật của bạn (không bắt buộc)"
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {error && <div className="alert alert-error text-sm py-2">{error}</div>}

        <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full">
          {submitting ? <span className="loading loading-spinner loading-sm"></span> : 'Gửi đánh giá'}
        </button>
      </div>
    </div>
  );
}
