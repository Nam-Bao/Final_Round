import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import { Scan, TrendingDown, TrendingUp, Minus, Stethoscope, Info, CalendarCheck, Loader2, ChevronDown } from 'lucide-react';

// Lịch sử soi da + tiến triển của từng người (Bản thân / người thân). Lượt đã được bác sĩ xác nhận hiển thị bản bác sĩ hiệu chỉnh.
const SEV_STYLE = {
  'Không thấy mụn viêm': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Nhẹ': 'bg-green-50 text-green-700 border-green-200',
  'Trung bình': 'bg-amber-50 text-amber-700 border-amber-200',
  'Nặng': 'bg-red-50 text-red-700 border-red-200',
};
const RANK_LABEL = ['Không thấy', 'Nhẹ', 'Trung bình', 'Nặng'];
const ANGLE_VI = { front: 'Chính diện', left: 'Má trái', right: 'Má phải' };
const imagesOf = (s) => (s?.images?.length ? s.images : s ? [{ url: s.image_url, angle: 'front' }] : []);

function SeverityTag({ value }) {
  return <span className={`inline-block text-xs font-semibold border rounded px-2 py-0.5 ${SEV_STYLE[value] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{value || 'Chưa xác định'}</span>;
}


// Khung khách được xem: khung AI của nhóm có khoanh vùng (mụn viêm, nám/tàn nhang), khung bác sĩ đã xác nhận, khung bác sĩ khoanh thêm.
// Khung AI của nhóm không khoanh (thâm, mụn đầu đen/trắng) chỉ hiện khi bác sĩ đã xác nhận.
const visibleBoxes = (result, imageIndex) => (result?.issues || [])
  .filter((it) => (it.image_index || 0) === imageIndex && it.bounding_box && (it.source === 'doctor' || it.verified || it.draw !== false));
const boxStyle = (it) => (it.source === 'doctor' ? { color: '#2563eb', label: `BS: ${it.issue_name}`, dashed: false }
  : it.verified ? { color: '#16a34a', label: `✓ ${it.issue_name}`, dashed: false }
  : it.certainty === 'possible' ? { color: '#f59e0b', label: `? ${it.issue_name}`, dashed: true }
  : { color: '#ef4444', label: it.issue_name, dashed: false });

// Ảnh soi da có khung khoanh vùng (toạ độ theo image_size của từng ảnh mà model nhận)
function AnnotatedImage({ image, result, imageIndex, showBoxes = true, className = '' }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const draw = () => {
    const img = imgRef.current; const cv = canvasRef.current;
    if (!img || !cv || !img.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    const w = img.clientWidth; const h = img.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!showBoxes) return;
    const size = image?.image_size || result?.image_size;
    const kx = w / (size?.width || img.naturalWidth); const ky = h / (size?.height || img.naturalHeight);
    visibleBoxes(result, imageIndex).forEach((it) => {
      const b = it.bounding_box; const st = boxStyle(it);
      const x = b.left * kx; const y = b.top * ky;
      ctx.setLineDash(st.dashed ? [6, 4] : []);
      ctx.strokeStyle = st.color; ctx.lineWidth = 2; ctx.strokeRect(x, y, b.width * kx, b.height * ky);
      ctx.setLineDash([]);
      ctx.font = 'bold 11px Arial';
      const tw = ctx.measureText(st.label).width + 8; const ty = Math.max(y - 3, 15);
      ctx.fillStyle = st.color; ctx.fillRect(x, ty - 13, tw, 15);
      ctx.fillStyle = '#fff'; ctx.fillText(st.label, x + 4, ty - 2);
    });
  };
  useEffect(() => { draw(); window.addEventListener('resize', draw); return () => window.removeEventListener('resize', draw); });
  return (
    <div className={`relative ${className}`}>
      <img ref={imgRef} src={image?.url} alt={ANGLE_VI[image?.angle] || 'Ảnh soi da'} onLoad={draw} className="w-full h-auto block rounded-lg" />
      <canvas ref={canvasRef} className="absolute left-0 top-0 pointer-events-none" />
    </div>
  );
}

function BoxLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span><span className="inline-block w-3 h-3 border-2 border-red-500 align-middle mr-1" />AI khoanh</span>
      <span><span className="inline-block w-3 h-3 border-2 border-dashed border-amber-500 align-middle mr-1" />AI nghi ngờ</span>
      <span><span className="inline-block w-3 h-3 border-2 border-green-600 align-middle mr-1" />Bác sĩ xác nhận đúng</span>
      <span><span className="inline-block w-3 h-3 border-2 border-blue-600 align-middle mr-1" />Bác sĩ khoanh thêm</span>
    </div>
  );
}

// Chi tiết 1 lượt soi: ảnh có khung theo từng góc chụp, kết luận từng nhóm, số nốt, nhận xét và lời khuyên
function SessionDetail({ session, onWithdraw, onDelete }) {
  const r = session.result || {};
  const imgs = imagesOf(session);
  const [idx, setIdx] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const boxes = visibleBoxes(r, idx);
  const tally = boxes.reduce((m, it) => { m[it.issue_name] = (m[it.issue_name] || 0) + 1; return m; }, {});
  const doctorAdded = (r.issues || []).filter((it) => it.source === 'doctor').length;
  const perImage = r.inflammatory_per_image;
  const tips = r.ai_summary?.care_tips || [];
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
      <div>
        {imgs.length > 1 && (
          <div className="flex gap-2 mb-2">
            {imgs.map((im, k) => (
              <button key={im.url} type="button" onClick={() => setIdx(k)} className={`btn btn-xs ${idx === k ? 'btn-primary' : 'btn-ghost border-slate-200'}`}>
                {ANGLE_VI[im.angle] || `Ảnh ${k + 1}`}{perImage ? ` · ${perImage[k]} mụn viêm` : ''}
              </button>
            ))}
          </div>
        )}
        <AnnotatedImage key={imgs[idx]?.url} image={imgs[idx]} result={r} imageIndex={idx} showBoxes={showBoxes} />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="checkbox checkbox-xs" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Hiện vùng khoanh
          </label>
          <a href={imgs[idx]?.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Xem ảnh gốc</a>
        </div>
        <div className="mt-2"><BoxLegend /></div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">Mức độ mụn viêm:</span> <SeverityTag value={r.severity} />
          {session.reviewed && r.severity_auto && r.severity !== r.severity_auto && <span className="text-xs text-slate-500">(bác sĩ chốt)</span>}
        </div>
        {(r.inflammatory_total ?? r.inflammatory_count) != null && (
          <p className="text-slate-600">
            Số mụn viêm: <b>{r.inflammatory_total ?? r.inflammatory_count}</b> nốt
            {perImage?.length > 1 && <span className="text-slate-500"> ({imgs.map((im, k) => `${(ANGLE_VI[im.angle] || '').toLowerCase()} ${perImage[k]}`).join(' · ')}; mức độ tính theo nửa mặt nhiều mụn nhất)</span>}
          </p>
        )}
        <div>
          <p className="text-slate-500 mb-1">Kết luận theo nhóm{session.reviewed ? ' (bác sĩ)' : ' (AI)'}:</p>
          <ul className="space-y-1">
            {(r.groups || []).map((g) => (
              <li key={g.group} className="flex justify-between gap-3 bg-slate-50 border border-slate-200 rounded px-3 py-1">
                <span className={g.present ? 'text-slate-800' : 'text-slate-400'}>{g.name}</span>
                <span className={g.present ? 'text-slate-700' : 'text-slate-400'}>
                  {!g.present ? 'Không' : session.reviewed ? (g.total ? `Có · ${g.total} nốt` : 'Có') : g.boxes === false ? 'Có dấu hiệu' : `Có · ${g.confirmed || 0} vị trí rõ${g.possible ? `, ${g.possible} nghi ngờ` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {Object.keys(tally).length > 0 && (
          <p className="text-slate-600">
            Vùng khoanh trên ảnh này: {Object.entries(tally).map(([n, c]) => `${n} ×${c}`).join(', ')}
            {doctorAdded > 0 && <span className="text-blue-700"> · bác sĩ khoanh thêm {doctorAdded} vùng</span>}
          </p>
        )}
        {r.doctor_note && <p className="bg-teal-50 border border-teal-100 rounded-lg p-2 text-teal-800"><b>Bác sĩ ghi chú:</b> {r.doctor_note}</p>}
        {r.ai_summary?.customer_summary && <p className="text-slate-600"><b>Nhận xét AI:</b> {r.ai_summary.customer_summary}</p>}
        {tips.length > 0 && (
          <div>
            <p className="font-medium text-slate-700 mb-1">Lời khuyên</p>
            <ul className="list-disc pl-5 text-slate-600 space-y-0.5">{tips.map((t, i) => <li key={i}>{t.tip}</li>)}</ul>
          </div>
        )}
        {r.ai_summary?.products?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {r.ai_summary.products.map((p) => <Link key={p.id} to={`/shops/${p.slug}`} className="badge badge-outline py-3 hover:border-primary">{p.name}</Link>)}
          </div>
        )}
        <p className="text-[11px] text-slate-400">Kết quả {session.reviewed ? 'đã được bác sĩ xem lại' : 'do AI phân tích, chưa được bác sĩ xác nhận'}, chỉ mang tính tham khảo.</p>
        <div className="text-xs border-t border-slate-100 pt-2 text-slate-500">
          {session.allow_training ? (
            <span>Bạn đang cho phép dùng ảnh của lượt soi này để cải thiện AI (đã bỏ thông tin định danh).{' '}
              <button type="button" className="text-red-600 underline" onClick={() => onWithdraw(session.id)}>Rút lại đồng ý</button>
            </span>
          ) : session.consent_withdrawn_at ? `Bạn đã rút lại đồng ý dùng ảnh để cải thiện AI ngày ${dayjs(session.consent_withdrawn_at).format('DD/MM/YYYY')}.`
            : 'Ảnh của lượt soi này không được dùng để cải thiện AI.'}
        </div>
        <div className="text-xs">
          <button type="button" className="btn btn-xs btn-outline btn-error" onClick={() => onDelete(session.id)}>Xóa lượt soi này</button>
          <span className="text-slate-400 ml-2">Ảnh tự động xóa sau 2 năm.</span>
        </div>
      </div>
    </div>
  );
}

