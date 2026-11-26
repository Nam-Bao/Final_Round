const { sequelize, Product, ProductDetail, Category, Review, Order, OrderDetail, OrderReturn } = require('../models');
const { Op } = require('sequelize'); // getAllProducts dùng Op/sequelize/Review (trước đây thiếu import)
const { getRatingStats } = require('./review.controller');
const { SALE_FIELDS, withOnlinePrice } = require('../utils/pricing');
const { CONCERNS, sanitizeConcerns } = require('../utils/concerns');
const { takeStock, lotsByProduct } = require('../utils/stockLots');
const { MaterialSpec } = require('../models');

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

// Nhãn "MỚI": chỉ NEW_LIMIT sản phẩm mở bán trên web gần nhất (theo published_at)
const NEW_LIMIT = 10;
const getNewProductIds = async () => {
  const rows = await ProductDetail.findAll({
    where: { is_published: true, published_at: { [Op.ne]: null } },
    include: [{ model: Product, attributes: [], where: { type: 'PRODUCT' } }],
    attributes: ['product_id'], order: [['published_at', 'DESC']], limit: NEW_LIMIT, raw: true,
  });
  return new Set(rows.map((r) => r.product_id));
};

// Cửa hàng web: kèm giá khuyến mãi online đang chạy (price = giá khách trả, original_price = giá niêm yết)
// Thời hạn sử dụng (tháng) theo lô đang bán: khách chỉ thấy "N tháng kể từ ngày sản xuất", không thấy số lô / ngày cụ thể
const shelfLifeOf = (lots) => {
  const lot = (lots || []).find((l) => l.sellable && l.manufacture_date);
  if (!lot) return null;
  const months = Math.round((new Date(lot.expiry_date) - new Date(lot.manufacture_date)) / (30.44 * 86400000));
  return months > 0 ? months : null;
};
const withoutOldDates = ({ start_date, end_date, ...rest }) => rest;
const withShopStats = (product, ratingStats, soldStats, newIds, lots = {}) => ({
  ...withoutOldDates(withOnlinePrice(product.toJSON())),
  shelf_life_months: shelfLifeOf(lots[product.id]),
  is_new: newIds.has(product.id),
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
      // is_prescription: NVBH ẩn thuốc kê đơn khi tạo đơn tại quầy (bác sĩ vẫn thấy để kê)
      include: [{ model: Category, attributes: ['id', 'name'] }, { model: ProductDetail, attributes: ['is_prescription'], required: false }],
      order: [['createdAt', 'DESC']]
    });
    // Điểm đánh giá thật từ bảng Reviews và số đã bán từ các đơn đã giao (trang shop hiển thị)
    const [ratingStats, soldStats] = await Promise.all([getRatingStats(), getSoldStats()]);
    const data = products.map((p) => {
      const { ProductDetail: detail, start_date, end_date, ...rest } = withStats(p, ratingStats, soldStats);
      return { ...rest, is_prescription: !!detail?.is_prescription };
    });
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// ==========================================
// CỬA HÀNG WEB: chỉ sản phẩm đã được bật "Bán trên web" (ProductDetail.is_published).
// Thuốc kê đơn không hiện công khai: chỉ bác sĩ kê trong lịch khám và bán tại quầy theo đơn
// ==========================================
const SKIN_TYPES = ['Mọi loại da', 'Da thường', 'Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da mụn'];
const SHOP_DETAIL_FIELDS = ['slug', 'brand', 'origin', 'capacity', 'skin_types', 'short_description', 'is_prescription', 'published_at', ...SALE_FIELDS];

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
        // Thuốc kê đơn vẫn hiện (khách tra cứu được) nhưng không mua online: nút "Tư vấn ngay" dẫn tới đặt lịch khám; giỏ hàng / đặt hàng chặn ở server
        { model: ProductDetail, where: { is_published: true }, attributes: SHOP_DETAIL_FIELDS }
      ],
      order: [['createdAt', 'DESC']]
    });
    const [ratingStats, soldStats, newIds, lots] = await Promise.all([getRatingStats(), getSoldStats(), getNewProductIds(), lotsByProduct(products.map((p) => p.id))]);
    res.status(200).json({ data: products.map((p) => withShopStats(p, ratingStats, soldStats, newIds, lots)) });
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
    const [ratingStats, soldStats, newIds, lots] = await Promise.all([getRatingStats([product.id]), getSoldStats([product.id]), getNewProductIds(), lotsByProduct([product.id])]);
    res.status(200).json({ data: withShopStats(product, ratingStats, soldStats, newIds, lots) });
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
      slug: await uniqueSlug(slugify(product.name), product.id), is_published: false, skin_types: [], concerns: []
    };
    res.status(200).json({ data: detail, skin_type_options: SKIN_TYPES, concern_options: CONCERNS });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Khuyến mãi online theo % (1 - 90): bỏ trống sale_percent = tắt. Có % thì bắt buộc ngày kết thúc (mỗi đợt tối đa 180 ngày).
