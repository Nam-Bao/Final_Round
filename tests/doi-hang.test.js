// Chạy từ service-commerce: node ../tests/doi-hang.test.js
// Test đổi hàng / hàng khuyến mãi (góp ý giảng viên): mặc định đổi sản phẩm, hàng khuyến mãi không hoàn tiền và chỉ đổi đúng
// sản phẩm. Không tạo vận đơn GHN thật: bước GHN lấy hàng được thay bằng ghi trạng thái vào DB. Dữ liệu tạm, dọn ở finally.
process.loadEnvFile();
const crypto = require('crypto');
const RC = require('module').createRequire(`${process.cwd()}/index.js`);
const RI = require('module').createRequire(`${process.cwd()}/../service-identity/index.js`);
const jwt = RC('jsonwebtoken');
const { Op } = RC('sequelize');
const C = RC('./models'); C.sequelize.options.logging = false;
const I = RI('./models'); I.sequelize.options.logging = false;

const G = 'http://localhost:4000/api';
const out = [];
const section = (t) => out.push(`\n## ${t}`);
const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  -> ' + x : ''}`);
const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
const call = async (method, url, token, body) => {
  const r = await fetch(G + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json().catch(() => ({}))];
};
const made = { users: [], orders: [], carts: [], stock: [], sale: [] };
const IMG = ['https://res.cloudinary.com/test/image/upload/v1/test-doi-hang.jpg'];
const BANK = { bank_name: 'Ngân hàng Test', bank_account: '1234567890', bank_holder: 'KHACH TEST' };
const ADDR = { recipient_name: 'Khach Test', shipping_phone: '0900000000', shipping_address: '1 Đường Test, Phường Test, Quận Test, TP Hồ Chí Minh', shipping_district_id: 1461, shipping_ward_code: '21303' };

