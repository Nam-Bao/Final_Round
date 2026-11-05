import React, { useEffect, useRef, useState } from 'react';
import { Spin, Result, Button } from 'antd';
import { VideoCameraOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

// Phòng video phía bác sĩ / chuyên gia, chạy ở tab riêng (mở bằng utils/videoCall.js).
// kind=appointment: phòng khám theo lịch hẹn; kind=consultation: phòng tư vấn của chuyên gia
export default function VideoCallPage() {
  const [params] = useSearchParams();
  const id = params.get('id');
  const isConsult = params.get('kind') === 'consultation';
  const patientName = params.get('name') || 'Khách hàng';
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    document.title = `${isConsult ? 'Tư vấn' : 'Khám'} online - ${patientName}`;
    const token = sessionStorage.getItem('admin_token');
    if (!id || !token) {
      setError('Phiên làm việc không có trong tab này. Hãy mở lại cuộc gọi từ trang làm việc.');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let zp = null;

    const joinRoom = async () => {
      try {
        const res = await axios.get(`http://localhost:4000/api/booking/${isConsult ? 'consultations' : 'appointments'}/${id}/video-token`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        const adminUser = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
        const ownName = adminUser?.Profile?.full_name;
        const displayName = isConsult ? (ownName || 'Chuyên gia GlowSkin') : (ownName ? `BS. ${ownName}` : 'Bác sĩ GlowSkin');

        const { appID, userID, roomID, token: zegoToken } = res.data.data;
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(appID, zegoToken, roomID, userID, displayName);

        zp = ZegoUIKitPrebuilt.create(kitToken);
        zp.joinRoom({
          container: containerRef.current,
          scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
          showScreenSharingButton: true, // Bác sĩ có thể chia sẻ ảnh da / phác đồ cho khách
          showPreJoinView: false,
          onLeaveRoom: () => { setLeft(true); window.close(); },
        });
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Không thể kết nối phòng video');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    joinRoom();
    return () => {
      cancelled = true;
      zp?.destroy();
    };
  }, [id, isConsult, patientName]);

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <div className="px-4 py-2 text-white text-sm flex items-center gap-2">
        <VideoCameraOutlined className="text-green-400" />
        <span className="font-semibold">{isConsult ? 'Tư vấn online' : 'Khám online'} - {patientName}</span>
        <span className="text-slate-400 hidden md:inline">Quay lại tab làm việc để nhập kết quả, cuộc gọi vẫn tiếp tục.</span>
      </div>
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && <div className="absolute inset-0 flex items-center justify-center"><Spin size="large" description="Đang kết nối phòng video..."><div className="p-12" /></Spin></div>}
        {(error || left) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Result status={left ? 'success' : 'warning'} title={left ? 'Đã rời phòng, bạn có thể đóng tab này' : error} extra={<Button onClick={() => window.close()}>Đóng tab</Button>} />
          </div>
        )}
      </div>
    </div>
  );
}
