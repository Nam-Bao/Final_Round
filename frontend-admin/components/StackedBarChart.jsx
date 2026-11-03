import React, { useMemo, useState } from 'react';

// Biểu đồ cột chồng (SVG thuần, không thêm thư viện): mỗi cột = 1 ngày / tháng, mỗi đoạn = 1 nguồn.
// Quy ước: màu theo thứ tự cố định của series, khe 2px giữa các đoạn, bo 4px ở đầu cột,
// lưới & trục nhạt, tooltip khi rê chuột, chú thích luôn có (>= 2 series).
// series: [{ key, label, color }], data: [{ label, tooltipLabel, values: { [key]: number } }]
const W = 760;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

const niceMax = (v) => {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};
const short = (v) => (v >= 1e9 ? `${+(v / 1e9).toFixed(1)} tỷ` : v >= 1e6 ? `${+(v / 1e6).toFixed(1)} tr` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${v}`);
const vnd = (n) => `${Math.round(n).toLocaleString('vi-VN')}đ`;

export default function StackedBarChart({ data, series, height = 260 }) {
  const [hover, setHover] = useState(null);
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const totals = data.map((d) => series.reduce((s, x) => s + Math.max(0, d.values[x.key] || 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const slot = data.length ? innerW / data.length : innerW;
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v) => PAD.top + innerH - (v / max) * innerH;
  // Nhãn trục X thưa (tối đa ~10 nhãn) để không chồng chữ
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));

  const bars = useMemo(() => data.map((d, i) => {
    const cx = PAD.left + slot * i + slot / 2;
    let acc = 0;
    const segs = series.map((s) => {
      const v = Math.max(0, d.values[s.key] || 0);
      const y0 = y(acc); acc += v; const y1 = y(acc);
      return { key: s.key, color: s.color, v, top: y1, h: Math.max(0, y0 - y1) };
    }).filter((s) => s.v > 0);
    return { cx, segs, total: acc };
  }), [data, series, max]);

  if (!data.length) return <div className="text-center text-gray-400 py-10">Chưa có doanh thu trong khoảng thời gian này</div>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Biểu đồ doanh thu theo thời gian">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e6e2" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#6b6a66">{short(t)}</text>
          </g>
        ))}
        {bars.map((b, i) => (
          <g key={i}>
            {b.segs.map((s, j) => {
              const isTop = j === b.segs.length - 1;
              const gap = j > 0 ? 2 : 0; // khe 2px giữa các đoạn
              const h = Math.max(0, s.h - gap);
              const r = isTop ? Math.min(4, h, barW / 2) : 0;
              const x = b.cx - barW / 2;
              // Chỉ bo tròn đầu cột (đoạn trên cùng), đáy cột thẳng trên trục
              const d = `M${x},${s.top + h} V${s.top + r} Q${x},${s.top} ${x + r},${s.top} H${x + barW - r} Q${x + barW},${s.top} ${x + barW},${s.top + r} V${s.top + h} Z`;
              return <path key={s.key} d={d} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
            })}
            {/* Vùng rê chuột rộng hơn cột */}
            <rect x={b.cx - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            {i % labelEvery === 0 && (
              <text x={b.cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b6a66">{data[i].label}</text>
            )}
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#c9c8c2" strokeWidth={1} />
      </svg>

      {hover !== null && (
        <div className="absolute pointer-events-none bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-xs z-10"
          style={{ left: `${(bars[hover].cx / W) * 100}%`, top: 0, transform: `translateX(${bars[hover].cx > W * 0.6 ? '-105%' : '5%'})` }}>
          <div className="font-semibold text-gray-800 mb-1">{data[hover].tooltipLabel || data[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 justify-between min-w-[200px]">
              <span className="flex items-center gap-1.5 text-gray-600"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
              <span className="text-gray-800 tabular-nums">{vnd(data[hover].values[s.key] || 0)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t mt-1 pt-1 font-semibold text-gray-800"><span>Tổng</span><span className="tabular-nums">{vnd(bars[hover].total)}</span></div>
        </div>
      )}

      {/* Chú thích: luôn có, màu đi kèm chữ (không chỉ dựa vào màu) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}
