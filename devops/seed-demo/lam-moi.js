// Làm mới dữ liệu demo theo ngày hôm nay bằng 1 lệnh: sao lưu, xóa dữ liệu demo cũ, tạo lại, lập bảng lương.
// Chạy ở thư mục gốc dự án:  node devops/seed-demo/lam-moi.js            (database thật, gateway http://localhost:4000)
//                            node devops/seed-demo/lam-moi.js e2e <gateway>  (bản sao để thử)
// Bước lập bảng lương cần backend đang chạy; nếu chưa chạy thì các bước khác vẫn làm, cuối cùng in lệnh để chạy sau.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const target = process.argv[2] || 'real';
const gateway = process.argv[3] || 'http://localhost:4000';
if (!['real', 'e2e'].includes(target)) throw new Error('Dùng: node devops/seed-demo/lam-moi.js [real|e2e] [gateway]');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'output');
const SERVICES = ['identity', 'booking', 'commerce', 'media'];
const CONTAINER = { identity: 'o2o_db_identity', booking: 'o2o_db_booking', commerce: 'o2o_db_commerce', media: 'o2o_db_media' };
const dbOf = (svc) => (target === 'real' ? `${svc}_db` : `${svc}_e2e`);

const runIn = (svc, script, args = []) => {
  const cwd = path.join(ROOT, `service-${svc}`);
  execFileSync('node', ['-r', 'dotenv/config', path.join(__dirname, script), ...args], {
    cwd, stdio: 'inherit', env: { ...process.env, DB_NAME: dbOf(svc), NODE_PATH: path.join(cwd, 'node_modules') },
  });
};
const step = (text) => console.log(`\n=== ${text}`);

(async () => {
  fs.mkdirSync(path.join(OUT, 'backup'), { recursive: true });

  step('1. Sao lưu database');
  const stamp = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  for (const svc of SERVICES) {
    const file = path.join(OUT, 'backup', `${dbOf(svc)}-${stamp}.sql`);
    fs.writeFileSync(file, execFileSync('docker', ['exec', CONTAINER[svc], 'pg_dump', '-U', 'postgres', dbOf(svc)], { maxBuffer: 512 * 1024 * 1024 }));
    console.log(`  ${path.relative(ROOT, file)}`);
  }

  const ledgerFile = path.join(OUT, `created-${target}.json`);
  const ledger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')) : {};
  if (Object.keys(ledger).length) {
    step('2. Xóa dữ liệu demo cũ');
    for (const svc of ['media', 'commerce', 'booking', 'identity']) if (ledger[svc]) runIn(svc, 'remove.js', [svc, target]);
  } else step('2. Chưa có dữ liệu demo cũ, bỏ qua bước xóa');

  step('3. Lập kế hoạch dữ liệu theo ngày hôm nay');
  execFileSync('node', [path.join(__dirname, 'plan.js'), target], { cwd: __dirname, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('  Đã lập kế hoạch');

  step('4. Ghi dữ liệu');
  for (const svc of SERVICES) runIn(svc, 'write.js', [svc, target]);

  step('5. Lập bảng lương các tháng đã qua');
  const alive = await fetch(`${gateway}/api/booking/config/timing`).then((r) => r.ok).catch(() => false);
  if (alive) runIn('booking', 'payroll.js', [target, gateway]);
  else console.log(`  Backend chưa chạy ở ${gateway}. Bật backend rồi chạy:\n  cd service-booking && node -r dotenv/config ../devops/seed-demo/payroll.js ${target} ${gateway}`);

  console.log('\nXong. Mật khẩu tài khoản demo: Demo@123');
})().catch((e) => { console.error('\nDỪNG LẠI:', e.message); process.exit(1); });
