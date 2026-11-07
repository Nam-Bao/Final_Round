import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Sang trang mới thì về đầu trang. Bấm nút quay lại giữ vị trí cũ, link có #mục thì để trang tự cuộn tới mục đó
export default function ScrollManager({ onNavigate }) {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    onNavigate?.();
    if (navigationType === 'POP' || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
