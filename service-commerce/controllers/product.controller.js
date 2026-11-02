const { sequelize, Product, ProductDetail, Category, Review, Order, OrderDetail, OrderReturn } = require('../models');
const { Op } = require('sequelize'); // getAllProducts dùng Op/sequelize/Review (trước đây thiếu import)
const { getRatingStats } = require('./review.controller');

// Số lượng đã bán thật: tổng số lượng trong các đơn đã giao xong (COMPLETED, gồm cả đơn tại quầy),
// trừ phần khách đã trả lại và được hoàn tiền. productIds bỏ trống => tính cho tất cả sản phẩm.
const getSoldStats = async (productIds) => {
  const productFilter = productIds ? { product_id: productIds } : {};
  const rows = await OrderDetail.findAll({
    attributes: ['product_id', [sequelize.fn('SUM', sequelize.col('quantity')), 'sold']],
    where: productFilter,
    include: [{ model: Order, attributes: [], where: { status: 'COMPLETED' } }],
    group: ['product_id'],
    raw: true
  });
  const sold = Object.fromEntries(rows.map((r) => [r.product_id, Number(r.sold) || 0]));

  const refunded = await OrderReturn.findAll({ where: { status: 'REFUNDED' }, attributes: ['items'], raw: true });
  refunded.forEach((ret) => (ret.items || []).forEach((item) => {
    if (sold[item.product_id] !== undefined) sold[item.product_id] = Math.max(0, sold[item.product_id] - Number(item.quantity || 0));
  }));
  return sold;
};

// Gắn điểm đánh giá + số đã bán vào sản phẩm trả cho khách
const withStats = (product, ratingStats, soldStats) => ({
  ...product.toJSON(),
  avg_rating: ratingStats[product.id]?.avg_rating || 0,
  review_count: ratingStats[product.id]?.review_count || 0,
  sold_count: soldStats[product.id] || 0,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1. Lấy danh sách Sản phẩm (Kèm theo thông tin Danh mục)
// API công khai: CHỈ trả mỹ phẩm bán cho khách (type PRODUCT), không lộ vật tư nội bộ (MATERIAL)
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { type: 'PRODUCT' },
      include: [{ model: Category, attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    // Điểm đánh giá thật từ bảng Reviews và số đã bán từ các đơn đã giao (trang shop hiển thị)
    const [ratingStats, soldStats] = await Promise.all([getRatingStats(), getSoldStats()]);
    const data = products.map(p => withStats(p, ratingStats, soldStats));
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// ==========================================
// CỬA HÀNG WEB: chỉ sản phẩm đã được bật "Bán trên web" (ProductDetail.is_published)
// ==========================================
const SKIN_TYPES = ['Mọi loại da', 'Da thường', 'Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da mụn'];
const SHOP_DETAIL_FIELDS = ['slug', 'brand', 'origin', 'capacity', 'skin_types', 'short_description'];

// "Sữa rửa mặt Cetaphil 500ml" -> "sua-rua-mat-cetaphil-500ml"
const slugify = (text) => String(text || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'san-pham';

// Slug không trùng sản phẩm khác: thêm -2, -3... nếu đã có
const uniqueSlug = async (base, productId, transaction) => {
  const taken = await ProductDetail.findAll({
    where: { slug: { [Op.like]: `${base}%` }, product_id: { [Op.ne]: productId } },
    attributes: ['slug'], transaction, raw: true
  });
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

// Danh sách cho trang cửa hàng
const getShopProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { type: 'PRODUCT' },
      include: [
        { model: Category, attributes: ['id', 'name'] },
        { model: ProductDetail, where: { is_published: true }, attributes: SHOP_DETAIL_FIELDS }
      ],
      order: [['createdAt', 'DESC']]
    });
    const [ratingStats, soldStats] = await Promise.all([getRatingStats(), getSoldStats()]);
    res.status(200).json({ data: products.map((p) => withStats(p, ratingStats, soldStats)) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Chi tiết theo slug (link cũ dạng /shops/<id> vẫn mở được, frontend tự đổi URL sang slug)
const getShopProduct = async (req, res) => {
  try {
    const key = String(req.params.slug || '');
    const product = await Product.findOne({
      where: UUID_RE.test(key) ? { id: key, type: 'PRODUCT' } : { type: 'PRODUCT' },
      include: [
        { model: Category, attributes: ['id', 'name', 'description'] },
        { model: ProductDetail, where: UUID_RE.test(key) ? { is_published: true } : { is_published: true, slug: key } }
      ]
    });
    if (!product) return res.status(404).json({ message: 'Sản phẩm không tồn tại hoặc chưa bán trên web' });
    const [ratingStats, soldStats] = await Promise.all([getRatingStats([product.id]), getSoldStats([product.id])]);
    res.status(200).json({ data: withStats(product, ratingStats, soldStats) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [ADMIN] Thông tin bán web của 1 sản phẩm (chưa có thì trả mẫu trống kèm slug gợi ý)
const getProductDetailAdmin = async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    const product = await Product.findByPk(req.params.id, { include: [{ model: ProductDetail }] });
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    const detail = product.ProductDetail?.toJSON() || {
      slug: await uniqueSlug(slugify(product.name), product.id), is_published: false, skin_types: []
    };
    res.status(200).json({ data: detail, skin_type_options: SKIN_TYPES });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [ADMIN] Lưu thông tin bán web + bật / tắt bán trên web
const TEXT_LIMITS = { brand: 100, origin: 100, capacity: 50, short_description: 300, description: 5000, benefits: 3000, ingredients: 3000, usage: 3000, storage: 1000, warnings: 2000 };
const upsertProductDetail = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!UUID_RE.test(req.params.id)) throw Object.assign(new Error('Không tìm thấy sản phẩm'), { status: 404 });
    const product = await Product.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!product) throw Object.assign(new Error('Không tìm thấy sản phẩm'), { status: 404 });

    const existing = await ProductDetail.findOne({ where: { product_id: product.id }, transaction: t, lock: t.LOCK.UPDATE });

    // Chỉ ghi các trường có gửi lên; trường không gửi giữ nguyên giá trị cũ (không bị xóa trắng)
    const values = {};
    for (const [field, max] of Object.entries(TEXT_LIMITS)) {
      if (!(field in req.body)) continue;
      const v = String(req.body[field] ?? '').trim();
      if (v.length > max) throw Object.assign(new Error(`Trường ${field} tối đa ${max} ký tự`), { status: 400 });
      values[field] = v || null;
    }
    if ('skin_types' in req.body) {
      values.skin_types = (Array.isArray(req.body.skin_types) ? req.body.skin_types : []).filter((x) => SKIN_TYPES.includes(x));
    }
    values.is_published = 'is_published' in req.body ? req.body.is_published === true : Boolean(existing?.is_published);
    // Kiểm tra điều kiện mở bán trên nội dung sau khi lưu (giá trị mới, hoặc giá trị cũ nếu không gửi)
    const merged = { ...(existing?.toJSON() || {}), ...values };

    // Điều kiện mở bán trên web: phải là mỹ phẩm (không phải vật tư) và có đủ nội dung tối thiểu cho khách đọc
    if (values.is_published) {
      if (product.type !== 'PRODUCT') throw Object.assign(new Error('Vật tư nội bộ không được bán trên web'), { status: 400 });
      if (!merged.description || merged.description.length < 30) throw Object.assign(new Error('Cần mô tả sản phẩm ít nhất 30 ký tự trước khi bán trên web'), { status: 400 });
      if (!merged.usage) throw Object.assign(new Error('Cần hướng dẫn sử dụng trước khi bán trên web'), { status: 400 });
    }

    values.slug = await uniqueSlug(slugify(req.body.slug || existing?.slug || product.name), product.id, t);
    values.updated_by = req.user.id;
    if (values.is_published && !existing?.is_published) values.published_at = new Date();

    const detail = existing
      ? await existing.update(values, { transaction: t })
      : await ProductDetail.create({ ...values, product_id: product.id }, { transaction: t });
    await t.commit();
    res.status(200).json({ message: values.is_published ? 'Đã lưu và mở bán trên web' : 'Đã lưu thông tin (chưa bán trên web)', data: detail });
  } catch (error) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Đường dẫn (slug) đã được dùng, vui lòng đổi' });
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });
  }
};

// 1b. Quản lý kho: lấy TẤT CẢ (mỹ phẩm + vật tư nội bộ) - chỉ ADMIN/GEN_MANAGER
const getProductsForAdmin = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Category, attributes: ['id', 'name'] }, { model: ProductDetail, attributes: ['slug', 'is_published'] }],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ data: products });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. Thêm Sản phẩm (Chỉ Admin)
const createProduct = async (req, res) => {
  try {
    const { name, type, price, weight, stock_quantity, category_id, start_date, end_date, image_url } = req.body;
    const newProduct = await Product.create({
      name, type, price, weight, stock_quantity, category_id, start_date, end_date, image_url // weight: dùng để tính phí GHN
    });
    res.status(201).json({ message: 'Thêm sản phẩm thành công', data: newProduct });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo sản phẩm', error: error.message });
  }
};

