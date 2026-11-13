// Xóa toàn bộ dữ liệu demo của 1 service: các dòng đã tạo (output/created-<target>.json), cộng các dòng phát sinh từ chúng
// trong lúc demo (theo khóa ngoại, và theo customer_id của khách demo). Không đụng dữ liệu khác.
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
  const demoUserIds = ledger.identity?.Users?.ids || [];

  await sequelize.transaction(async (transaction) => {
    const select = (sql, replacements) => sequelize.query(sql, { replacements, transaction, type: sequelize.QueryTypes.SELECT });
    const clean = (name) => name.replace(/"/g, '');
    // Khóa ngoại trỏ tới từng bảng và khóa chính của từng bảng (đọc từ catalog của Postgres)
    const fks = await select(`select c.conrelid::regclass::text as child, a.attname as col, c.confrelid::regclass::text as parent
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey) where c.contype = 'f'`);
    const pks = await select(`select i.indrelid::regclass::text as tbl, a.attname as col from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indisprimary`);
    const pkOf = Object.fromEntries(pks.map((r) => [clean(r.tbl), r.col]));
    const childrenOf = (table) => fks.filter((f) => clean(f.parent) === table).map((f) => ({ table: clean(f.child), col: f.col }));
    const counts = {};

    // Xóa các dòng có column thuộc values, xóa con trước theo khóa ngoại
    const removeWhere = async (table, column, values, depth = 0) => {
      if (!values.length || depth > 6) return;
      const pk = pkOf[table];
      for (let i = 0; i < values.length; i += 1000) {
        const batch = values.slice(i, i + 1000);
        if (pk) {
          const ids = (await select(`select "${pk}" as id from "${table}" where "${column}" in (:batch)`, { batch })).map((r) => r.id);
          if (!ids.length) continue;
          for (const child of childrenOf(table)) await removeWhere(child.table, child.col, ids, depth + 1);
          await sequelize.query(`delete from "${table}" where "${pk}" in (:ids)`, { replacements: { ids }, transaction });
          counts[table] = (counts[table] || 0) + ids.length;
        } else {
          const [, meta] = await sequelize.query(`delete from "${table}" where "${column}" in (:batch)`, { replacements: { batch }, transaction });
          counts[table] = (counts[table] || 0) + (meta?.rowCount || 0);
        }
      }
    };

    // 1. Dữ liệu khách demo tạo thêm trong lúc demo (đơn hàng, lịch hẹn, giỏ hàng...) ở các service khác identity
    if (svc !== 'identity' && demoUserIds.length) {
      const withCustomer = await select(`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'customer_id'`);
      for (const { t } of withCustomer) await removeWhere(t, 'customer_id', demoUserIds);
    }
    // 2. Các dòng đã tạo, xóa ngược thứ tự ghi
    for (const table of Object.keys(created).reverse()) {
      const { pk, ids, userIds } = created[table];
      if (table === 'Profiles') await removeWhere(table, 'user_id', userIds || []);
      else await removeWhere(table, pk, ids || []);
    }
    Object.entries(counts).forEach(([t, n]) => console.log(`  ${t}: ${n}`));
  });

  delete ledger[svc];
  fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
  await sequelize.close();
  console.log(`Đã xóa dữ liệu demo của ${svc}`);
})().catch((e) => { console.error('LỖI, không xóa gì:', e.message); process.exit(1); });
