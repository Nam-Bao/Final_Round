import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Scan, Loader2, ImagePlus, Trash2, AlertTriangle, CalendarCheck, ChevronRight, Droplets, Moon, Salad } from 'lucide-react';
import { getImages, vnd } from '../components/ProductCard';
import axios from 'axios';
import PhotoConsentModal from '../components/PhotoConsentModal';

// Gọi cùng địa chỉ với website, Vite chuyển /api về gateway (xem vite.config.js)
const API_URL = '';

// Nhóm lời khuyên AI trả về (category)
const TIP_GROUPS = [
  { key: 'skincare', label: 'Chăm sóc da', Icon: Droplets },
  { key: 'lifestyle', label: 'Thói quen sinh hoạt', Icon: Moon },
  { key: 'diet', label: 'Chế độ ăn uống', Icon: Salad },
];

// 1 lượt soi = tối đa 3 ảnh của cùng một người, mỗi ảnh một góc chụp; tính 1 lượt hạn mức
const ANGLES = [
  { key: 'front', label: 'Chính diện', hint: 'Nhìn thẳng, thấy cả khuôn mặt' },
  { key: 'left', label: 'Má trái', hint: 'Quay mặt sang phải, thấy rõ má trái' },
  { key: 'right', label: 'Má phải', hint: 'Quay mặt sang trái, thấy rõ má phải' },
];

export default function AiTriagePage() {
  const [shots, setShots] = useState({}); // { front: { url }, left: { url }, right: { url } } của lượt soi đang làm
  const [consent, setConsent] = useState(null); // đồng ý chính sách ảnh cho lượt soi này
  const [result, setResult] = useState(null); // parsed_metrics gộp của lượt soi + images (kích thước từng ảnh)
  const [activeAngle, setActiveAngle] = useState('front');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingAngle, setUploadingAngle] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  // Hạn mức do server quản lý (tính theo lượt soi): vãng lai 1 lượt, đăng nhập 3 lượt/ngày => { isGuest, limit, used, remaining }
  const [quota, setQuota] = useState(null);

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingAngleRef = useRef(null); // góc chụp đang chờ chọn ảnh

  /* ------------------------------ Hạn mức phân tích ------------------------------ */
  const loadQuota = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ai/quota`);
      setQuota(res.data.data);
    } catch (err) { console.error('Không lấy được hạn mức', err); }
  };
  useEffect(() => { loadQuota(); }, []);

  // Hồ sơ người được soi (Bản thân / người thân): bác sĩ xem lịch sử soi da theo đúng người khi khách đến khám
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState('');
  useEffect(() => {
    if (!sessionStorage.getItem('token')) return;
    axios.get(`${API_URL}/api/identity/profile/patients`)
      .then((res) => { const list = res.data.data || []; setProfiles(list); setProfileId(list[0]?.id || ''); })
      .catch(() => setProfiles([]));
  }, []);

  const taken = ANGLES.filter((a) => shots[a.key]);
  const locked = !!result || isAnalyzing; // đã phân tích thì không đổi ảnh, bấm "Lượt soi mới"

  const quotaMessage = () =>
    quota?.isGuest
      ? 'Khách vãng lai chỉ được phân tích 1 lượt. Vui lòng đăng nhập/đăng ký để được phân tích 3 lượt mỗi ngày.'
      : `Bạn đã dùng hết ${quota?.limit ?? 3} lượt phân tích hôm nay, vui lòng quay lại vào ngày mai.`;

  /* ------------------------------ Chọn ảnh cho từng góc ------------------------------ */
  const pickPhoto = (angle) => {
    if (locked) return;
    if (quota && quota.remaining <= 0) return alert(quotaMessage());
    pendingAngleRef.current = angle;
    if (!consent) return setShowConsent(true); // đồng ý 1 lần cho cả lượt soi
    fileInputRef.current?.click();
  };

  const handleConsentAccepted = (c) => {
    setConsent(c);
    setShowConsent(false);
    fileInputRef.current?.click(); // mở hộp chọn ảnh ngay sau khi đồng ý
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng một file
    const angle = pendingAngleRef.current;
    if (!file || !angle) return;
    const token = sessionStorage.getItem('token');
    setUploadingAngle(angle);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploadRes = await fetch(`${API_URL}/api/media/upload/skin`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!uploadRes.ok) throw new Error((await uploadRes.json().catch(() => ({}))).message || 'Tải ảnh thất bại!');
      const { url } = await uploadRes.json();
      setShots((s) => ({ ...s, [angle]: { url } }));
      setActiveAngle(angle);
    } catch (err) {
      console.error(err);
      alert(`Lỗi khi tải ảnh: ${err.message}`);
    } finally {
      setUploadingAngle(null);
    }
  };

  const removeShot = (angle, e) => {
    e.stopPropagation();
    if (locked) return;
    setShots((s) => { const next = { ...s }; delete next[angle]; return next; });
  };

  const newSession = () => {
    setShots({}); setResult(null); setConsent(null); setActiveAngle('front');
  };

  /* ------------------------------ Phân tích cả lượt ------------------------------ */
  const handleAnalyzeAI = async (ignoreQuality = false) => {
    if (!taken.length) return alert('Vui lòng tải ít nhất 1 ảnh!');
    setIsAnalyzing(true);
    try {
      // ?debug=1 chỉ bật khi chạy dev (vite dev server)
      const res = await axios.post(`${API_URL}/api/ai/analyze${import.meta.env.DEV ? '?debug=1' : ''}`, {
        // customer_id không gửi: server lấy từ token (đăng nhập) hoặc ghi là khách vãng lai
        images: taken.map((a) => ({ url: shots[a.key].url, angle: a.key })),
        consent,
        ignore_quality: ignoreQuality === true,
        patient_profile_id: profileId || undefined,
      }); // token (nếu đã đăng nhập) do interceptor ở main.jsx tự gắn
      if (res.data.debug) console.log('[AI debug]', res.data.debug);
      const record = res.data.data;
      setResult({ ...record.parsed_metrics, images: record.images || [] });
    } catch (error) {
      // Ảnh tối / mờ / cháy sáng: chưa trừ lượt, cho khách chọn chụp lại (khuyên dùng) hoặc vẫn phân tích
      if (error.response?.data?.code === 'IMAGE_QUALITY') {
        const again = window.confirm(`${error.response.data.message}

