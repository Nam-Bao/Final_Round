// navigator.clipboard chỉ có trên https hoặc localhost; vào bằng địa chỉ IP trong mạng nội bộ thì dùng cách cũ
export const copyText = async (text) => {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
};
