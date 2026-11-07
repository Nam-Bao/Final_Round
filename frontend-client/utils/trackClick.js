const API = '/api/media/pages';

// Đếm lượt bấm banner / popup. Mỗi phiên chỉ tính 1 lần cho mỗi mục; keepalive để không mất khi trang chuyển đi
export const trackClick = (kind, id) => {
  const key = `clicked:${kind}:${id}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  fetch(`${API}/${kind}/${id}/click`, { method: 'POST', keepalive: true }).catch(() => {});
};