Kết quả có thể không chính xác. Lượt phân tích CHƯA bị trừ.

Bấm "OK" để vẫn phân tích, "Hủy" để chụp lại ảnh đó.`);
        if (again) { setIsAnalyzing(false); return handleAnalyzeAI(true); }
        const firstBad = error.response.data.images?.[0]?.angle;
        if (firstBad) setActiveAngle(firstBad);
        return;
      }
      console.error(error);
      alert(error.response?.status === 429 || error.response?.status === 400 ? error.response.data.message : 'Không thể kết nối hoặc phân tích ảnh bằng AI.');
    } finally {
      setIsAnalyzing(false);
      loadQuota();
    }
  };

  /* ------------------------------ Vẽ khung lên ảnh ------------------------------ */
  const activeIdx = taken.findIndex((a) => a.key === activeAngle); // vị trí ảnh trong lượt soi (image_index)
  const drawAiResults = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
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
    // Chỉ vẽ khung của ảnh đang xem, nhóm khoanh vùng đáng tin (thâm sau mụn, mụn đầu đen/trắng chỉ kết luận có / không)
    const drawn = (result?.issues || []).filter((i) => i.draw !== false && (i.image_index || 0) === activeIdx);
    if (!drawn.length) return;

    // Với object-contain, ảnh thật được co vừa khung và căn giữa => tính phần ảnh thực sự hiển thị để khung khớp
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const fit = Math.min(w / natW, h / natH);
    const offX = (w - natW * fit) / 2;
    const offY = (h - natH * fit) / 2;

    // Roboflow trả tọa độ theo kích thước ảnh nó nhận (image_size của từng ảnh), có thể khác ảnh gốc
    const size = result.images?.[activeIdx]?.image_size || result.image_size;
    const srcW = size?.width || natW;
    const srcH = size?.height || natH;
    const kx = (natW / srcW) * fit;
    const ky = (natH / srcH) * fit;

    drawn.forEach(({ bounding_box: b, issue_name, certainty }) => {
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

      // Không hiện %: độ tin cậy của model không phải xác suất đúng (khung 60% thực tế chỉ trúng ~35%, xem scripts/README.md)
      const label = `${sure ? '' : '? '}${issue_name}`;
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
  }, [activeAngle, result, shots]);

  const activeImage = shots[activeAngle];
  const activeResult = result;
  const aiSummary = activeResult?.ai_summary;
  const drawnHere = (result?.issues || []).filter((i) => i.draw !== false && (i.image_index || 0) === activeIdx);

  /* ------------------------------ Giao diện ------------------------------ */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-secondary">Sàng lọc da bằng AI</h1>
        <p className="text-sm text-slate-500 mt-1">
          Mỗi lượt soi gồm tối đa 3 ảnh: chính diện, má trái, má phải. Chụp nơi đủ sáng, rõ nét để AI khoanh vùng khuyết điểm. Kết quả chỉ mang tính tham khảo.
        </p>
      </div>

      {quota && (
        <div className={`p-3 rounded-lg text-sm flex flex-wrap items-center gap-2 ${quota.remaining > 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          <span>
            {quota.isGuest ? 'Khách vãng lai' : 'Hôm nay'}: còn <b>{quota.remaining}/{quota.limit}</b> lượt soi (mỗi lượt tối đa 3 ảnh).
          </span>
          {quota.isGuest && (
            <span>
              <Link to="/login?next=/sang-loc-da" className="underline font-medium">Đăng nhập</Link> hoặc{' '}
              <Link to="/register" className="underline font-medium">đăng ký</Link> để được phân tích 3 lượt mỗi ngày.
            </span>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <PhotoConsentModal open={showConsent} onAccept={handleConsentAccepted} onClose={() => setShowConsent(false)} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-800">Khu vực Phân Tích Khuyết Điểm Da</h2>
          {result && (
            <button type="button" onClick={newSession} className="btn btn-sm btn-outline flex items-center gap-2">
              <ImagePlus className="w-4 h-4" /> Lượt soi mới
            </button>
          )}
        </div>

        {/* 3 ô ảnh theo góc chụp */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {ANGLES.map((a) => {
            const shot = shots[a.key];
            const count = result ? (result.issues || []).filter((i) => i.draw !== false && (i.image_index || 0) === taken.findIndex((t) => t.key === a.key)).length : 0;
            return (
              <div
                key={a.key}
                onClick={() => (shot ? setActiveAngle(a.key) : pickPhoto(a.key))}
                className={`relative rounded-lg border-2 cursor-pointer overflow-hidden h-28 sm:h-32 flex flex-col items-center justify-center text-center transition-all ${
                  shot && activeAngle === a.key ? 'border-primary shadow-md' : shot ? 'border-slate-200 hover:border-primary/50' : 'border-dashed border-slate-300 bg-slate-50 hover:border-primary/60'
                } ${!shot && locked ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {shot ? (
                  <>
                    <img src={shot.url} alt={a.label} className="absolute inset-0 w-full h-full object-cover" />
                    {!locked && (
                      <button onClick={(e) => removeShot(a.key, e)} className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded p-1" aria-label={`Xóa ảnh ${a.label}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <div className="absolute bottom-0 w-full bg-black/60 text-white text-[11px] font-semibold py-0.5">
                      {a.label}{result ? ` · ${count} vùng` : ''}
                    </div>
                  </>
                ) : uploadingAngle === a.key ? (
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                ) : (
                  <div className="px-2">
                    <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                    <p className="text-sm font-semibold text-slate-600">{a.label}</p>
                    <p className="text-[11px] text-slate-400 hidden sm:block">{a.hint}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Khu vực ảnh */}
          <div className="md:col-span-2 relative">
            {activeImage ? (
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
                <span className="text-slate-400 px-4 text-center">Bấm vào ô "Chính diện", "Má trái" hoặc "Má phải" để thêm ảnh</span>
              </div>
            )}
          </div>

          {/* Khu vực kết quả */}
          <div className="md:col-span-1 flex flex-col gap-4">
            {profiles.length > 0 && (
              <label className="text-sm text-slate-600">
                Ảnh của
                <select className="select select-bordered select-sm w-full mt-1" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.relationship})</option>)}
                </select>
                <span className="block text-xs text-slate-400 mt-1">Bác sĩ sẽ xem lại kết quả soi da này khi người đó đến khám.</span>
              </label>
            )}
            <button
              onClick={() => handleAnalyzeAI()}
              disabled={!taken.length || isAnalyzing || !!activeResult}
              className={`btn w-full flex items-center justify-center gap-2 ${activeResult ? 'btn-success text-white' : 'btn-primary'}`}
            >
              <Scan className="w-5 h-5" />
              {activeResult ? `Đã phân tích ${taken.length} ảnh` : `Phân tích lượt soi (${taken.length}/3 ảnh)`}
            </button>

            {activeResult && (
              <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-xl flex-1">
                <h3 className="font-bold text-blue-800 border-b border-blue-100 pb-2 mb-4">Kết quả tham khảo</h3>

                <div className="space-y-3 mb-4 text-sm">
                  <p className="flex justify-between items-center">
                    <span className="text-slate-500">{activeResult.severity_scale ? 'Mức độ mụn viêm:' : 'Mức độ:'}</span>
                    <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded border shadow-sm">
                      {activeResult.severity || 'Chưa xác định'}
                    </span>
                  </p>
                  {activeResult.severity_scale && activeResult.level !== 'none' && (
                    <p className="text-xs text-slate-500 -mt-1">
                      {activeResult.severity_scale} (đếm trên nửa mặt: 1 - 5 nốt nhẹ, 6 - 20 trung bình, trên 20 nặng){taken.length > 1 ? ', lấy ảnh có nhiều mụn viêm nhất' : ''}. AI có thể bỏ sót nốt nhỏ.
                    </p>
                  )}
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
                              {g.boxes === false ? 'có dấu hiệu' : (
                                <>
                                  {g.confirmed > 0 ? `${g.confirmed} vị trí rõ${taken.length > 1 ? ` trên ${taken.length} ảnh` : ''}` : 'có dấu hiệu, cần xác nhận'}
                                  {g.possible > 0 ? ` · ${g.possible} nghi ngờ` : ''}
                                </>
                              )}
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
                    Vùng AI khoanh trên ảnh {ANGLES.find((x) => x.key === activeAngle)?.label.toLowerCase()}: {drawnHere.length}
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto pr-2">
                    {drawnHere.map((issue, idx) => (
                      <span
                        key={idx}
                        className={`badge badge-outline py-2 px-3 text-xs ${
                          issue.certainty === 'confirmed'
                            ? 'badge-error bg-red-50 text-red-700'
                            : 'border-amber-400 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {issue.certainty === 'possible' && '? '}
                        {issue.issue_name}
                      </span>
                    ))}
                  </div>
                </div>

                {activeResult.level === 'detected' && (
                  <p className="text-xs text-slate-500 mt-3">
                    Khung nét liền: vùng AI thấy rõ; khung nét đứt (dấu ?): vùng nghi ngờ. Đây là các vùng AI nhận diện được (mụn viêm, nám / tàn nhang). Thâm sau mụn và mụn đầu đen / trắng
                    chỉ được kết luận có / không vì vị trí khoanh chưa đủ tin cậy. AI có thể bỏ sót tổn thương, nên số
                    lượng và mức độ chỉ mang tính tham khảo.
                  </p>
                )}

                {/* Nhận xét + lời khuyên + sản phẩm gợi ý do Gemini viết cho khách */}
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
                    {aiSummary.customer_summary && <p className="text-slate-700 mt-3">{aiSummary.customer_summary}</p>}

                    {aiSummary.care_tips?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-semibold text-slate-700 mb-2">Bạn nên lưu ý</h4>
                        {TIP_GROUPS.map(({ key, label, Icon }) => {
                          const tips = aiSummary.care_tips.filter((t) => t.category === key);
                          if (!tips.length) return null;
                          return (
                            <div key={key} className="mb-2">
                              <p className="flex items-center gap-1.5 font-medium text-slate-700"><Icon className="w-4 h-4 text-primary" /> {label}</p>
                              <ul className="list-disc pl-6 text-slate-600 space-y-0.5 mt-1">
                                {tips.map((t, i) => <li key={i}>{t.tip}</li>)}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {aiSummary.products?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-semibold text-slate-700 mb-2">Sản phẩm phù hợp tại GlowSkin</h4>
                        <div className="space-y-2">
                          {aiSummary.products.map((p) => (
                            <Link key={p.id} to={`/shops/${p.slug}`} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-2 hover:border-primary/50">
                              <img src={getImages(p.image)[0]} alt={p.name} className="w-14 h-14 rounded object-cover bg-slate-100 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800 line-clamp-2">{p.name}</p>
                                <p className="text-xs text-slate-500 line-clamp-2">{p.reason}</p>
                                <p className="text-primary font-semibold text-sm">{vnd(p.price)}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
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
                {profiles.length > 0 && (
                  <Link to="/lich-su-soi-da" className="btn btn-outline btn-sm w-full mt-2">Xem lịch sử & tiến triển da</Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}