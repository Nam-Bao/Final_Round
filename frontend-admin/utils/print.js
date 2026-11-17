import { message } from 'antd';

// Mở chứng từ in (A5) ở tab mới: trang tự mở hộp thoại in, chọn máy in hoặc "Lưu dưới dạng PDF".
// type: invoice (phiếu thanh toán sau khám) | prescription (đơn thuốc) | order (hóa đơn bán lẻ tại quầy)
// Không dùng noopener: tab mở bằng window.open mới được sao chép phiên đăng nhập trong sessionStorage.
export const openPrint = (type, id) => {
  const tab = window.open(`/print/${type}/${id}`, `print-${type}-${id}`);
  if (!tab) message.error('Trình duyệt đã chặn tab mới. Hãy cho phép cửa sổ bật lên của trang này rồi bấm lại.');
};
