import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Camera,
  CheckCircle,
  Sparkles,
  Calendar,
  X,
} from 'lucide-react';

import CustomerConcerns from '../components/CustomerConcerns';
import GlowSkinValueProp from '../components/GlowSkinValueProp';

export default function AiTriagePage() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [result, setResult] = useState(null);
  const [recommendedServices, setRecommendedServices] = useState([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Mở luồng camera từ thiết bị
  const startCamera = async () => {
    try {
      setIsCameraOpen(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Không thể truy cập camera:', err);
      alert('Không thể mở camera. Vui lòng cấp quyền truy cập thiết bị ghi hình.');
      setIsCameraOpen(false);
    }
  };

  // Chụp ảnh trực tiếp từ video stream
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const capturedFile = new File(
        [blob],
        'camera-capture.jpg',
        { type: 'image/jpeg' }
      );

      setFile(capturedFile);
      setPreview(URL.createObjectURL(capturedFile));
      stopCamera();
    }, 'image/jpeg');
  };

  // Đóng luồng camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();

      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);
  };

  // Đóng camera khi component bị hủy
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  // Chọn ảnh từ máy tính
  const handleImageChange = (e) => {
    const selected = e.target.files[0];

    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  // Phân tích hình ảnh
  const handleAnalyze = async () => {
    if (!file) return;

    setStatus('ANALYZING');

    try {
      // Lấy dữ liệu dịch vụ từ service-booking qua API Gateway
      const res = await fetch(
        'http://localhost:4000/api/booking/spa-services'
      );

      let services = [];

      if (res.ok) {
        const data = await res.json();
        services = Array.isArray(data) ? data : data.data || [];
      }

      // Giả lập kết quả phân tích AI như code gốc
      setTimeout(() => {
        setStatus('ANALYSIS_COMPLETED');

        setResult({
          acneScore: 68,
          pigmentationScore: 42,
          skinType: 'Da hỗn hợp thiên dầu',
          recommendations: [
            'Tình trạng: Có dấu hiệu mụn viêm vùng chữ T và lỗ chân lông bí tắc.',
            'Đánh giá AI: Da cần được làm sạch tầng sâu và điều trị kháng viêm chuẩn y khoa.',
          ],
        });

        // Ưu tiên dịch vụ trị mụn hoặc làm sạch sâu
        const matched = services.filter(
          (s) =>
            s.name.toLowerCase().includes('mụn') ||
            s.name.toLowerCase().includes('làm sạch')
        );

        setRecommendedServices(
          matched.length > 0 ? matched : services.slice(0, 2)
        );
      }, 1800);
    } catch (err) {
      console.error('Lỗi khi fetch spa-services:', err);

      // Kết quả dự phòng khi API gặp sự cố
      setTimeout(() => {
        setStatus('ANALYSIS_COMPLETED');

        setResult({
          acneScore: 68,
          pigmentationScore: 42,
          skinType: 'Da hỗn hợp thiên dầu',
          recommendations: [
            'Tình trạng: Có dấu hiệu mụn viêm vùng chữ T',
          ],
        });

        setRecommendedServices([]);
      }, 1500);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4">
      {/* Tiêu đề */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-base-content">
          Sàng Lọc Da Thông Minh Bằng AI
        </h1>

        <p className="text-base-content/60 mt-2">
          Chụp ảnh trực tiếp hoặc tải ảnh cận cảnh gương mặt
          để nhận diện chỉ số da và phác đồ đề xuất.
        </p>
      </div>

      {/* Hai khối: Cung cấp hình ảnh và Kết quả gợi ý */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CỘT BÊN TRÁI: CUNG CẤP HÌNH ẢNH */}
        <div className="card bg-base-100 shadow-xl border border-base-200 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Camera className="text-primary w-5 h-5" />
              Cung cấp hình ảnh
            </h2>

            {/* Nút chụp ảnh và tải ảnh */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className="btn btn-outline btn-primary flex-1 gap-2"
                onClick={startCamera}
              >
                <Camera className="w-5 h-5" />
                Chụp trực tiếp
              </button>

              <div className="flex-1 relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                <button
                  type="button"
                  className="btn btn-outline flex-1 w-full gap-2"
                >
                  <UploadCloud className="w-5 h-5" />
                  Tải ảnh lên
                </button>
              </div>
            </div>

            {/* Khung camera và xem trước ảnh */}
            <div className="border-2 border-dashed border-base-300 rounded-2xl p-2 text-center bg-base-200/50 flex flex-col items-center justify-center min-h-[260px] relative overflow-hidden">
              {isCameraOpen ? (
                <div className="w-full flex flex-col items-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg max-h-60 object-cover"
                  />

                  <canvas
                    ref={canvasRef}
                    className="hidden"
                  />

                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="btn btn-sm btn-primary"
                    >
                      Bấm chụp
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="btn btn-sm btn-ghost gap-1"
                    >
                      <X className="w-4 h-4" />
                      Hủy
                    </button>
                  </div>
                </div>
              ) : preview ? (
                <img
                  src={preview}
                  className="max-h-60 rounded-lg object-cover shadow"
                  alt="Preview"
                />
              ) : (
                <span className="text-sm text-base-content/60">
                  Hình ảnh phân tích sẽ hiển thị tại đây
                </span>
              )}
            </div>
          </div>

          {/* Nút bắt đầu phân tích */}
          <button
            onClick={handleAnalyze}
            disabled={!file || status === 'ANALYZING'}
            className="btn btn-primary w-full mt-6"
          >
            {status === 'ANALYZING' ? (
              <>
                <span className="loading loading-spinner"></span>
                Đang phân tích ma trận da...
              </>
            ) : (
              'Bắt đầu phân tích AI'
            )}
          </button>
        </div>

        {/* CỘT BÊN PHẢI: KẾT QUẢ VÀ DỊCH VỤ GỢI Ý */}
        <div className="card bg-base-100 shadow-xl border border-base-200 p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Sparkles className="text-secondary w-5 h-5" />
            Kết quả & Phác đồ gợi ý
          </h2>

          {/* Trạng thái ban đầu */}
          {status === 'IDLE' && (
            <div className="h-72 flex items-center justify-center text-base-content/40 text-center">
              Chưa có dữ liệu. Vui lòng cung cấp ảnh chân dung và bấm phân tích.
            </div>
          )}

          {/* Trạng thái đang phân tích */}
          {status === 'ANALYZING' && (
            <div className="h-72 flex flex-col items-center justify-center">
              <span className="loading loading-ring loading-lg text-primary"></span>

              <p className="mt-4 text-sm font-medium animate-pulse">
                Đang định vị tổn thương và cấu trúc da...
              </p>
            </div>
          )}

          {/* Kết quả phân tích */}
          {status === 'ANALYSIS_COMPLETED' && result && (
            <div className="space-y-4">
              <span className="badge badge-success text-white py-3 px-4 font-semibold">
                <CheckCircle className="w-4 h-4 mr-1" />
                HOÀN TẤT PHÂN TÍCH
              </span>

              {/* Phân loại da */}
              <div>
                <p className="text-xs text-base-content/60 uppercase tracking-wide">
                  Phân loại da
                </p>

                <p className="font-bold text-xl text-primary">
                  {result.skinType}
                </p>
              </div>

              {/* Chỉ số mụn */}
              <div>
                <div className="flex justify-between text-xs mb-1 font-semibold">
                  <span>Chỉ số Mụn & Kháng viêm</span>

                  <span className="text-error">
                    {result.acneScore}%
                  </span>
                </div>

                <progress
                  className="progress progress-error w-full"
                  value={result.acneScore}
                  max="100"
                ></progress>
              </div>

              {/* Đánh giá sơ bộ */}
              <div className="bg-base-200 p-4 rounded-xl border border-primary/20">
                <h3 className="text-sm font-bold mb-2 text-primary">
                  Đánh giá chuyên môn sơ bộ:
                </h3>

                <ul className="list-disc list-inside text-sm space-y-1">
                  {result.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {/* Dịch vụ đề xuất từ database */}
              {recommendedServices.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-bold text-base-content mb-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-primary" />
                    Liệu trình đề xuất tại Spa:
                  </h3>

                  <div className="space-y-2">
                    {recommendedServices.map((svc) => (
                      <div
                        key={svc.id}
                        className="p-3 bg-base-100 rounded-lg border border-base-200 shadow-sm flex items-center justify-between gap-3 hover:border-primary transition-all"
                      >
                        <img
                          src={svc.image_url}
                          alt={svc.name}
                          className="w-14 h-14 rounded-lg object-cover bg-base-300 flex-shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {svc.name}
                          </p>

                          <p className="text-xs text-base-content/60 truncate">
                            {svc.description}
                          </p>

                          <p className="text-xs font-bold text-primary mt-1">
                            {Number(svc.price).toLocaleString('vi-VN')} đ

                            <span className="text-xs font-normal text-base-content/50 ml-1">
                              ({svc.duration_minutes} phút)
                            </span>
                          </p>
                        </div>

                        <button
                          className="btn btn-xs btn-primary text-white"
                          onClick={() =>
                            alert(`Đặt lịch ngay cho liệu trình: ${svc.name}`)
                          }
                        >
                          Chọn gói
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs italic opacity-60 mt-3">
                *Lưu ý: Kết quả AI chỉ mang tính sàng lọc ban đầu.
                Bác sĩ chuyên khoa tại cơ sở sẽ trực tiếp thăm khám
                trước khi tiến hành thủ thuật.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Khối Thấu hiểu nỗi lo khách hàng */}
      <CustomerConcerns />

      {/* 3 Khối Giá Trị & Phác Đồ GlowSkin (Style O2 SKIN) */}
      <GlowSkinValueProp />
    </div>
  );
}