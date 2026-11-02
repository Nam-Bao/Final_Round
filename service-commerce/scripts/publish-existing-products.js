// Chạy 1 lần sau khi thêm bảng ProductDetails: mở bán trên web cho các mỹ phẩm ĐÃ bán trước đó
// (trước tính năng "Bán trên web", mọi sản phẩm loại PRODUCT đều hiện ở cửa hàng).
// Chỉ tạo dòng cho sản phẩm chưa có thông tin, không sửa sản phẩm đã cấu hình. Cách chạy:
//   cd service-commerce && node scripts/publish-existing-products.js
require('dotenv').config();
const { sequelize, Product, ProductDetail } = require('../models');
const { slugify } = require('../controllers/product.controller');

(async () => {
  await sequelize.sync(); // tạo bảng ProductDetails nếu service chưa chạy lần nào
  const products = await Product.findAll({ where: { type: 'PRODUCT' }, include: [{ model: ProductDetail }] });
  const used = new Set((await ProductDetail.findAll({ attributes: ['slug'], raw: true })).map((d) => d.slug));
  let created = 0;
  for (const p of products) {
    if (p.ProductDetail) continue;
    let slug = slugify(p.name);
    for (let n = 2; used.has(slug); n += 1) slug = `${slugify(p.name)}-${n}`;
    used.add(slug);
    await ProductDetail.create({ product_id: p.id, slug, is_published: true, published_at: new Date() });
    created += 1;
    console.log(`  + ${p.name} -> /shops/${slug}`);
  }
  console.log(`Đã mở bán trên web ${created} sản phẩm (bỏ qua ${products.length - created} sản phẩm đã có thông tin).`);
  await sequelize.close();
})().catch((err) => { console.error(err); process.exit(1); });