const MAX_SALE_DAYS = 180;
const parseSale = (body) => {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (body.sale_percent === null || body.sale_percent === '' || body.sale_percent === undefined) {
    return { sale_percent: null, sale_start: null, sale_end: null };
  }
  const percent = Number(body.sale_percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw bad('Mức giảm phải là số nguyên từ 1% đến 90%');
  const start = body.sale_start ? new Date(body.sale_start) : new Date();
  const end = new Date(body.sale_end);
  if (Number.isNaN(start.getTime())) throw bad('Ngày bắt đầu khuyến mãi không hợp lệ');
  if (!body.sale_end || Number.isNaN(end.getTime())) throw bad('Cần ngày kết thúc khuyến mãi');
  if (end <= start) throw bad('Ngày kết thúc phải sau ngày bắt đầu');
  if (end <= new Date()) throw bad('Ngày kết thúc khuyến mãi đã qua');
  if (end - start > MAX_SALE_DAYS * 86400000) throw bad(`Mỗi đợt khuyến mãi tối đa ${MAX_SALE_DAYS} ngày`);
  return { sale_percent: percent, sale_start: start, sale_end: end };
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
    if ('concerns' in req.body) values.concerns = sanitizeConcerns(req.body.concerns);
    values.is_published = 'is_published' in req.body ? req.body.is_published === true : Boolean(existing?.is_published);
    if ('is_prescription' in req.body) values.is_prescription = req.body.is_prescription === true;
    if ('sale_percent' in req.body) Object.assign(values, parseSale(req.body));
    // Thuốc kê đơn không được khuyến mãi
    if (values.is_prescription ?? existing?.is_prescription) {
      if (values.sale_percent) throw Object.assign(new Error('Thuốc kê đơn không được đặt khuyến mãi'), { status: 400 });
      Object.assign(values, { sale_percent: null, sale_start: null, sale_end: null });
    }
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
// Kèm các lô còn hàng: lô đang bán (xuất trước, dùng chung cho bán web và bán tại quầy), lô chờ hủy (hết hạn), tồn tối thiểu
const getProductsForAdmin = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Category, attributes: ['id', 'name'] }, { model: ProductDetail, attributes: ['slug', 'is_published', ...SALE_FIELDS] }, { model: MaterialSpec, attributes: ['min_stock', 'unit'] }],
      order: [['createdAt', 'DESC']]
    });
    const lots = await lotsByProduct(products.map((p) => p.id));
    res.status(200).json({ data: products.map((p) => {
      const list = lots[p.id] || [];
      const rest = withoutOldDates(p.toJSON());
      return {
        ...rest, lots: list, selling_lot: list.find((l) => l.sellable) || null,
        held_qty: list.filter((l) => l.hold_reason).reduce((sum, l) => sum + l.quantity_left, 0), min_stock: p.MaterialSpec?.min_stock ?? 0,
      };
    }) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. Thêm Sản phẩm (Chỉ Admin)
// Tồn kho, NSX, HSD không nhập ở đây: hàng vào kho qua Nhập hàng (biên bản nhận hàng ghi số lô, NSX, HSD)
const EDITABLE = ['name', 'price', 'weight', 'category_id', 'image_url'];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));
const saveMinStock = async (productId, body) => {
  if (!('min_stock' in body) || body.min_stock === null || body.min_stock === undefined) return;
  const n = Number(body.min_stock);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw Object.assign(new Error('Tồn tối thiểu phải là số nguyên từ 0'), { status: 400 });
  const spec = await MaterialSpec.findOne({ where: { product_id: productId } });
  if (spec) await spec.update({ min_stock: n });
  else await MaterialSpec.create({ product_id: productId, unit: 'sản phẩm', pack_size: 1, pack_label: '1 sản phẩm', min_stock: n });
};
const createProduct = async (req, res) => {
  try {
    const type = req.body.type === 'MATERIAL' ? 'MATERIAL' : 'PRODUCT';
    const newProduct = await Product.create({ ...pick(req.body), type, stock_quantity: 0 }); // weight: dùng để tính phí GHN
    await saveMinStock(newProduct.id, req.body);
    res.status(201).json({ message: 'Đã thêm sản phẩm. Hàng vào kho qua Nhập hàng (ghi số lô, NSX, HSD khi nhận hàng)', data: newProduct });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo sản phẩm', error: error.message });
  }
};

