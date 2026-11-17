// Tiến triển da qua các lượt soi của 1 người (so sánh thô, chỉ tham khảo).
// - Dùng kết quả bác sĩ đã hiệu chỉnh nếu có, không thì kết quả AI.
// - Cần ít nhất 3 lượt soi có kết luận mức độ mới nói xu hướng (1 - 2 lượt dễ lệch vì ánh sáng, góc chụp).
// - Chỉ so mức độ mụn viêm (thang Hayashi) và nhóm vấn đề có / không: số nốt AI đếm dao động nhiều giữa các ảnh nên không so từng nốt.
const pp = require('./postprocess');

const cfg = pp.config;
const MIN_SESSIONS = 3;
const RANK = { [cfg.severity.noLesionLabel]: 0, 'Nhẹ': 1, 'Trung bình': 2, 'Nặng': 3 };
const CAVEAT = 'So sánh thô từ ảnh tự chụp: ánh sáng, góc chụp, trang điểm khác nhau có thể làm kết quả lệch. Chỉ mang tính tham khảo, bác sĩ sẽ đánh giá khi khám.';

// sessions: [{ id, created_at, reviewed, result: { severity, inflammatory_count, groups: [{ group, name, present }] } }] (thứ tự bất kỳ)
const progressOf = (sessions) => {
  const rows = [...sessions]
    .filter((s) => s.result && RANK[s.result.severity] !== undefined)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const points = rows.map((s) => ({
    id: s.id, created_at: s.created_at, reviewed: !!s.reviewed,
    severity: s.result.severity, rank: RANK[s.result.severity], inflammatory_count: s.result.inflammatory_count ?? null,
  }));
  if (rows.length < MIN_SESSIONS) {
    return { enough: false, min_sessions: MIN_SESSIONS, count: rows.length, needed: MIN_SESSIONS - rows.length, points, caveat: CAVEAT };
  }
  const first = rows[0]; const last = rows[rows.length - 1];
  const diff = RANK[last.result.severity] - RANK[first.result.severity];
  const trend = diff < 0 ? 'improved' : diff > 0 ? 'worse' : 'stable';
  const days = Math.max(0, Math.round((new Date(last.created_at) - new Date(first.created_at)) / 86400000));
  const presentOf = (s) => new Map((s.result.groups || []).map((g) => [g.group, g]));
  const before = presentOf(first); const after = presentOf(last);
  const groups = Object.keys(cfg.groups).map((g) => ({ group: g, name: cfg.groups[g].vi, before: !!before.get(g)?.present, after: !!after.get(g)?.present }));
  const from = first.result.severity; const to = last.result.severity;
  const message = trend === 'improved' ? `Mụn viêm giảm từ "${from}" xuống "${to}" sau ${days} ngày (${rows.length} lượt soi).`
    : trend === 'worse' ? `Mụn viêm tăng từ "${from}" lên "${to}" sau ${days} ngày (${rows.length} lượt soi). Nên đặt lịch để bác sĩ kiểm tra.`
    : `Mức mụn viêm giữ ở "${to}" qua ${rows.length} lượt soi trong ${days} ngày.`;
  return {
    enough: true, min_sessions: MIN_SESSIONS, count: rows.length, trend, from, to, days, message,
    resolved: groups.filter((g) => g.before && !g.after).map((g) => g.name), // lần đầu có, lần gần nhất không thấy
    appeared: groups.filter((g) => !g.before && g.after).map((g) => g.name),
    last_reviewed: !!last.reviewed, first_id: first.id, last_id: last.id, points, caveat: CAVEAT,
  };
};

module.exports = { progressOf, MIN_SESSIONS };
