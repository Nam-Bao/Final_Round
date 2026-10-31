import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Scan, Loader2, ImagePlus, Trash2, AlertTriangle, CalendarCheck } from 'lucide-react';
import axios from 'axios';
import PhotoConsentModal from '../components/PhotoConsentModal';

// Vite: đặt VITE_API_URL trong frontend-client/.env nếu gateway không chạy ở cổng 4000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function AiTriagePage() {
  const [images, setImages] = useState([]); // [{ url, result, consent }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  // Hạn mức do server quản lý: vãng lai 1 lần, đăng nhập 5 lần/ngày => { isGuest, limit, used, remaining }
  const [quota, setQuota] = useState(null);

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingConsentRef = useRef(null); // consent vừa được khách đồng ý, gắn vào các ảnh sắp tải

  /* ------------------------------ Hạn mức phân tích ------------------------------ */
  const loadQuota = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ai/quota`);
      setQuota(res.data.data);
    } catch (err) { console.error('Không lấy được hạn mức', err); }
  };
  useEffect(() => { loadQuota(); }, []);

  // Số ảnh còn được phép thêm = lượt còn lại - số ảnh đã tải nhưng chưa phân tích (tránh tải ảnh rồi không quét được)
  const pendingCount = images.filter((im) => !im.result).length;
  const slotsLeft = quota ? Math.max(0, quota.remaining - pendingCount) : Infinity;

  const quotaMessage = () =>
    quota?.isGuest
      ? 'Khách vãng lai chỉ được phân tích 1 lần. Vui lòng đăng nhập/đăng ký để được phân tích 5 lần mỗi ngày.'
      : `Bạn đã dùng hết ${quota?.limit ?? 5} lượt phân tích hôm nay, vui lòng quay lại vào ngày mai.`;

  /* ------------------------------ Đồng ý chính sách ------------------------------ */
  const openConsent = () => {
    if (slotsLeft <= 0) return alert(quotaMessage());
    setShowConsent(true);
  };

  const handleConsentAccepted = (consent) => {
    pendingConsentRef.current = consent;
    setShowConsent(false);
    fileInputRef.current?.click(); // mở hộp chọn ảnh ngay sau khi đồng ý
  };

  /* ------------------------------ Upload ------------------------------ */
  const handleMultipleUpload = async (e) => {
    let files = Array.from(e.target.files || []);
    e.target.value = ''; // cho phép chọn lại cùng một file
    if (!files.length) return;
    if (files.length > slotsLeft) {
      alert(`Bạn chỉ còn ${slotsLeft} lượt phân tích, hệ thống chỉ tải ${slotsLeft} ảnh đầu tiên.`);
      files = files.slice(0, slotsLeft);
    }

    const consent = pendingConsentRef.current;
    if (!consent) return openConsent(); // phòng trường hợp chưa đồng ý

    const token = sessionStorage.getItem('token');
    const startIndex = images.length;
    const uploaded = [];

    setIsUploading(true);
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('image', file);

        const uploadRes = await fetch(`${API_URL}/api/media/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Tải ảnh thất bại!');

        const uploadData = await uploadRes.json();
        uploaded.push({ url: uploadData.url, result: null, consent });
      } catch (err) {
        console.error(err);
        alert(`Lỗi khi tải ảnh ${file.name}`);
      }
    }
    setIsUploading(false);
    pendingConsentRef.current = null; // lần thêm ảnh sau phải đồng ý lại

    if (uploaded.length) {
      setImages((prev) => [...prev, ...uploaded]);
      setActiveIndex(startIndex);
    }
  };

  /* ------------------------------ Phân tích ------------------------------ */
  const handleAnalyzeAI = async () => {
    if (images.length === 0) return alert('Vui lòng tải ảnh lên!');

    const target = images[activeIndex];
    setIsAnalyzing(true);

    try {
      // ?debug=1 chỉ bật khi chạy dev (vite dev server)
      const res = await axios.post(`${API_URL}/api/ai/analyze${import.meta.env.DEV ? '?debug=1' : ''}`, {
        // customer_id không gửi nữa: server lấy từ token (đăng nhập) hoặc ghi là khách vãng lai
        image_url: target.url,
        consent: target.consent,
      }, { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') } });
      if (res.data.debug) console.log('[AI debug]', res.data.debug);

      const metrics = res.data.data.parsed_metrics;
      // Gắn theo url (không theo index) để không sai ảnh nếu người dùng xóa/đổi ảnh khi đang quét
      setImages((prev) => prev.map((im) => (im.url === target.url ? { ...im, result: metrics } : im)));
    } catch (error) {
      console.error(error);
      alert(error.response?.status === 429 ? error.response.data.message : 'Không thể kết nối hoặc phân tích ảnh bằng AI.');
    } finally {
      setIsAnalyzing(false);
      loadQuota();
    }
  };

  const removeImage = (indexToRemove, e) => {
    e.stopPropagation();
    const filtered = images.filter((_, i) => i !== indexToRemove);
    setImages(filtered);
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  };

  /* ------------------------------ Vẽ khung lên ảnh ------------------------------ */
  const drawAiResults = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const result = images[activeIndex]?.result;
    if (!canvas || !img || !img.naturalWidth) return;

    // Canvas phủ đúng khung <img> đang hiển thị
    const w = img.clientWidth;
    const h = img.clientHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.left = `${img.offsetLeft}px`;
    canvas.style.top = `${img.offsetTop}px`;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!result?.issues?.length) return;

    // Với object-contain, ảnh thật được co vừa khung và căn giữa => có dải đen hai bên.
    // Phải tính phần ảnh thực sự hiển thị thì khung mới khớp.
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const fit = Math.min(w / natW, h / natH);
    const offX = (w - natW * fit) / 2;
    const offY = (h - natH * fit) / 2;

    // Roboflow trả tọa độ theo kích thước ảnh nó nhận (image_size), có thể khác ảnh gốc
    const srcW = result.image_size?.width || natW;
    const srcH = result.image_size?.height || natH;
    const kx = (natW / srcW) * fit;
    const ky = (natH / srcH) * fit;

    result.issues.forEach(({ bounding_box: b, issue_name, confidence, certainty }) => {
      if (!b) return;
      const sure = certainty === 'confirmed';
      const color = sure ? '#ef4444' : '#f59e0b';
      const x = offX + b.left * kx;
      const y = offY + b.top * ky;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.setLineDash(sure ? [] : [6, 4]); // nét liền: chắc chắn, nét đứt: nghi ngờ
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, b.width * kx, b.height * ky);
      ctx.setLineDash([]);

      // Nhãn có nền để dễ đọc trên ảnh có nhiều vùng đỏ
      const label = `${sure ? '' : '? '}${issue_name} ${Math.round(confidence)}%`;
      ctx.font = 'bold 12px Arial';
      const tw = ctx.measureText(label).width;
      const ty = Math.max(y - 4, 16);
      ctx.fillStyle = color;
      ctx.fillRect(x, ty - 14, tw + 8, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 4, ty - 2);
    });
  };

  // Vẽ lại khi đổi ảnh, khi có kết quả mới, và khi resize cửa sổ
  useEffect(() => {
    drawAiResults();
    window.addEventListener('resize', drawAiResults);
    return () => window.removeEventListener('resize', drawAiResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, images]);

  const activeImage = images[activeIndex];
  const activeResult = activeImage?.result;
  const aiSummary = activeResult?.ai_summary;

  /* ------------------------------ Giao diện ------------------------------ */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary">Sàng lọc da bằng AI</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tải ảnh khuôn mặt rõ nét, đủ sáng để AI khoanh vùng khuyết điểm. Kết quả chỉ mang tính tham khảo.
        </p>
      </div>

      {quota && (
        <div className={`p-3 rounded-lg text-sm flex flex-wrap items-center gap-2 ${quota.remaining > 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          <span>
            {quota.isGuest ? 'Khách vãng lai' : 'Hôm nay'}: còn <b>{quota.remaining}/{quota.limit}</b> lượt phân tích.
          </span>
          {quota.isGuest && (
            <span>
              <Link to="/login" className="underline font-medium">Đăng nhập</Link> hoặc{' '}
              <Link to="/register" className="underline font-medium">đăng ký</Link> để được phân tích 5 lần mỗi ngày.
            </span>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <PhotoConsentModal open={showConsent} onAccept={handleConsentAccepted} onClose={() => setShowConsent(false)} />

        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">Khu vực Phân Tích Khuyết Điểm Da</h2>

          <button
            type="button"
            onClick={openConsent}
            disabled={isUploading}
            className="btn btn-sm btn-outline flex items-center gap-2"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            {isUploading ? 'Đang tải ảnh...' : 'Thêm ảnh'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleMultipleUpload}
          />
        </div>

        {images.length > 0 && (
          <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
            {images.map((img, idx) => (
              <div
                key={img.url}
                onClick={() => setActiveIndex(idx)}
                className={`relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 ${
                  activeIndex === idx ? 'border-primary shadow-md' : 'border-slate-200 hover:border-primary/50'
                }`}
              >
                <img src={img.url} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => removeImage(idx, e)}
                  className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded p-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                {img.result && (
                  <div className="absolute bottom-0 w-full bg-green-500/90 text-white text-[10px] text-center font-bold py-0.5">
                    Đã quét
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Khu vực ảnh */}
          <div className="md:col-span-2 relative">
            {images.length > 0 && activeImage ? (
              <div className="relative inline-block w-full rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-black min-h-[300px]">
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/60 z-10 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-white mb-3" />
                    <span className="text-white font-medium">Đang khoanh vùng tổn thương...</span>
                  </div>
                )}
                <img
                  ref={imageRef}
                  src={activeImage.url}
                  alt="Main Analysis"
                  onLoad={drawAiResults}
                  className="w-full h-auto block object-contain max-h-[600px] mx-auto"
                />
                <canvas ref={canvasRef} className="absolute pointer-events-none" />
              </div>
            ) : (
              <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
                <Camera className="w-12 h-12 text-slate-300 mb-3" />
                <span className="text-slate-400">Hãy nhấn "Thêm ảnh" để bắt đầu</span>
              </div>
            )}
          </div>

          {/* Khu vực kết quả */}
          <div className="md:col-span-1 flex flex-col gap-4">
            <button
              onClick={handleAnalyzeAI}
              disabled={images.length === 0 || isAnalyzing || !!activeResult}
              className={`btn w-full flex items-center justify-center gap-2 ${activeResult ? 'btn-success text-white' : 'btn-primary'}`}
            >
              <Scan className="w-5 h-5" />
              {activeResult ? 'Đã quét ảnh này' : 'Tiến hành Quét AI'}
            </button>

            {activeResult && (
              <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-xl flex-1">
                <h3 className="font-bold text-blue-800 border-b border-blue-100 pb-2 mb-4">Kết quả tham khảo</h3>

                <div className="space-y-3 mb-4 text-sm">
                  <p className="flex justify-between items-center">
                    <span className="text-slate-500">Mức độ:</span>
                    <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded border shadow-sm">
                      {activeResult.severity || 'Chưa xác định'}
                    </span>
                  </p>
                  {activeResult.overall_score != null && (
                    <p className="flex justify-between items-center border-t border-blue-100 pt-3">
                      <span className="text-slate-600 font-medium">Điểm tổng quan (nốt mụn):</span>
                      <span className="font-bold text-blue-600 text-2xl">{activeResult.overall_score}/100</span>
                    </p>
                  )}
                </div>

                {/* Kết luận theo nhóm: có/không có, kể cả khi chưa vẽ được khung */}
                {activeResult.groups?.some((g) => g.present) && (
                  <div className="mb-4 text-sm">
                    <span className="text-slate-500 font-medium mb-2 block">Nhóm vấn đề AI nhận thấy:</span>
                    <ul className="space-y-1.5">
                      {activeResult.groups
                        .filter((g) => g.present)
                        .map((g) => (
                          <li key={g.group} className="flex justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                            <span className="text-slate-700">{g.name}</span>
                            <span className="text-slate-500 text-right">
                              {g.confirmed > 0 ? `${g.confirmed} vị trí chắc chắn` : 'có dấu hiệu, cần xác nhận'}
                              {g.possible > 0 ? ` · ${g.possible} nghi ngờ` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {activeResult.level === 'none' && (
                  <div className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      AI chưa nhận diện được khuyết điểm nào. Điều này <b>không đồng nghĩa da khỏe</b>. Hãy chụp lại
                      ảnh đủ sáng, rõ nét, chính diện, hoặc đặt lịch để chuyên viên kiểm tra trực tiếp.
                    </span>
                  </div>
                )}
                {activeResult.level === 'uncertain' && (
                  <div className="flex gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>AI chỉ phát hiện các vùng nghi ngờ (độ tin cậy thấp). Kết quả cần chuyên viên xác nhận.</span>
                  </div>
                )}

                <div>
                  <span className="text-slate-500 text-sm font-medium mb-2 block">
                    Khuyết điểm phát hiện: {activeResult.issues?.length || 0}
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pr-2">
                    {activeResult.issues?.map((issue, idx) => (
                      <span
                        key={idx}
                        className={`badge badge-outline py-2 px-3 text-xs ${
                          issue.certainty === 'confirmed'
                            ? 'badge-error bg-red-50 text-red-700'
                            : 'border-amber-400 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {issue.certainty === 'possible' && '? '}
                        {issue.issue_name} · {Math.round(issue.confidence)}%
                      </span>
                    ))}
                  </div>
                </div>

                {activeResult.level === 'detected' && (
                  <p className="text-xs text-slate-500 mt-3">
                    Đây là các vùng AI nhận diện được. AI có thể bỏ sót tổn thương, nên số lượng và mức độ chỉ mang tính
                    tham khảo.
                  </p>
                )}

                {/* Nhận xét bổ sung từ model thị giác (chỉ có khi detection không chắc và đã bật ANTHROPIC_API_KEY) */}
                {aiSummary && (
                  <div className="mt-4 border-t border-blue-100 pt-4 text-sm">
                    <h4 className="font-semibold text-slate-700 mb-2">Nhận xét tham khảo</h4>
                    {aiSummary.is_face === false && (
                      <p className="text-amber-700 mb-2">Ảnh có vẻ không phải khuôn mặt. Hãy chụp lại.</p>
                    )}
                    {aiSummary.image_quality && !aiSummary.image_quality.ok && (
                      <p className="text-amber-700 mb-2">Chất lượng ảnh: {aiSummary.image_quality.notes}</p>
                    )}
                    <ul className="space-y-2">
                      {aiSummary.observations?.map((o, i) => (
                        <li key={i} className="bg-white border border-slate-200 rounded-lg p-2">
                          <span className="font-medium text-slate-800">{o.type}</span>
                          <span className="text-slate-500"> ({o.region}, {o.severity})</span>
                          <p className="text-slate-600 mt-0.5">{o.description}</p>
                        </li>
                      ))}
                    </ul>
                    {aiSummary.staff_note && <p className="text-slate-600 mt-2">{aiSummary.staff_note}</p>}
                    {aiSummary.needs_professional_review && (
                      <p className="mt-2 font-medium text-red-700">
                        Nên đặt lịch để chuyên viên hoặc bác sĩ da liễu kiểm tra trực tiếp.
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-slate-400 mt-4">
                  Kết quả do AI hỗ trợ, chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ da liễu.
                </p>

                <Link to="/booking" className="btn btn-primary btn-sm w-full gap-2 mt-4">
                  <CalendarCheck className="w-4 h-4" /> Đặt lịch khám với bác sĩ
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}