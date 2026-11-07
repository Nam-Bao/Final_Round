import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 400;

// Nút lên đầu trang, chỉ hiện khi đã cuộn xuống
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  if (!visible) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Lên đầu trang" title="Lên đầu trang"
      className="btn btn-circle w-12 h-12 min-h-12 mb-3 bg-base-100 border-base-300 text-primary shadow-lg hover:bg-base-200 animate-fade-in">
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
