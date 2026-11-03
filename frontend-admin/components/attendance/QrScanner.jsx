import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import jsQR from 'jsqr';
import { openCamera, stopCamera, cameraError, QR_PREFIX } from './attendanceApi';

// Quét mã QR trên máy chấm công bằng camera sau của điện thoại. Chỉ nhận mã của hệ thống chấm công.
export default function QrScanner({ onResult }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [retry, setRetry] = useState(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stream;
    let stopped = false;
    let timer;
    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          if (found.data.startsWith(QR_PREFIX)) {
            stopped = true;
            stopCamera(stream);
            onResultRef.current(found.data);
            return;
          }
          setHint('Đây không phải mã chấm công GlowSkin');
        }
      }
      timer = setTimeout(scan, 150);
    };
    setError('');
    openCamera('environment')
      .then((s) => {
        if (stopped) return stopCamera(s);
        stream = s;
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
        scan();
      })
      .catch((err) => setError(cameraError(err)));
    return () => { stopped = true; clearTimeout(timer); stopCamera(stream); };
  }, [retry]);

  if (error) return <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setRetry((r) => r + 1)}>Thử lại</Button>} />;

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {/* Khung ngắm */}
        <div className="absolute inset-[15%] border-4 border-white/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <p className="text-center text-gray-500 text-sm">Đưa mã QR trên máy chấm công vào giữa khung</p>
      {hint && <p className="text-center text-orange-500 text-sm">{hint}</p>}
    </div>
  );
}
