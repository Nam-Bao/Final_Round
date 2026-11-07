// Đặt tiêu đề tab và thẻ meta cho 1 trang. Trả về hàm khôi phục khi rời trang.
const setMeta = (attribute, key, content) => {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  const created = !tag;
  const previous = tag?.getAttribute('content');
  if (created) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
  return () => (created ? tag.remove() : tag.setAttribute('content', previous));
};

export const applyPageMeta = ({ title, description, image, url }) => {
  const previousTitle = document.title;
  document.title = title;
  const restores = [
    setMeta('property', 'og:type', 'article'),
    setMeta('property', 'og:title', title),
    setMeta('property', 'og:url', url),
    ...(description ? [setMeta('name', 'description', description), setMeta('property', 'og:description', description)] : []),
    ...(image ? [setMeta('property', 'og:image', image), setMeta('name', 'twitter:card', 'summary_large_image')] : []),
  ];
  return () => {
    document.title = previousTitle;
    restores.forEach((restore) => restore());
  };
};
