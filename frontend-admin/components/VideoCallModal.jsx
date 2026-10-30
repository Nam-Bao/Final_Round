import React, { useEffect, useRef, useState } from 'react';
import { Modal, Spin, Result, Button } from 'antd';
import { VideoCameraOutlined } from '@ant-design/icons';
import axios from 'axios';
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';

// Phòng khám video phía Bác sĩ — dùng chung phòng với khách theo ID lịch hẹn
const VideoCallModal = ({ appointmentId, patientName, open, onClose }) => {
  const containerRef = useRef(null);
  const zpRef = useRef(null);
  // Giữ onClose trong ref để cha render lại không làm rớt cuộc gọi
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !appointmentId) return;
    let cancelled = false;
    setError('');
    setLoading(true);

    const joinRoom = async () => {
      try {
        const token = sessionStorage.getItem('admin_token');
        const res = await axios.get(`http://localhost:4000/api/booking/appointments/${appointmentId}/video-token`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        const adminUser = JSON.parse(sessionStorage.getItem('admin_user') || '{}');
        const doctorName = adminUser?.Profile?.full_name ? `BS. ${adminUser.Profile.full_name}` : 'Bác sĩ GlowSkin';

        const { appID, userID, roomID, token: zegoToken } = res.data.data;
        const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(appID, zegoToken, roomID, userID, doctorName);

        const zp = ZegoUIKitPrebuilt.create(kitToken);
        zpRef.current = zp;
        zp.joinRoom({
          container: containerRef.current,
          scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
          showScreenSharingButton: true, // Bác sĩ có thể chia sẻ ảnh da / phác đồ cho khách
          showPreJoinView: false,
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
  }, [open, appointmentId]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      centered
      destroyOnHidden
      maskClosable={false}
      title={<span><VideoCameraOutlined className="mr-2 text-green-600" />Khám online — {patientName}</span>}
      styles={{ body: { padding: 0 } }}
    >
      <div className="relative h-[70vh] bg-slate-950 rounded-b-lg overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spin size="large" tip="Đang kết nối phòng khám..."><div className="p-12" /></Spin>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Result status="warning" title={error} extra={<Button onClick={onClose}>Đóng</Button>} />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default VideoCallModal;
