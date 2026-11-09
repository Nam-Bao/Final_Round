// Ghi phần dữ liệu của 1 service theo plan-<target>.json, qua chính model của service đó, trong 1 transaction.
// Chạy trong thư mục service: node -r dotenv/config ../devops/seed-demo/write.js <identity|booking|commerce|media> <e2e|real>
const fs = require('fs');
const path = require('path');

const [svc, target] = process.argv.slice(2);
const DB = { identity: 'identity', booking: 'booking', commerce: 'commerce', media: 'media' };
if (!DB[svc] || !['e2e', 'real'].includes(target)) throw new Error('Dùng: write.js <service> <e2e|real>');
const expectedDb = target === 'real' ? `${svc}_db` : `${svc}_e2e`;
if (process.env.DB_NAME !== expectedDb) throw new Error(`DB_NAME phải là ${expectedDb} (đang là ${process.env.DB_NAME})`);

// Thứ tự ghi theo khóa ngoại
const ORDER = {
  identity: ['Users', 'Profiles', 'PatientProfiles', 'DoctorProfiles', 'EmployeeRecords', 'MedicalRecords'],
  booking: ['SpaServices', 'TreatmentPackages', 'AttendanceKiosks', 'WorkShifts', 'ShiftRequests', 'AttendanceExplanations', 'AttendanceRecords', 'AttendanceCheckoutRequests',
    'SalaryRates', 'PatientSafeties', 'ExpertShifts', 'Appointments', 'Invoices', 'Transactions', 'AppointmentCancellations', 'AppointmentReviews', 'CustomerPackages',
    'TreatmentSessions', 'ServiceSessions', 'ServiceReviews', 'Consultations', 'ExpertPayouts', 'BankTransactions', 'FollowUpLogs'],
  commerce: ['Promotions', 'Products', 'ProductDetails', 'MaterialSpecs', 'MaterialNorms', 'InventoryRequests', 'MaterialLots', 'UserAddresses', 'Orders', 'OrderDetails', 'PromotionUsages', 'Reviews', 'OrderReturns'],
  media: ['Articles', 'ArticleSubmissions'],
};

(async () => {
  const file = path.join(__dirname, 'output', `plan-${target}.json`);
  const { plan, password } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tables = plan[svc];
  const models = require(path.join(process.cwd(), 'models'));
  const { sequelize } = models;
  sequelize.options.logging = false;
  const modelOf = (table) => Object.values(sequelize.models).find((m) => m.getTableName() === table);

  const unknown = Object.keys(tables).filter((t) => !ORDER[svc].includes(t));
  if (unknown.length) throw new Error(`Chưa xếp thứ tự ghi cho bảng: ${unknown.join(', ')}`);

  if (svc === 'identity') {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    for (const u of tables.Users) u.password_hash = hash;
  }

  const created = {};
  await sequelize.transaction(async (transaction) => {
    for (const table of ORDER[svc]) {
      const rows = tables[table];
      if (!rows?.length) continue;
      const Model = modelOf(table);
      if (!Model) throw new Error(`Không tìm thấy model cho bảng ${table}`);
      // silent: giữ nguyên createdAt / updatedAt theo dòng thời gian mô phỏng
      for (let i = 0; i < rows.length; i += 500) {
        await Model.bulkCreate(rows.slice(i, i + 500), { transaction, validate: true, hooks: false, silent: true });
      }
      const pk = Model.primaryKeyAttribute;
      created[table] = { pk, ids: rows.map((r) => r[pk]).filter((x) => x !== undefined), userIds: table === 'Profiles' ? rows.map((r) => r.user_id) : undefined };
      console.log(`  ${table}: ${rows.length}`);
    }
  });

  // Ghi lại các id đã tạo để xóa được về sau
  const ledger = path.join(__dirname, 'output', `created-${target}.json`);
  const all = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')) : {};
  all[svc] = created;
  fs.writeFileSync(ledger, JSON.stringify(all, null, 0));
  await sequelize.close();
  console.log(`Đã ghi xong ${svc}`);
})().catch((e) => {
  console.error('LỖI, đã hoàn tác toàn bộ:', e.message, e.errors ? JSON.stringify(e.errors.slice?.(0, 3).map((x) => x.message)) : '', e.parent?.detail || '');
  process.exit(1);
});
