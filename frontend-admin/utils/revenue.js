import axios from 'axios';
import dayjs from 'dayjs';

// Doanh thu toàn hệ thống = phòng khám (service-booking) + mỹ phẩm online / bán tại quầy (service-commerce).
// Đơn mỹ phẩm kê sau buổi khám đã nằm trong hoá đơn khám nên chỉ tính 1 lần (clinic_products).
const API = 'http://localhost:4000/api';
const authConfig = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });

// Nguồn chi tiết (bảng) theo thứ tự hiển thị
export const SOURCES = [
  { key: 'exam', label: 'Phí khám', group: 'kham' },
  { key: 'forfeited', label: 'Cọc khám khách huỷ (phòng khám giữ)', group: 'kham' },
  { key: 'services', label: 'Dịch vụ lẻ', group: 'dieutri' },
  { key: 'packages', label: 'Gói liệu trình', group: 'dieutri' },
  { key: 'clinic_products', label: 'Mỹ phẩm kê tại phòng khám', group: 'mypham' },
  { key: 'online_products', label: 'Mỹ phẩm bán online', group: 'mypham' },
  { key: 'store_products', label: 'Mỹ phẩm NVBH bán / đặt hộ', group: 'mypham' },
  { key: 'refunds', label: 'Hoàn tiền trả hàng', group: 'mypham' },
  { key: 'consultation', label: 'Tư vấn chuyên gia', group: 'tuvan' },
];

// 4 nhóm trên biểu đồ (màu theo thứ tự cố định của bảng màu đã kiểm định)
export const GROUPS = [
  { key: 'kham', label: 'Khám bệnh', color: '#2a78d6' },
  { key: 'dieutri', label: 'Dịch vụ & gói liệu trình', color: '#eb6834' },
  { key: 'mypham', label: 'Mỹ phẩm', color: '#1baf7a' },
  { key: 'tuvan', label: 'Tư vấn chuyên gia', color: '#eda100' },
];

const emptyRow = () => Object.fromEntries(SOURCES.map((s) => [s.key, 0]));
export const sumRow = (row) => SOURCES.reduce((s, x) => s + (row[x.key] || 0), 0);
export const groupRow = (row) => Object.fromEntries(GROUPS.map((g) => [g.key, SOURCES.filter((s) => s.group === g.key).reduce((s, x) => s + (row[x.key] || 0), 0)]));

// Tải & ghép báo cáo trong khoảng [from, to] (dayjs). Trả về dòng theo ngày + tổng + top
export async function fetchRevenue(from, to) {
  const params = { from: from.format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') };
  const [clinic, sales] = await Promise.all([
    axios.get(`${API}/booking/reports/revenue`, { ...authConfig(), params }),
    axios.get(`${API}/commerce/reports/sales`, { ...authConfig(), params }),
  ]);
  const byDay = {};
  [...clinic.data.series, ...sales.data.series].forEach((d) => {
    byDay[d.date] = byDay[d.date] || emptyRow();
    SOURCES.forEach((s) => { if (d[s.key]) byDay[d.date][s.key] += d[s.key]; });
  });
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
  const totals = emptyRow();
  days.forEach((d) => SOURCES.forEach((s) => { totals[s.key] += d[s.key]; }));
  return {
    days, totals, total: sumRow(totals),
    counts: { ...clinic.data.counts, orders: sales.data.counts.orders, refunds: sales.data.counts.refunds },
    top_services: clinic.data.top_services, top_packages: clinic.data.top_packages, top_products: sales.data.top_products,
  };
}

// Cột biểu đồ: theo ngày (đủ mọi ngày, kể cả ngày 0đ) hoặc theo tháng nếu khoảng > 92 ngày
export function toChartData(days, from, to) {
  const byMonth = to.diff(from, 'day') > 92;
  const map = {};
  days.forEach((d) => {
    const k = byMonth ? d.date.slice(0, 7) : d.date;
    map[k] = map[k] || emptyRow();
    SOURCES.forEach((s) => { map[k][s.key] += d[s.key]; });
  });
  const out = [];
  for (let c = from.startOf(byMonth ? 'month' : 'day'); !c.isAfter(to); c = c.add(1, byMonth ? 'month' : 'day')) {
    const k = c.format(byMonth ? 'YYYY-MM' : 'YYYY-MM-DD');
    const row = map[k] || emptyRow();
    out.push({
      key: k,
      label: byMonth ? c.format('MM/YYYY') : c.format('DD/MM'),
      tooltipLabel: byMonth ? `Tháng ${c.format('MM/YYYY')}` : `Ngày ${c.format('DD/MM/YYYY')}`,
      values: groupRow(row),
      row,
    });
  }
  return { bars: out, byMonth };
}

export const vnd = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
