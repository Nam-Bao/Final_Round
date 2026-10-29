import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { useAuthStore } from '../store/authStore';

const VideoCallModal = ({ appointmentId, userName, isOpen, onClose }) => {
  const containerRef = useRef(null);
  const zpRef = useRef(null);
  // Giữ onClose trong ref để cha render lại (truyền arrow function mới) không làm rớt cuộc gọi
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const token = useAuthStore((state) => state.token);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !appointmentId) return;
    let cancelled = false;
    setError('');
    setLoading(true);

    const joinRoom = async () => {
      try {
        // Booking kiểm tra quyền + khung giờ rồi ký token Zego, frontend không giữ serverSecret
        const res = await axios.get(`http://localhost:4000/api/booking/appointments/${appointmentId}/video-token`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        const { appID, userID, roomID, token: zegoToken } = res.data.data;
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
          appID,
          zegoToken,
          roomID,
          userID,
          userName || "Khách hàng GlowSkin"
        );

        // Tạo đối tượng SDK ZegoCloud
        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;

        // Cấu hình giao diện khám 1-1 hỗ trợ chia sẻ màn hình
        zp.joinRoom({
          container: containerRef.current,
          scenario: {
            mode: ZegoUIKitPrebuilt.OneONoneCall,
          },
          showScreenSharingButton: true, // Cho phép chia sẻ màn hình xem hình ảnh da
          showPreJoinView: false,        // Vào thẳng phòng khám không cần màn hình chờ
          onLeaveRoom: () => onCloseRef.current?.(),
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Không thể kết nối phòng khám video');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    joinRoom();

    return () => {
      cancelled = true;
      if (zpRef.current) {
        zpRef.current.destroy();
        zpRef.current = null;
      }
    };
  }, [isOpen, appointmentId, userName, token]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-5xl h-[85vh] bg-base-100 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header Phòng Tư Vấn Online */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <h3 className="font-bold text-lg text-base-content">
                Phòng Khám Da Liễu Từ Xa - GlowSkin O2O
              </h3>
              <p className="text-xs text-base-content/60">Mã lịch hẹn: #{String(appointmentId).slice(0, 8).toUpperCase()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-base-content hover:bg-base-200"
          >
            ✕
          </button>
        </div>

        {/* Khung chứa Màn hình Video Call */}
        <div className="relative w-full flex-1 bg-slate-950">
          <div ref={containerRef} className="absolute inset-0" />
          {(loading || error) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-lg"></span>
                  <p>Đang kết nối phòng khám...</p>
                </>
              ) : (
                <>
                  <p className="max-w-md">{error}</p>
                  <button onClick={onClose} className="btn btn-sm">Đóng</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCallModal;