// Biểu đồ mức độ mụn viêm theo thời gian (điểm đặc: bác sĩ đã xác nhận, điểm rỗng: kết quả AI)
function TrendChart({ points }) {
  if (points.length < 2) return null;
  const W = 640; const H = 180; const L = 78; const R = 16; const T = 14; const B = 30;
  const t0 = new Date(points[0].created_at).getTime(); const t1 = new Date(points[points.length - 1].created_at).getTime();
  const x = (p, i) => (t1 > t0 ? L + ((new Date(p.created_at).getTime() - t0) / (t1 - t0)) * (W - L - R) : L + (i / (points.length - 1)) * (W - L - R));
  const y = (rank) => T + ((3 - rank) / 3) * (H - T - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p, i).toFixed(1)},${y(p.rank).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-2xl" role="img" aria-label="Biểu đồ mức độ mụn viêm qua các lượt soi">
      {RANK_LABEL.map((label, r) => (
        <g key={label}>
          <line x1={L} x2={W - R} y1={y(r)} y2={y(r)} stroke="#e2e8f0" strokeDasharray={r ? '4 4' : ''} />
          <text x={L - 8} y={y(r) + 4} textAnchor="end" fontSize="11" fill="#64748b">{label}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#0d9488" strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(p, i)} cy={y(p.rank)} r="5" fill={p.reviewed ? '#0d9488' : '#fff'} stroke="#0d9488" strokeWidth="2" />
          {(i === 0 || i === points.length - 1 || points.length <= 6) && (
            <text x={x(p, i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#64748b">{dayjs(p.created_at).format('DD/MM')}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

// So sánh ảnh trước / sau cùng góc chụp
function BeforeAfter({ sessions, progress }) {
  const ordered = useMemo(() => [...sessions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)), [sessions]);
  const [beforeId, setBeforeId] = useState(progress?.first_id || ordered[0]?.id);
  const [afterId, setAfterId] = useState(progress?.last_id || ordered[ordered.length - 1]?.id);
  useEffect(() => { setBeforeId(progress?.first_id || ordered[0]?.id); setAfterId(progress?.last_id || ordered[ordered.length - 1]?.id); }, [ordered, progress]);
  const before = ordered.find((s) => String(s.id) === String(beforeId));
  const after = ordered.find((s) => String(s.id) === String(afterId));
  const angles = ['front', 'left', 'right'].filter((a) => imagesOf(before).some((im) => im.angle === a) && imagesOf(after).some((im) => im.angle === a));
  const [angle, setAngle] = useState('front');
  const [showBoxes, setShowBoxes] = useState(false);
  const shown = angles.includes(angle) ? angle : angles[0];
  if (ordered.length < 2) return null;
  const pickIdx = (s) => Math.max(0, imagesOf(s).findIndex((im) => im.angle === shown));
  const pick = (s) => imagesOf(s)[pickIdx(s)];
  const option = (s) => <option key={s.id} value={s.id}>{dayjs(s.created_at).format('DD/MM/YYYY HH:mm')} · {s.result?.severity || 'Chưa xác định'}</option>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-bold text-slate-800 mb-3">So sánh trước / sau</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <select className="select select-bordered select-sm w-full" value={beforeId} onChange={(e) => setBeforeId(e.target.value)} aria-label="Lượt soi trước">{ordered.map(option)}</select>
        <select className="select select-bordered select-sm w-full" value={afterId} onChange={(e) => setAfterId(e.target.value)} aria-label="Lượt soi sau">{ordered.map(option)}</select>
      </div>
      {angles.length > 1 && (
        <div className="flex gap-2 mb-3">
          {angles.map((a) => (
            <button key={a} type="button" onClick={() => setAngle(a)} className={`btn btn-xs ${shown === a ? 'btn-primary' : 'btn-ghost border-slate-200'}`}>{ANGLE_VI[a]}</button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-slate-600 mb-2 cursor-pointer">
        <input type="checkbox" className="checkbox checkbox-xs" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Hiện vùng AI / bác sĩ khoanh
      </label>
      {!angles.length && <p className="text-xs text-slate-500 mb-2">Hai lượt soi không có ảnh cùng góc chụp, đang hiện ảnh đầu tiên của mỗi lượt.</p>}
      <div className="grid grid-cols-2 gap-3 max-w-2xl">
        {[before, after].map((s, k) => (
          <figure key={k} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            {s && (showBoxes
              ? <AnnotatedImage image={pick(s)} result={s.result} imageIndex={pickIdx(s)} />
              : <img src={pick(s)?.url} alt={k ? 'Sau' : 'Trước'} className="w-full aspect-[4/5] object-cover" />)}
            <figcaption className="p-2 text-xs flex flex-wrap items-center justify-between gap-1">
              <span className="font-medium text-slate-700">{k ? 'Sau' : 'Trước'} · {s ? dayjs(s.created_at).format('DD/MM/YYYY') : ''}</span>
              <SeverityTag value={s?.result?.severity} />
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function ProgressCard({ progress }) {
  if (!progress) return null;
  if (!progress.enough) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-sm text-blue-800 flex gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Cần thêm {progress.needed} lượt soi để xem xu hướng</p>
          <p className="mt-1">Hệ thống cần ít nhất {progress.min_sessions} lượt soi (khác ngày, cùng điều kiện ánh sáng) mới đánh giá tiến triển, vì 1 - 2 lượt dễ lệch do ánh sáng và góc chụp.</p>
          <Link to="/sang-loc-da" className="btn btn-sm btn-primary mt-3 gap-2"><Scan className="w-4 h-4" /> Soi da ngay</Link>
        </div>
      </div>
    );
  }
  const style = {
    improved: ['bg-emerald-50 border-emerald-200 text-emerald-800', TrendingDown, 'Da có tiến triển tốt'],
    worse: ['bg-red-50 border-red-200 text-red-800', TrendingUp, 'Mụn viêm tăng lên'],
    stable: ['bg-slate-50 border-slate-200 text-slate-800', Minus, 'Tình trạng ổn định'],
  }[progress.trend];
  const [cls, Icon, title] = style;
  return (
    <div className={`border rounded-xl p-5 text-sm ${cls}`}>
      <p className="flex items-center gap-2 font-bold text-base"><Icon className="w-5 h-5" /> {title}</p>
      <p className="mt-1">{progress.message}</p>
      {(progress.resolved.length > 0 || progress.appeared.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {progress.resolved.map((n) => <span key={n} className="badge badge-outline border-emerald-300 bg-white text-emerald-700">Không còn thấy: {n}</span>)}
          {progress.appeared.map((n) => <span key={n} className="badge badge-outline border-amber-300 bg-white text-amber-700">Mới xuất hiện: {n}</span>)}
        </div>
      )}
      {!progress.last_reviewed && <p className="mt-2 text-xs opacity-80">Kết quả lượt gần nhất là của AI, chưa được bác sĩ xác nhận.</p>}
      <p className="mt-2 text-xs opacity-70">{progress.caveat}</p>
      {progress.trend === 'worse' && (
        <Link to="/booking" className="btn btn-sm btn-primary mt-3 gap-2"><CalendarCheck className="w-4 h-4" /> Đặt lịch khám</Link>
      )}
    </div>
  );
}

export default function SkinHistoryPage() {
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState('');
  const [data, setData] = useState({ sessions: [], progress: null });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null); // lượt soi đang mở chi tiết

  useEffect(() => {
    axios.get('/api/identity/profile/patients')
      .then((res) => { const list = res.data.data || []; setProfiles(list); setProfileId(list[0]?.id || 'none'); })
      .catch(() => setProfileId('none'));
  }, []);
  const load = () => {
    if (!profileId) return;
    setLoading(true);
    axios.get('/api/ai/analyses/mine', { params: { profile_id: profileId } })
      .then((res) => {
        const list = res.data.data || [];
        setData({ sessions: list, progress: res.data.progress });
        // Đã mở trang => hết nhắc "bác sĩ đã xem lại" (nhãn "Mới" vẫn hiện tới lần tải sau)
        if (list.some((x) => x.unseen)) axios.post('/api/ai/analyses/mine/seen').then(() => window.dispatchEvent(new Event('skin-review-seen'))).catch(() => {});
      })
      .catch(() => setData({ sessions: [], progress: null }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [profileId]);

  const removeScan = async (id) => {
    const clinic = data.sessions.find((x) => x.id === id)?.source === 'clinic';
    if (clinic && !window.confirm('Xóa kết quả AI của lượt soi tại phòng khám?\n\n- Kết quả AI và kết quả bác sĩ xác nhận của lượt soi bị xóa; nếu bạn từng cho phép dùng ảnh để cải thiện AI, ảnh được gỡ khỏi dữ liệu đó.\n- Ảnh chụp tại phòng khám là một phần hồ sơ khám nên vẫn được lưu theo hồ sơ khám.')) return;
    if (!clinic && !window.confirm('Xóa vĩnh viễn lượt soi này?\n\n- Ảnh, kết quả AI và kết quả bác sĩ xác nhận của lượt soi bị xóa khỏi hệ thống, bác sĩ cũng không xem được nữa.\n- Nếu bạn từng cho phép dùng ảnh để cải thiện AI, ảnh cũng được gỡ khỏi dữ liệu đó.\n- Bệnh án các buổi khám không bị ảnh hưởng. Lượt soi đã dùng trong ngày không được hoàn lại.')) return;
    try {
      const res = await axios.delete(`/api/ai/analyses/${id}`);
      alert(res.data.message);
      setOpenId(null);
      load();
    } catch (e) { alert(e.response?.data?.message || 'Không xóa được, vui lòng thử lại'); }
  };

  const withdraw = async (id) => {
    const all = !id;
    if (!window.confirm(all
      ? 'Rút lại đồng ý dùng ảnh để cải thiện AI cho TẤT CẢ lượt soi của bạn? Ảnh đã đưa vào bộ dữ liệu sẽ được gỡ ở lần cập nhật dữ liệu tiếp theo.'
      : 'Rút lại đồng ý dùng ảnh của lượt soi này để cải thiện AI? Ảnh đã đưa vào bộ dữ liệu sẽ được gỡ ở lần cập nhật dữ liệu tiếp theo.')) return;
    try {
      const res = await axios.put('/api/ai/analyses/consent/withdraw', all ? {} : { id });
      alert(res.data.message);
      load();
    } catch (e) { alert(e.response?.data?.message || 'Không thực hiện được, vui lòng thử lại'); }
  };

  const { sessions, progress } = data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-secondary">Lịch sử soi da</h1>
          <p className="text-sm text-slate-500 mt-1">Theo dõi tình trạng da qua các lượt soi. Lượt đã được bác sĩ xem lại hiển thị kết quả bác sĩ hiệu chỉnh.</p>
        </div>
        <Link to="/sang-loc-da" className="btn btn-primary btn-sm gap-2"><Scan className="w-4 h-4" /> Soi da mới</Link>
      </div>

      <label className="block text-sm text-slate-600 max-w-sm">
        Xem của
        <select className="select select-bordered select-sm w-full mt-1" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.relationship})</option>)}
          <option value="none">Lượt soi chưa gắn hồ sơ</option>
        </select>
      </label>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !sessions.length ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          Chưa có lượt soi da nào. <Link to="/sang-loc-da" className="text-primary underline">Soi da ngay</Link>
        </div>
      ) : (
        <>
          {profileId !== 'none' && <ProgressCard progress={progress} />}
          {progress?.points?.length >= 2 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-bold text-slate-800 mb-1">Mức độ mụn viêm qua các lượt soi</h2>
              <p className="text-xs text-slate-500 mb-3">Điểm đặc: bác sĩ đã xác nhận · điểm rỗng: kết quả AI</p>
              <TrendChart points={progress.points} />
            </div>
          )}
          <BeforeAfter sessions={sessions} progress={progress} />
          {sessions.some((x) => x.allow_training) && (
            <p className="text-xs text-slate-500">
              Một số lượt soi đang cho phép dùng ảnh để cải thiện AI.{' '}
              <button type="button" className="text-red-600 underline" onClick={() => withdraw(null)}>Rút lại đồng ý cho tất cả ảnh</button>
            </p>
          )}

          <div className="space-y-3">
            <h2 className="font-bold text-slate-800">Các lượt soi ({sessions.length})</h2>
            {sessions.map((s) => {
              const r = s.result || {};
              const open = openId === s.id;
              return (
                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-4 cursor-pointer" onClick={() => setOpenId(open ? null : s.id)}>
                  <div className="flex gap-2 flex-shrink-0">
                    {imagesOf(s).map((im) => <img key={im.url} src={im.url} alt={ANGLE_VI[im.angle] || 'Ảnh soi'} className="w-20 h-20 rounded-lg object-cover border border-slate-200" />)}
                  </div>
                  <div className="flex-1 min-w-0 text-sm space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{dayjs(s.created_at).format('DD/MM/YYYY HH:mm')}</span>
                      <SeverityTag value={r.severity} />
                      {s.source === 'clinic' && <span className="badge badge-sm badge-outline border-purple-300 text-purple-700">Chụp tại phòng khám</span>}
                      {s.reviewed
                        ? <span className="inline-flex items-center gap-1 text-xs text-teal-700"><Stethoscope className="w-3.5 h-3.5" /> Bác sĩ đã xem lại {dayjs(s.reviewed_at).format('DD/MM')}{s.unseen && <span className="badge badge-sm badge-error text-white ml-1">Mới</span>}</span>
                        : <span className="text-xs text-slate-400">Kết quả AI</span>}
                    </div>
                    <p className="text-slate-600">{(r.groups || []).filter((g) => g.present).map((g) => g.name).join(', ') || 'Không thấy vấn đề rõ'}</p>
                    {r.doctor_note && <p className="bg-teal-50 border border-teal-100 rounded-lg p-2 text-teal-800"><b>Bác sĩ ghi chú:</b> {r.doctor_note}</p>}
                    {!r.doctor_note && r.ai_summary?.customer_summary && <p className="text-slate-500">{r.ai_summary.customer_summary}</p>}
                  </div>
                  <span className="self-start text-xs text-primary flex items-center gap-1 whitespace-nowrap">
                    {open ? 'Thu gọn' : 'Xem chi tiết'} <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </span>
                </div>
                {open && <SessionDetail session={s} onWithdraw={withdraw} onDelete={removeScan} />}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