// 3. Cập nhật Sản phẩm
// Không sửa thẳng tồn kho / NSX / HSD: tồn kho chỉ đổi qua nhập hàng, bán, trả hàng, kiểm kho
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(String(id))) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    const product = await Product.findByPk(id);
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    const values = pick(req.body);
    if (req.body.type && req.body.type !== product.type) {
      if (product.stock_quantity > 0) return res.status(409).json({ message: 'Còn hàng trong kho, không đổi được phân loại sản phẩm / vật tư' });
      values.type = req.body.type === 'MATERIAL' ? 'MATERIAL' : 'PRODUCT';
    }
    await product.update(values);
    await saveMinStock(product.id, req.body);
    res.status(200).json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi khi cập nhật', error: error.message });
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
      // Mỗi món số lượng 1; trừ theo lô hết hạn trước bán trước. Hết hàng thì bỏ qua như trước
      await sequelize.transaction(async (t) => {
        const product = await Product.findByPk(id, { transaction: t });
        if (product && product.stock_quantity > 0) await takeStock(product, 1, t).catch((e) => { if (!e.status) throw e; });
      });
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

// [STAFF] GET /products/safety-info?ids=a,b — thành phần của các sản phẩm được kê
const getProductSafetyInfo = async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').filter((id) => UUID_RE.test(id)).slice(0, 50);
    const rows = await Product.findAll({ where: { id: ids }, attributes: ['id', 'name'], include: [{ model: ProductDetail, attributes: ['ingredients', 'warnings', 'concerns'] }] });
    return res.status(200).json({ data: rows.map((p) => ({ id: p.id, name: p.name, ingredients: p.ProductDetail?.ingredients || '', warnings: p.ProductDetail?.warnings || '', concerns: p.ProductDetail?.concerns || [] })) });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [STAFF] GET /products/safety-catalog — sản phẩm còn hàng, có bảng thành phần: chọn sản phẩm thay thế theo quy tắc, xem trước từ khóa quy tắc.
// Trả ĐỦ bảng thành phần (hoạt chất có thể nằm cuối danh sách, VD Salicylic Acid của Effaclar Duo+M ở ký tự thứ 700)
const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const getSafetyCatalog = async (req, res) => {
  try {
    const rows = await Product.findAll({
      where: { type: 'PRODUCT', stock_quantity: { [Op.gt]: 0 } }, attributes: ['id', 'name', 'price'],
      include: [{ model: ProductDetail, required: true, attributes: ['ingredients', 'warnings', 'benefits', 'short_description', 'skin_types', 'concerns', 'is_prescription'], where: { ingredients: { [Op.ne]: '' } } }],
      order: [['name', 'ASC']], limit: 200,
    });
    return res.status(200).json({
      data: rows.map((p) => ({
        id: p.id, name: p.name, price: Number(p.price), prescription: !!p.ProductDetail.is_prescription,
        ingredients: clip(p.ProductDetail.ingredients, 3000), benefits: clip(p.ProductDetail.benefits || p.ProductDetail.short_description, 300),
        warnings: clip(p.ProductDetail.warnings, 300), skin_types: p.ProductDetail.skin_types || [], concerns: p.ProductDetail.concerns || [],
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Danh mục cho AI gợi ý sản phẩm sau khi soi da: chỉ mỹ phẩm đang bán trên web, còn hàng, không phải thuốc kê đơn.
// Công khai vì đều là thông tin đã hiện ở trang sản phẩm.
const getAdviceCatalog = async (req, res) => {
  try {
    const rows = await Product.findAll({
      where: { type: 'PRODUCT', stock_quantity: { [Op.gt]: 0 } }, attributes: ['id', 'name', 'price', 'image_url'],
      include: [{ model: ProductDetail, required: true, where: { is_published: true, is_prescription: false },
        attributes: ['slug', 'ingredients', 'benefits', 'short_description', 'skin_types', 'concerns', ...SALE_FIELDS] }],
      order: [['name', 'ASC']], limit: 120,
    });
    return res.status(200).json({
      data: rows.map((row) => {
        const p = withOnlinePrice(row.toJSON());
        let images = p.image_url;
        try { if (typeof images === 'string') images = JSON.parse(images); } catch { /* 1 URL */ }
        const image = Array.isArray(images) ? images[0] : images;
        return {
          id: p.id, name: p.name, slug: p.ProductDetail.slug || p.id, price: Number(p.price), image: image || null,
          skin_types: p.ProductDetail.skin_types || [], concerns: p.ProductDetail.concerns || [],
          benefits: clip(p.ProductDetail.benefits || p.ProductDetail.short_description, 200),
          ingredients: clip(p.ProductDetail.ingredients, 250),
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getAdviceCatalog, getSafetyCatalog, getProductSafetyInfo, getProducts, getShopProducts, getShopProduct, getProductDetailAdmin, upsertProductDetail, slugify, getProductsForAdmin, createProduct, updateProduct, deleteProduct, deductInventory, getAllProducts };