(async () => {
  const cskh = await I.User.findOne({ where: { email: 'cskh.test@test.local' } });
  const tSales = sign(crypto.randomUUID(), 'SALES');
  const [s0, b0] = await call('POST', '/identity/users/walk-in', sign(cskh.id, 'CONSULTANT'), { full_name: 'Test Doi Hang', phone: `09${crypto.randomInt(10000000, 99999999)}` });
  if (s0 !== 201) throw new Error(JSON.stringify(b0));
  made.users.push(b0.data.userId);
  const cust = { id: b0.data.userId, token: sign(b0.data.userId, 'CUSTOMER') };

  const prods = (await C.Product.findAll({ where: { type: 'PRODUCT', stock_quantity: { [Op.gte]: 20 } }, include: [{ model: C.ProductDetail }], order: [['price', 'ASC']] }))
    .filter((p) => p.ProductDetail?.is_published && !p.ProductDetail?.is_prescription && !p.ProductDetail?.sale_percent);
  const cheap = prods[0], mid = prods[Math.floor(prods.length / 2)], pricey = prods[prods.length - 1];
  for (const p of [cheap, mid, pricey]) made.stock.push({ id: p.id, qty: p.stock_quantity });
  const stock = async (p) => (await C.Product.findByPk(p.id)).stock_quantity;
  // Đơn đã nhận hàng (thay cho đặt + giao GHN), có thể đánh dấu dòng là hàng khuyến mãi
  const completedOrder = async (lines) => {
    const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const o = await C.Order.create({ customer_id: cust.id, ...ADDR, total_amount: total, discount_amount: 0, shipping_fee: 30000, status: 'COMPLETED', tracking_code: `TDH${crypto.randomInt(1e9)}`, payment_method: 'COD' });
    made.orders.push(o.id);
    const details = [];
    for (const l of lines) details.push(await C.OrderDetail.create({ order_id: o.id, product_id: l.p.id, quantity: l.qty, price: l.price, weight: 200, is_sale: !!l.sale }));
    return { order: o, details };
  };
  const ask = (orderId, detail, extra = {}) => call('POST', '/commerce/returns', cust.token, { order_id: orderId, reason: 'DEFECTIVE', description: 'Vòi bơm bị hỏng, không bơm được kem ra ngoài', images: IMG, items: [{ order_detail_id: detail.id, quantity: detail.quantity }], agree: true, ...extra });
  const toReceived = async (id) => {
    await call('PUT', `/commerce/returns/admin/${id}/approve`, tSales, {});
    await C.OrderReturn.update({ status: 'PICKING', tracking_code: `TRT${crypto.randomInt(1e9)}` }, { where: { id } }); // thay cho GHN lấy hàng thật
    return call('PUT', `/commerce/returns/admin/${id}/receive`, tSales, {});
  };
  let s, b;

  section('1. Ghi nhận hàng khuyến mãi lúc đặt hàng');
  const pd = await C.ProductDetail.findOne({ where: { product_id: mid.id } });
  made.sale.push({ id: pd.id, sale_percent: pd.sale_percent, sale_start: pd.sale_start, sale_end: pd.sale_end });
  await pd.update({ sale_percent: 10, sale_start: new Date(Date.now() - 3600e3), sale_end: new Date(Date.now() + 86400e3) });
  const [cart] = await C.Cart.findOrCreate({ where: { customer_id: cust.id } }); made.carts.push(cart.id);
  await C.CartItem.create({ cart_id: cart.id, product_id: mid.id, quantity: 1 });
  await C.CartItem.create({ cart_id: cart.id, product_id: cheap.id, quantity: 1 });
  [s, b] = await call('POST', '/commerce/orders/checkout', cust.token, { ...ADDR, payment_method: 'COD' });
  if (b.data?.id) made.orders.push(b.data.id);
  const det = b.data?.id ? await C.OrderDetail.findAll({ where: { order_id: b.data.id }, raw: true }) : [];
  check('Đặt hàng: sản phẩm đang giảm giá được đánh dấu khuyến mãi', s === 201 && det.find((x) => x.product_id === mid.id)?.is_sale === true, `${s} ${b.message || ''}`);
  check('Đặt hàng: sản phẩm giá thường không bị đánh dấu', det.find((x) => x.product_id === cheap.id)?.is_sale === false);
  await pd.update(made.sale[0]);
  [s, b] = await call('GET', '/commerce/returns/policy', null);
  check('Quy định hoàn trả có cách xử lý và quy định hàng khuyến mãi', s === 200 && b.data.resolutions?.EXCHANGE && /khuyến mãi/.test(b.data.sale_rule), JSON.stringify(b.data.resolutions));

  section('2. Khách gửi yêu cầu');
  const A = await completedOrder([{ p: cheap, qty: 2, price: Number(cheap.price) }]);
  [s, b] = await ask(A.order.id, A.details[0]);
  const rA = b.data?.id;
  check('Mặc định là đổi sản phẩm, không cần tài khoản ngân hàng', s === 201 && b.data.resolution === 'EXCHANGE' && !b.data.bank_account, `${s} ${b.message}`);
  const R = await completedOrder([{ p: cheap, qty: 1, price: Number(cheap.price) }]);
  [s, b] = await ask(R.order.id, R.details[0], { resolution: 'REFUND' });
  check('Chọn hoàn tiền mà thiếu tài khoản: bị chặn', s === 400, `${s} ${b.message}`);
  [s, b] = await ask(R.order.id, R.details[0], { resolution: 'REFUND', ...BANK });
  const rR = b.data?.id;
  check('Chọn hoàn tiền có tài khoản: nhận yêu cầu hoàn tiền', s === 201 && b.data.resolution === 'REFUND', `${s} ${b.message}`);
  const S = await completedOrder([{ p: mid, qty: 1, price: Math.round(Number(mid.price) * 0.9), sale: true }]);
  [s, b] = await ask(S.order.id, S.details[0], { resolution: 'REFUND', ...BANK });
  check('Hàng khuyến mãi chọn hoàn tiền: bị chặn', s === 400 && /khuyến mãi/.test(b.message), `${s} ${b.message}`);
  [s, b] = await ask(S.order.id, S.details[0]);
  const rS = b.data?.id;
  check('Hàng khuyến mãi chọn đổi: nhận yêu cầu, ghi là hàng khuyến mãi', s === 201 && b.data.items[0].is_sale === true, `${s} ${b.message}`);
  const L = await completedOrder([{ p: cheap, qty: 1, price: Number(cheap.price) - 1000 }]); // đơn cũ chưa có cờ, giá mua thấp hơn niêm yết
  [s, b] = await ask(L.order.id, L.details[0], { resolution: 'REFUND', ...BANK });
  check('Đơn cũ chưa có cờ, giá mua thấp hơn niêm yết: coi là hàng khuyến mãi, không hoàn tiền', s === 400, `${s} ${b.message}`);

  section('3. Đổi đúng sản phẩm');
  [s, b] = await toReceived(rA);
  check('Kho nhận hàng trả, chờ kiểm tra', s === 200 && (await C.OrderReturn.findByPk(rA)).status === 'RECEIVED', `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rA}/refund`, tSales, { refund_ref: 'FT-TEST-1', restock: true });
  check('Khách chọn đổi: không ghi hoàn tiền được', s === 400, `${s} ${b.message}`);
  [s] = await call('PUT', `/commerce/returns/admin/${rA}/exchange`, cust.token, {});
  check('Khách không tự tạo đổi hàng được', s === 403, s);
  let st = await stock(cheap);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rA}/exchange`, tSales, { restock: true });
  let ret = await C.OrderReturn.findByPk(rA);
  const ex = ret.exchange_order_id && await C.Order.findByPk(ret.exchange_order_id);
  const exDet = ex ? await C.OrderDetail.findAll({ where: { order_id: ex.id }, raw: true }) : [];
  if (ex) made.orders.push(ex.id);
  check('Kiểm tra đạt, đổi hàng: yêu cầu chuyển sang Đã đổi hàng', s === 200 && ret.status === 'EXCHANGED', `${s} ${b.message}`);
  check('Tạo đơn giao hàng đổi: đã duyệt, khách không trả thêm, không thu hộ', ex?.status === 'CONFIRMED' && Number(ex.total_amount) === Number(ex.discount_amount) && Number(ex.shipping_fee) === 0, ex && `${ex.status} ${ex.total_amount}-${ex.discount_amount} ship=${ex.shipping_fee}`);
  check('Đơn đổi đúng sản phẩm và số lượng', exDet.length === 1 && exDet[0].product_id === cheap.id && exDet[0].quantity === 2);
  check('Nhập lại hàng trả và xuất hàng đổi: tồn kho không đổi', (await stock(cheap)) === st, `${st} -> ${await stock(cheap)}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rA}/exchange`, tSales, {});
  check('Không đổi hàng 2 lần', s === 400, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/orders/admin/${ex.id}/status`, tSales, { status: 'PROCESSING' });
  check('Đơn đổi đi tiếp luồng đóng gói như đơn thường', s === 200, `${s} ${b.message}`);

  section('4. Hàng khuyến mãi chỉ đổi đúng sản phẩm');
  await toReceived(rS);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rS}/to-refund`, tSales, BANK);
  check('Không chuyển hàng khuyến mãi sang hoàn tiền', s === 400, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rS}/exchange`, tSales, { items: [{ product_id: cheap.id, quantity: 1 }] });
  check('Không đổi hàng khuyến mãi sang sản phẩm khác', s === 400, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rS}/exchange`, tSales, { items: [{ product_id: mid.id, quantity: 2 }] });
  check('Không đổi hàng khuyến mãi khác số lượng', s === 400, `${s} ${b.message}`);
  st = await stock(mid);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rS}/exchange`, tSales, {});
  ret = await C.OrderReturn.findByPk(rS);
  if (ret.exchange_order_id) made.orders.push(ret.exchange_order_id);
  const exS = ret.exchange_order_id ? await C.OrderDetail.findOne({ where: { order_id: ret.exchange_order_id }, raw: true }) : null;
  check('Đổi đúng sản phẩm khuyến mãi: được, đơn đổi vẫn ghi là hàng khuyến mãi', s === 200 && exS?.product_id === mid.id && exS.is_sale === true, `${s} ${b.message}`);
  check('Không nhập lại kho: xuất 1 sản phẩm đổi', (await stock(mid)) === st - 1, `${st} -> ${await stock(mid)}`);

  section('5. Hết hàng: đổi sản phẩm khác hoặc chuyển sang hoàn tiền');
  const D = await completedOrder([{ p: mid, qty: 1, price: Number(mid.price) }]);
  [, b] = await ask(D.order.id, D.details[0]);
  const rD = b.data.id;
  await toReceived(rD);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rD}/exchange`, tSales, { items: [{ product_id: pricey.id, quantity: 1 }] });
  check('Đổi sang sản phẩm đắt hơn hàng trả: bị chặn', s === 400 && /vượt/.test(b.message), `${s} ${b.message}`);
  await C.Product.update({ stock_quantity: 0 }, { where: { id: mid.id } });
  [s, b] = await call('PUT', `/commerce/returns/admin/${rD}/exchange`, tSales, {});
  check('Hết hàng, không nhập lại kho: báo không đủ hàng để đổi', s === 400 && /không đủ hàng/.test(b.message), `${s} ${b.message}`);
  check('Đổi thất bại: yêu cầu vẫn chờ kiểm tra, không tạo đơn', (await C.OrderReturn.findByPk(rD)).status === 'RECEIVED' && !(await C.OrderReturn.findByPk(rD)).exchange_order_id);
  const stCheap = await stock(cheap);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rD}/exchange`, tSales, { items: [{ product_id: cheap.id, quantity: 1 }] });
  ret = await C.OrderReturn.findByPk(rD);
  if (ret.exchange_order_id) made.orders.push(ret.exchange_order_id);
  check('Đổi sang sản phẩm rẻ hơn còn hàng: được', s === 200 && ret.status === 'EXCHANGED' && (await stock(cheap)) === stCheap - 1, `${s} ${b.message}`);
  const E = await completedOrder([{ p: mid, qty: 1, price: Number(mid.price) }]);
  [, b] = await ask(E.order.id, E.details[0]);
  const rE = b.data.id;
  await toReceived(rE);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rE}/to-refund`, tSales, { ...BANK, bank_account: '12' });
  check('Chuyển sang hoàn tiền với số tài khoản sai: bị chặn', s === 400, `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rE}/to-refund`, tSales, BANK);
  check('Chuyển sang hoàn tiền (khách đồng ý)', s === 200 && (await C.OrderReturn.findByPk(rE)).resolution === 'REFUND', `${s} ${b.message}`);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rE}/refund`, tSales, { refund_ref: 'FT-TEST-2', restock: false });
  check('Ghi nhận hoàn tiền sau khi chuyển', s === 200 && (await C.OrderReturn.findByPk(rE)).status === 'REFUNDED', `${s} ${b.message}`);

  section('6. Hoàn tiền như cũ');
  await toReceived(rR);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rR}/exchange`, tSales, {});
  check('Khách chọn hoàn tiền: nhân viên không tự đổi hàng thay', s === 400 && !(await C.OrderReturn.findByPk(rR)).exchange_order_id, `${s} ${b.message}`);
  const R2 = await completedOrder([{ p: cheap, qty: 1, price: Number(cheap.price) }]);
  [, b] = await ask(R2.order.id, R2.details[0], { resolution: 'REFUND', ...BANK });
  const rR2 = b.data.id;
  await toReceived(rR2);
  [s, b] = await call('PUT', `/commerce/returns/admin/${rR2}/refund`, tSales, { refund_ref: 'FT-TEST-3', restock: true });
  check('Yêu cầu hoàn tiền (hàng thường): hoàn tiền như trước', s === 200 && (await C.OrderReturn.findByPk(rR2)).status === 'REFUNDED', `${s} ${b.message}`);
})().catch((e) => out.push(`FAIL  LỖI SCRIPT: ${e.stack}`)).finally(async () => {
  try {
    await C.OrderReturn.destroy({ where: { customer_id: made.users } });
    await C.OrderDetail.destroy({ where: { order_id: made.orders } });
    await C.Order.destroy({ where: { id: made.orders } });
    await C.Order.destroy({ where: { customer_id: made.users } }); // đơn đổi tạo thêm (nếu có)
    await C.CartItem.destroy({ where: { cart_id: made.carts } });
    await C.Cart.destroy({ where: { id: made.carts } });
    for (const p of made.stock) await C.Product.update({ stock_quantity: p.qty }, { where: { id: p.id } });
    for (const d of made.sale) await C.ProductDetail.update({ sale_percent: d.sale_percent, sale_start: d.sale_start, sale_end: d.sale_end }, { where: { id: d.id } });
    for (const m of ['WalkInClaim', 'PatientProfile', 'Profile']) await I[m].destroy({ where: { user_id: made.users } });
    await I.User.destroy({ where: { id: made.users } });
    out.push('\n--- đã dọn dữ liệu tạm');
  } catch (e) { out.push(`CLEANUP LỖI: ${e.message}`); }
  console.log(out.join('\n'));
  console.log(`\nKẾT QUẢ: ${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('FAIL')).length} FAIL`);
  process.exit(0);
});
