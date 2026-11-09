// Xóa toàn bộ dữ liệu demo đã tạo (theo danh sách id trong output/created-<target>.json), không đụng dữ liệu khác.
// Chạy trong thư mục service: node -r dotenv/config ../devops/seed-demo/remove.js <service> <e2e|real>
const fs = require('fs');
const path = require('path');

const [svc, target] = process.argv.slice(2);
const expectedDb = target === 'real' ? `${svc}_db` : `${svc}_e2e`;
if (process.env.DB_NAME !== expectedDb) throw new Error(`DB_NAME phải là ${expectedDb}`);
const ledgerFile = path.join(__dirname, 'output', `created-${target}.json`);

(async () => {
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const created = ledger[svc];
  if (!created) return console.log(`Không có dữ liệu demo của ${svc}`);
  const { sequelize } = require(path.join(process.cwd(), 'models'));
  sequelize.options.logging = false;
  const qi = sequelize.getQueryInterface();
  await sequelize.transaction(async (transaction) => {
    // Bảng lương tạo qua API: xóa dòng chi tiết trước
    if (created.Payrolls?.ids?.length) {
      await qi.bulkDelete('PayrollAdjustments', { payroll_id: created.Payrolls.ids }, { transaction });
      await qi.bulkDelete('PayrollItems', { payroll_id: created.Payrolls.ids }, { transaction });
    }
    // Xóa ngược thứ tự đã ghi để không vướng khóa ngoại
    for (const table of Object.keys(created).reverse()) {
      const { pk, ids, userIds } = created[table];
      if (table === 'Profiles') { await qi.bulkDelete(table, { user_id: userIds }, { transaction }); continue; }
      if (!ids?.length) continue;
      for (let i = 0; i < ids.length; i += 1000) await qi.bulkDelete(table, { [pk]: ids.slice(i, i + 1000) }, { transaction });
      console.log(`  ${table}: ${ids.length}`);
    }
  });
  delete ledger[svc];
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
  await sequelize.close();
  console.log(`Đã xóa dữ liệu demo của ${svc}`);
})().catch((e) => { console.error('LỖI, không xóa gì:', e.message); process.exit(1); });
