import React from 'react';
import { FlaskConical, ListChecks, Info } from 'lucide-react';

// Nội dung "Thành phần" do quản lý nhập theo định dạng (xem ô Thành phần trong admin):
//   Hoạt chất chính:
//   - Niacinamide | 10% | Làm đều màu, kiểm soát dầu      (tên | nồng độ hãng công bố | công dụng)
//   - Pentylene Glycol | | Giữ ẩm                          (để trống nồng độ = hãng không công bố)
//   Bảng thành phần đầy đủ:
//   Aqua, Glycerin, ...
//   Lưu ý: ...
// Dòng cũ dạng "tên | công dụng" (2 cột) vẫn đọc được. Nội dung nhập tự do hiển thị nguyên văn.
const HEADERS = [
  { key: 'actives', re: /^hoạt chất chính\s*:?\s*$/i },
  { key: 'inci', re: /^bảng thành phần( đầy đủ)?( \(inci\))?\s*:?\s*$/i },
];

export function parseIngredients(text) {
  const result = { actives: [], inci: [], notes: [] };
  if (!text) return null;
  let section = null;
  let structured = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = HEADERS.find((h) => h.re.test(line));
    if (header) { section = header.key; structured = true; continue; }
    if (/^(lưu ý|ghi chú)\s*:/i.test(line)) { result.notes.push(line.replace(/^(lưu ý|ghi chú)\s*:\s*/i, '')); continue; }
    if (section === 'actives' && line.startsWith('-')) {
      const parts = line.replace(/^-\s*/, '').split('|').map((x) => x.trim());
      const [name, concentration, role] = parts.length >= 3 ? parts : [parts[0], '', parts[1] || ''];
      result.actives.push({ name, concentration, role });
    } else if (section === 'inci') {
      // Bảng INCI là 1 dòng ngay sau tiêu đề; các dòng sau đó (Nguồn: ..., ghi chú) là ghi chú
      result.inci.push(...line.split(',').map((x) => x.trim().replace(/\.$/, '')).filter(Boolean));
      section = null;
    } else {
      result.notes.push(line);
    }
  }
  return structured ? result : null;
}

const fmtMass = (grams) => {
  if (grams >= 1) return `${Number(grams.toFixed(2)).toLocaleString('vi-VN')} g`;
  return `${Number((grams * 1000).toFixed(1)).toLocaleString('vi-VN')} mg`;
};

// Lượng hoạt chất trong 1 sản phẩm = nồng độ % x dung tích / khối lượng tịnh.
// Sản phẩm tính theo gam (w/w) cho ra số chính xác; sản phẩm tính theo ml quy đổi 1 ml ≈ 1 g nên là ước tính.
export function amountInPack(concentration, capacity) {
  const pct = String(concentration || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  const size = String(capacity || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/gi)?.pop()?.match(/(\d+(?:[.,]\d+)?)\s*(ml|g)/i);
  if (!pct || !size) return null;
  const grams = (parseFloat(pct[1].replace(',', '.')) / 100) * parseFloat(size[1].replace(',', '.'));
  const byWeight = size[2].toLowerCase() === 'g';
  return { text: `${byWeight ? '' : '≈ '}${fmtMass(grams)}`, estimate: !byWeight, of: `${size[1]}${size[2].toLowerCase()}` };
}

export default function ProductIngredients({ text, capacity }) {
  const parsed = parseIngredients(text);
  if (!parsed) return <p className="whitespace-pre-line leading-relaxed max-w-3xl">{text}</p>;

  const rows = parsed.actives.map((a) => ({ ...a, amount: amountInPack(a.concentration, capacity) }));
  const hasEstimate = rows.some((r) => r.amount?.estimate);

  return (
    <div className="space-y-6 max-w-4xl">
      {rows.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
            <FlaskConical className="w-4 h-4 text-teal-600" /> Hoạt chất chính
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-teal-50 text-teal-800">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Thành phần</th>
                  <th className="text-left font-semibold px-4 py-2 whitespace-nowrap">Nồng độ / Hàm lượng</th>
                  <th className="text-left font-semibold px-4 py-2 whitespace-nowrap">Lượng trong 1 sản phẩm</th>
                  <th className="text-left font-semibold px-4 py-2">Công dụng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.name} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{a.name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {a.concentration
                        ? <span className="font-semibold text-teal-700">{a.concentration}</span>
                        : <span className="text-slate-400 italic">Hãng không công bố</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {a.amount ? <>{a.amount.text} <span className="text-slate-400 text-xs">/ {a.amount.of}</span></> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{a.role || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Nồng độ là số liệu do hãng công bố (in trên bao bì hoặc tên sản phẩm).
            {hasEstimate && ' Lượng trong 1 sản phẩm dạng lỏng được ước tính theo 1 ml ≈ 1 g.'}
          </p>
        </div>
      )}

      {parsed.inci.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-1">
            <ListChecks className="w-4 h-4 text-teal-600" /> Bảng thành phần đầy đủ (INCI) – {parsed.inci.length} thành phần
          </h3>
          <p className="text-xs text-slate-500 mb-2">
            Theo quy định ghi nhãn mỹ phẩm (ASEAN/EU), thành phần được liệt kê theo hàm lượng giảm dần; các thành phần dưới 1% có thể xếp theo thứ tự bất kỳ.
            Hãng không bắt buộc công bố % từng thành phần (bí mật công thức).
          </p>
          <ol className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-slate-700">
            {parsed.inci.map((x, i) => (
              <li key={`${x}-${i}`} className="flex gap-2">
                <span className="text-slate-400 w-6 text-right shrink-0">{i + 1}.</span><span>{x}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {parsed.notes.length > 0 && (
        <div className="flex gap-2 text-slate-600 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">{parsed.notes.map((n) => <p key={n}>{n}</p>)}</div>
        </div>
      )}
    </div>
  );
}
