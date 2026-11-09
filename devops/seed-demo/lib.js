// Tiện ích dùng chung cho bộ tạo dữ liệu demo
const { execFileSync } = require('child_process');
const crypto = require('crypto');

// Số ngẫu nhiên có hạt giống: chạy lại cho cùng kết quả
let seed = 20261107;
const rand = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const weighted = (pairs) => { const total = pairs.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[0][0]; };
const uuid = () => crypto.randomUUID();

// Giờ Việt Nam
const vnToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Chủ nhật
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`);
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const diffDays = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const slots = (start, end, step) => { const out = []; const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)); const e = Number(end.slice(0, 2)) * 60 + Number(end.slice(3)); for (let m = s; m + step <= e; m += step) out.push(hhmm(m)); return out; };

// Đọc dữ liệu đang có trong DB (qua docker, chỉ đọc)
const CONTAINERS = { identity: 'o2o_db_identity', booking: 'o2o_db_booking', commerce: 'o2o_db_commerce', media: 'o2o_db_media' };
const dbName = (svc, target) => (target === 'real' ? `${svc}_db` : `${svc}_e2e`);
const query = (svc, target, sql) => {
  const out = execFileSync('docker', ['exec', CONTAINERS[svc], 'psql', '-U', 'postgres', '-d', dbName(svc, target), '-tA', '-c', `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.trim());
};

const vnd = (n) => Number(n).toLocaleString('vi-VN');
const code6 = (id) => id.slice(0, 6).toUpperCase();

module.exports = { rand, int, pick, chance, shuffle, weighted, uuid, vnToday, addDays, weekday, at, addMin, diffDays, hhmm, slots, query, dbName, vnd, code6 };
