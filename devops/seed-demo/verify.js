// Gọi các API báo cáo / màn hình chính để kiểm tra dữ liệu demo hiển thị hợp lý.
// Chạy trong service-booking: node -r dotenv/config ../devops/seed-demo/verify.js <e2e|real> <gateway>
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const [target, gateway] = process.argv.slice(2);
const { plan, today } = JSON.parse(fs.readFileSync(path.join(__dirname, 'output', `plan-${target}.json`), 'utf8'));
const users = plan.identity.Users;
const idOf = (email) => users.find((u) => u.email.startsWith(email))?.id;
const staff = { manager: plan.booking.SalaryRates[0].created_by };
const tok = (id, role) => `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '10m' })}`;
const get = async (url, auth) => {
  const r = await fetch(`${gateway}/api${url}`, { headers: { Authorization: auth } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const vnd = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')}đ`;
let fails = 0;
const show = (label, ok, detail) => { if (!ok) fails += 1; console.log(`${ok ? 'OK ' : 'LỖI'} ${label}${detail ? ' | ' + detail : ''}`); };

(async () => {
  const MG = tok(staff.manager, 'GEN_MANAGER');
  const consultantId = plan.booking.FollowUpLogs[0]?.consultant_id || staff.manager;
  const CS = tok(consultantId, 'CONSULTANT');
  const from = plan.booking.SalaryRates[0].effective_from;

  const rev = await get(`/booking/reports/revenue?from=${from}&to=${today}`, MG);
  const totals = rev.body?.data?.totals || rev.body?.totals || {};
  show('Báo cáo doanh thu dịch vụ', rev.status === 200, JSON.stringify(totals).slice(0, 260));
  const sales = await get(`/commerce/reports/sales?from=${from}&to=${today}`, MG);
  show('Báo cáo doanh thu mỹ phẩm', sales.status === 200, JSON.stringify(sales.body?.totals || sales.body?.data?.totals || {}).slice(0, 200));
  const todayRep = await get('/booking/reports/today', MG);
  show('Số liệu hôm nay (tổng quan)', todayRep.status === 200, JSON.stringify(todayRep.body?.data || {}).slice(0, 200));
  const overview = await get('/commerce/reports/overview', MG);
  show('Tổng quan kho / đơn chờ', overview.status === 200, `đơn chờ xử lý ${overview.body?.data?.pending_orders}, đề xuất nhập chờ duyệt ${overview.body?.data?.pending_purchase}`);

  const payroll = await get(`/booking/payroll?month=${from.slice(0, 7)}`, MG);
  const items = payroll.body?.data?.items || [];
  show('Bảng lương tháng đầu', payroll.status === 200 && items.length > 0, items.map((i) => `${i.employee_name}: ${i.worked_shifts} ca, ${vnd(i.total)}`).join('; ').slice(0, 400));

  const queues = await get('/booking/appointments/consultant-queues', CS);
  const qd = queues.body?.data || {};
  show('Không gian tư vấn', queues.status === 200, `đặt hôm nay ${qd.checkIn?.length}, chờ tại quầy ${qd.walkIn?.length}, chờ chốt bill ${qd.hotLeads?.length}, cần dời lịch ${qd.reschedule?.length}`);
  const calls = await get('/booking/follow-ups/calls', CS);
  const cd = calls.body?.data || {};
  show('Gọi chăm sóc khách', calls.status === 200, `nhắc lịch ${cd.reminders?.length}, tái khám ${cd.revisits?.length}, thăm hỏi ${cd.aftercare?.length}`);
  const refunds = await get('/booking/appointments/pending-refunds', CS);
  show('Chờ hoàn cọc', refunds.status === 200 && (refunds.body?.data || []).length > 0, `${(refunds.body?.data || []).length} lịch`);
  const bank = await get('/booking/bank-transactions', MG);
  const bt = bank.body?.data || [];
  show('Đối soát tiền vào', bank.status === 200, `${bt.length} giao dịch, chưa khớp ${bt.filter((b) => b.status === 'UNMATCHED').length}`);

  const ktv = plan.booking.TreatmentSessions.find((s) => s.technician_id)?.technician_id;
  const tq = await get('/booking/sessions/technician-queues', tok(ktv, 'TECHNICIAN'));
  show('Không gian kỹ thuật viên', tq.status === 200, JSON.stringify(Object.fromEntries(Object.entries(tq.body?.data || {}).map(([k, v]) => [k, v.length]))));

  const expert = plan.booking.Consultations[0]?.expert_id;
  const ex = await get('/booking/consultations/expert/mine', tok(expert, 'EXPERT'));
  show('Không gian chuyên gia', ex.status === 200, `${(ex.body?.data || []).length} buổi`);

  const doctor = plan.booking.Appointments.find((a) => a.appointment_date === today && a.doctor_id)?.doctor_id;
  const dq = await get('/booking/appointments/my-today', tok(doctor, 'DOCTOR'));
  show('Hàng chờ bác sĩ hôm nay', dq.status === 200, `${(dq.body?.data || []).length} khách`);

  const customer = plan.booking.CustomerPackages[0]?.customer_id;
  const CU = tok(customer, 'CUSTOMER');
  const hist = await get('/booking/appointments/my-history', CU);
  show('Khách: sổ lịch khám', hist.status === 200 && (hist.body?.data || []).length > 0, `${(hist.body?.data || []).length} lịch`);
  const pk = await get('/booking/packages/mine', CU);
  show('Khách: gói liệu trình', pk.status === 200 && (pk.body?.data || []).length > 0, `${(pk.body?.data || []).length} gói`);
  const ord = await get('/commerce/orders', CU);
  show('Khách: đơn hàng', ord.status === 200, `HTTP ${ord.status}, ${(ord.body?.data || []).length} đơn`);

  const reviews = await get('/booking/reviews', '');
  show('Đánh giá bác sĩ công khai', reviews.status === 200 && (reviews.body?.data || []).length > 0, `${(reviews.body?.data || []).length} đánh giá`);
  const news = await get('/media/news?limit=20', '');
  show('Tin tức công khai', news.status === 200, `${(news.body?.data || []).length} bài`);
  console.log(`\n${fails ? fails + ' mục cần xem lại' : 'Tất cả đạt'}`);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });
