// Chạy từ service-booking: node ../tests/danh-gia-chuyen-gia.test.js
// Test đánh giá chuyên gia tư vấn: chỉ buổi hoàn thành mới đánh giá được, mỗi buổi 1 lần, hiện ở trang Đánh giá (tab Chuyên gia)
// và popup hồ sơ chuyên gia, quản lý ẩn được. Dữ liệu tạm, dọn ở finally.
process.loadEnvFile();
const crypto = require('crypto');
const RB = require('module').createRequire(`${process.cwd()}/index.js`);
const RI = require('module').createRequire(`${process.cwd()}/../service-identity/index.js`);
const jwt = RB('jsonwebtoken'), dayjs = RB('dayjs');
const B = RB('./models'); B.sequelize.options.logging = false;
const I = RI('./models'); I.sequelize.options.logging = false;

const G = 'http://localhost:4000/api';
const out = [];
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + x : ''}`);
const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
const call = async (method, url, token, body) => {
  const r = await fetch(G + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json().catch(() => ({}))];
};
const made = { users: [], consults: [] };

(async () => {
  const cskh = await I.User.findOne({ where: { email: 'cskh.test@test.local' } });
  const manager = await I.User.findOne({ where: { role: 'GEN_MANAGER' } });
  const expert = await I.User.findOne({ where: { email: 'tuvan.dalieu@glowskin.example' }, include: [I.Profile] });
  const tExp = sign(expert.id, 'EXPERT'), tMgr = sign(manager.id, 'GEN_MANAGER');
  const [s0, b0] = await call('POST', '/identity/users/walk-in', sign(cskh.id, 'CONSULTANT'), { full_name: 'Nguyen Van Danh Gia', phone: `09${crypto.randomInt(10000000, 99999999)}` });
  if (s0 !== 201) throw new Error(JSON.stringify(b0));
  made.users.push(b0.data.userId);
  const tCus = sign(b0.data.userId, 'CUSTOMER');
  // Buổi tư vấn đã cọc, đang diễn ra: 2 bên vào phòng 10 phút trước (đủ thời lượng tối thiểu)
  const c = await B.Consultation.create({
    customer_id: b0.data.userId, customer_name: 'Nguyen Van Danh Gia', expert_id: expert.id, expert_name: expert.Profile?.full_name, consult_field: 'DERMATOLOGY',
    appointment_date: dayjs().format('YYYY-MM-DD'), appointment_time: dayjs().subtract(15, 'minute').format('HH:mm:00'), question: 'Da tôi nổi mụn ẩn vùng cằm',
    status: 'CONFIRMED', deposit_amount: 300000, paid_at: new Date(), payment_method: 'VIETQR',
    expert_joined_at: new Date(Date.now() - 10 * 60000), customer_joined_at: new Date(Date.now() - 10 * 60000),
  });
  made.consults.push(c.id);
  let s, b;

  [s, b] = await call('POST', `/booking/consultations/${c.id}/review`, tCus, { rating: 5, comment: 'Chuyên gia giải thích rõ ràng' });
  check('Buổi chưa hoàn thành (chuyên gia chưa gửi kết quả): chưa đánh giá được', s === 400, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/booking/consultations/${c.id}/result`, tExp, { assessment: 'Da dầu, mụn ẩn vùng cằm liên quan nội tiết', advice: 'Rửa mặt dịu nhẹ, dùng BHA 2 lần mỗi tuần, chống nắng hằng ngày' });
  check('Chuyên gia gửi kết quả: buổi tư vấn hoàn thành', s === 200 && (await B.Consultation.findByPk(c.id)).status === 'COMPLETED', `${s} ${b.message}`);
  [s, b] = await call('POST', `/booking/consultations/${c.id}/review`, tCus, { rating: 6 });
  check('Số sao ngoài 1 - 5: bị chặn', s === 400, `${s} ${b.message}`);
  [s, b] = await call('POST', `/booking/consultations/${c.id}/review`, sign(crypto.randomUUID(), 'CUSTOMER'), { rating: 5 });
  check('Khách khác không đánh giá hộ được', s === 404, `${s} ${b.message}`);
  [s, b] = await call('POST', `/booking/consultations/${c.id}/review`, tCus, { rating: 5, comment: 'Chuyên gia giải thích rõ ràng, lời khuyên dễ làm theo' });
  check('Khách đánh giá buổi đã hoàn thành', s === 200, `${s} ${b.message}`);
  [s, b] = await call('POST', `/booking/consultations/${c.id}/review`, tCus, { rating: 1 });
  check('Mỗi buổi chỉ đánh giá 1 lần', s === 409, `${s} ${b.message}`);

  [s, b] = await call('GET', '/booking/consultations/reviews', null);
  const mine = (b.data || []).find((r) => r.id === c.id);
  check('Trang Đánh giá (tab Chuyên gia): có đánh giá, kèm tên và lĩnh vực chuyên gia', s === 200 && mine?.rating === 5 && mine.expert_id === expert.id && mine.expert_name && mine.consult_field_label === 'Da liễu', JSON.stringify(mine));
  check('Tên khách được ẩn bớt', mine && mine.customer_name !== 'Nguyen Van Danh Gia', mine?.customer_name);
  [s, b] = await call('GET', `/booking/consultations/reviews?expert_id=${expert.id}`, null);
  check('Popup hồ sơ chuyên gia: có đánh giá', (b.data || []).some((r) => r.id === c.id));
  [s, b] = await call('GET', '/booking/consultations/reviews?expert_id=abc', null);
  check('Mã chuyên gia sai: trả danh sách rỗng', s === 200 && Array.isArray(b.data) && b.data.length === 0, s);
  [s, b] = await call('GET', '/booking/consultations/expert-stats', null);
  check('Điểm trung bình của chuyên gia có tính đánh giá này', s === 200 && (b.data?.[expert.id]?.review_count || 0) >= 1, JSON.stringify(b.data?.[expert.id]));

  [s, b] = await call('PUT', `/booking/consultations/${c.id}/review-visibility`, tMgr, { hidden: true });
  [, b] = await call('GET', '/booking/consultations/reviews', null);
  check('Quản lý ẩn đánh giá: không còn hiện công khai', s === 200 && !(b.data || []).some((r) => r.id === c.id), s);
  [s] = await call('PUT', `/booking/consultations/${c.id}/review-visibility`, tCus, { hidden: false });
  check('Khách không tự hiện lại đánh giá bị ẩn', s === 403, s);
})().catch((e) => out.push(`FAIL  LỖI SCRIPT: ${e.stack}`)).finally(async () => {
  try {
    await B.Consultation.destroy({ where: { id: made.consults } });
    for (const m of ['WalkInClaim', 'PatientProfile', 'Profile']) await I[m].destroy({ where: { user_id: made.users } });
    await I.User.destroy({ where: { id: made.users } });
    out.push('--- đã dọn dữ liệu tạm');
  } catch (e) { out.push(`CLEANUP LỖI: ${e.message}`); }
  console.log(out.join('\n'));
  console.log(`\nKẾT QUẢ: ${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('FAIL')).length} FAIL`);
  process.exit(0);
});
