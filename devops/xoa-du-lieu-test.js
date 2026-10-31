// Xoá toàn bộ dữ liệu của các tài khoản test (email đuôi @test.local) trước khi website chạy thật.
// Gồm: tài khoản, hồ sơ, bệnh án, lịch khám, hoá đơn, buổi dịch vụ / liệu trình, đơn hàng, đánh giá, chat.
// Đơn hàng bị xoá sẽ được hoàn lại tồn kho.
//
// Cách chạy (từ thư mục gốc dự án, các database đang bật):
//   node devops/xoa-du-lieu-test.js          -> chỉ liệt kê, KHÔNG xoá
//   node devops/xoa-du-lieu-test.js --xoa    -> xoá thật
const path = require('path');

const root = path.join(__dirname, '..');
const load = (service) => {
  const dir = path.join(root, service);
  try { process.loadEnvFile(path.join(dir, '.env')); } catch { /* không có .env */ }
  return require('module').createRequire(path.join(dir, 'index.js'))('./models');
};
const I = load('service-identity');
const B = load('service-booking');
const C = load('service-commerce');
const { Op } = require('module').createRequire(path.join(root, 'service-identity', 'index.js'))('sequelize');

const TEST_EMAIL = '%@test.local';
const confirm = process.argv.includes('--xoa');

(async () => {
  const users = await I.User.findAll({ where: { email: { [Op.like]: TEST_EMAIL } }, raw: true });
  const ids = users.map((u) => u.id);
  if (!ids.length) {
    console.log('Không có tài khoản test nào (@test.local).');
    process.exit(0);
  }

  const profiles = await I.PatientProfile.findAll({ where: { user_id: ids }, raw: true });
  const appointments = await B.Appointment.findAll({ where: { customer_id: ids }, raw: true });
  const aptIds = appointments.map((a) => a.id);
  const invoices = await B.Invoice.findAll({ where: { [Op.or]: [{ customer_id: ids }, { appointment_id: aptIds }] }, raw: true });
  const customerPackages = await B.CustomerPackage.findAll({ where: { customer_id: ids }, raw: true });
  const orders = await C.Order.findAll({ where: { customer_id: ids }, include: [C.OrderDetail] });
  const chats = await I.ChatSession.findAll({ where: { [Op.or]: [{ customer_id: ids }, { consultant_id: ids }] }, raw: true });

  console.log(`Tài khoản test: ${users.length} (${users.map((u) => `${u.email} [${u.role}]`).join(', ')})`);
  console.log(`Lịch khám: ${appointments.length}, hoá đơn: ${invoices.length}, gói liệu trình: ${customerPackages.length}, đơn hàng: ${orders.length}, phiên chat: ${chats.length}`);
  if (!confirm) {
    console.log('\nChưa xoá gì. Chạy lại với --xoa để xoá thật.');
    process.exit(0);
  }

  // Commerce: hoàn kho rồi xoá đơn, đánh giá, giỏ hàng, voucher đã lưu / đã dùng, địa chỉ
  for (const order of orders) {
    if (order.status !== 'CANCELLED') {
      for (const d of order.OrderDetails) {
        await C.Product.increment('stock_quantity', { by: d.quantity, where: { id: d.product_id } });
      }
    }
  }
  const orderIds = orders.map((o) => o.id);
  await C.Review.destroy({ where: { customer_id: ids } });
  await C.OrderDetail.destroy({ where: { order_id: orderIds } });
  await C.Order.destroy({ where: { id: orderIds } });
  const carts = await C.Cart.findAll({ where: { customer_id: ids }, raw: true });
  await C.CartItem.destroy({ where: { cart_id: carts.map((c) => c.id) } });
  await C.Cart.destroy({ where: { customer_id: ids } });
  await C.PromotionUsage.destroy({ where: { customer_id: ids } });
  await C.SavedPromotion.destroy({ where: { customer_id: ids } });
  await C.UserAddress.destroy({ where: { customer_id: ids } });

  // Booking: đánh giá, buổi dịch vụ / liệu trình, hoá đơn, lịch khám, ca làm của nhân viên test
  await B.AppointmentReview.destroy({ where: { customer_id: ids } });
  await B.ServiceReview.destroy({ where: { customer_id: ids } });
  await B.ServiceSession.destroy({ where: { customer_id: ids } });
  await B.TreatmentSession.destroy({ where: { customer_package_id: customerPackages.map((p) => p.id) } });
  await B.CustomerPackage.destroy({ where: { customer_id: ids } });
  await B.Transaction.destroy({ where: { invoice_id: invoices.map((i) => i.id) } });
  await B.Invoice.destroy({ where: { id: invoices.map((i) => i.id) } });
  await B.FollowUpLog.destroy({ where: { customer_id: ids } });
  await B.Appointment.destroy({ where: { id: aptIds } });
  await B.WorkShift.destroy({ where: { employee_id: ids } });
  await B.ShiftRequest.destroy({ where: { employee_id: ids } });

  // Identity: chat, bệnh án, hồ sơ, tài khoản
  await I.ChatMessage.destroy({ where: { session_id: chats.map((c) => c.id) } });
  await I.ChatSession.destroy({ where: { id: chats.map((c) => c.id) } });
  await I.MedicalRecord.destroy({ where: { patient_profile_id: profiles.map((p) => p.id) } });
  await I.PatientProfile.destroy({ where: { user_id: ids } });
  await I.Attendance.destroy({ where: { employee_id: ids } });
  await I.Profile.destroy({ where: { user_id: ids } });
  await I.User.destroy({ where: { id: ids } });

  console.log('\nĐã xoá toàn bộ dữ liệu test và hoàn lại tồn kho.');
  process.exit(0);
})().catch((e) => {
  console.error('Lỗi:', e.message);
  process.exit(1);
});