// 3. Cập nhật Sản phẩm
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await Product.update(req.body, { where: { id } });
    res.status(200).json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

// 4. Xóa Sản phẩm
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await Product.destroy({ where: { id } });
    res.status(200).json({ message: 'Xóa thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa', error: error.message });
  }
};

// 5. Trừ tồn kho (Gọi từ Booking Service khi Checkout)
const deductInventory = async (req, res) => {
  try {
    const { product_ids } = req.body; 
    if (!product_ids || product_ids.length === 0) return res.status(200).json({ message: 'Không có sản phẩm để trừ' });

    for (const id of product_ids) {
      const product = await Product.findByPk(id);
      if (product && product.stock_quantity > 0) {
        product.stock_quantity -= 1; // Mỗi món mua số lượng 1
        await product.save();
      }
    }
    res.status(200).json({ message: 'Đã trừ tồn kho thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi trừ tồn kho', error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const currentDate = new Date();
    
    const products = await Product.findAll({
      where: { 
        type: 'PRODUCT', // Chỉ lấy mỹ phẩm bán cho khách
        start_date: { [Op.lte]: currentDate },
        end_date: { [Op.gte]: currentDate }
      },
      attributes: {
        include: [
          // Tính điểm trung bình (AVG) và tổng số lượt đánh giá (COUNT)
          [sequelize.fn('COALESCE', sequelize.fn('AVG', sequelize.col('Reviews.rating')), 0), 'avg_rating'],
          [sequelize.fn('COUNT', sequelize.col('Reviews.id')), 'review_count']
        ]
      },
      include: [{ 
        model: Review, 
        attributes: [] // Không lấy chi tiết comment, chỉ dùng để aggregate
      }],
      group: ['Product.id'],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('[Lỗi tải sản phẩm]:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getProducts, getShopProducts, getShopProduct, getProductDetailAdmin, upsertProductDetail, slugify, getProductsForAdmin, createProduct, updateProduct, deleteProduct, deductInventory, getAllProducts };