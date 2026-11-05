import { message } from 'antd';

// Mở phòng video ở tab mới để bác sĩ / chuyên gia vừa gọi vừa thao tác trên hệ thống.
// Không dùng noopener: tab mở bằng window.open mới được sao chép phiên đăng nhập trong sessionStorage.
// Tên tab theo lịch hẹn: bấm lại sẽ quay về đúng tab đang gọi, không mở thêm cuộc gọi thứ 2.
export const openVideoCall = ({ id, kind = 'appointment', name = '' }) => {
  const params = new URLSearchParams({ id, kind, name });
  const tab = window.open(`/video-call?${params}`, `video-${id}`);
  if (!tab) message.error('Trình duyệt đã chặn tab mới. Hãy cho phép cửa sổ bật lên của trang này rồi bấm lại.');
};
