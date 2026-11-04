import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { CameraOutlined, ReloadOutlined } from '@ant-design/icons';
import { FilesetResolver, FaceDetector } from '@mediapipe/tasks-vision';
import { openCamera, stopCamera, cameraError } from './attendanceApi';

// Mô hình phát hiện khuôn mặt (chỉ biết "có mặt người", không nhận dạng là ai), tải 1 lần rồi dùng lại
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let detectorPromise = null;
const getDetector = () => {
  detectorPromise ||= FilesetResolver.forVisionTasks(WASM)
    .then((vision) => FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.6,
    }))
    .catch((err) => { detectorPromise = null; throw err; });
  return detectorPromise;
};

const MIN_FACE_RATIO = 0.2; // khuôn mặt phải chiếm ít nhất 20% chiều ngang khung hình (đứng gần, nhìn thẳng)

// Chụp ảnh xác nhận bằng camera trước: chỉ cho chụp khi khung hình có đúng 1 khuôn mặt đủ lớn
export default function FaceCapture({ onCapture, disabled }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [faces, setFaces] = useState({ count: 0, bigEnough: false });
  const [retry, setRetry] = useState(0);
  const facesRef = useRef(faces);

  useEffect(() => {
    let stream;
    let stopped = false;
    let timer;
    setError('');
    setLoading(true);
    Promise.all([openCamera('user'), getDetector()])
      .then(([s, detector]) => {
        if (stopped) return stopCamera(s);
        stream = s;
        const video = videoRef.current;
        video.srcObject = s;
        video.play().catch(() => {});
        setLoading(false);
        const loop = () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const { detections } = detector.detectForVideo(video, performance.now());
            const bigEnough = detections.length === 1 && detections[0].boundingBox.width / video.videoWidth >= MIN_FACE_RATIO;
            const next = { count: detections.length, bigEnough };
            if (next.count !== facesRef.current.count || next.bigEnough !== facesRef.current.bigEnough) {
              facesRef.current = next;
              setFaces(next);
            }
          }
          timer = setTimeout(loop, 200);
        };
        loop();
      })
      .catch((err) => {
        setLoading(false);
        setError(err?.name ? cameraError(err) : 'Không tải được bộ nhận diện khuôn mặt. Kiểm tra kết nối mạng rồi thử lại.');
      });
    return () => { stopped = true; clearTimeout(timer); stopCamera(stream); };
  }, [retry]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    // Ảnh tối đa 960px cho nhẹ
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    // Lật ngang như gương để ảnh giống những gì nhân viên thấy trên màn hình
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => onCapture({ blob, faceCount: facesRef.current.count, preview: canvas.toDataURL('image/jpeg', 0.8) }), 'image/jpeg', 0.85);
  };

  if (error) return <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setRetry((r) => r + 1)}>Thử lại</Button>} />;

  const ready = faces.count === 1 && faces.bigEnough;
  const status = loading ? 'Đang mở camera...'
    : faces.count === 0 ? 'Chưa thấy khuôn mặt, hãy nhìn thẳng vào camera'
      : faces.count > 1 ? 'Chỉ được có 1 người trong khung hình'
        : !faces.bigEnough ? 'Đưa mặt lại gần camera hơn'
          : 'Đã nhận diện khuôn mặt, bấm Chụp';

  return (
    <div className="space-y-3">
      <div className={`relative rounded-xl overflow-hidden bg-black aspect-[3/4] max-h-[60vh] mx-auto border-4 transition-colors ${ready ? 'border-green-500' : 'border-transparent'}`}>
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
        <div className="absolute inset-x-[18%] top-[12%] bottom-[22%] border-2 border-dashed border-white/80 rounded-[50%]" />
      </div>
      <p className={`text-center text-sm font-medium ${ready ? 'text-green-600' : 'text-gray-500'}`}>{status}</p>
      <div className="flex gap-2">
        <Button icon={<ReloadOutlined />} onClick={() => setRetry((r) => r + 1)}>Mở lại camera</Button>
        <Button type="primary" icon={<CameraOutlined />} block disabled={!ready || disabled} onClick={capture}>Chụp ảnh xác nhận</Button>
      </div>
    </div>
  );
}
