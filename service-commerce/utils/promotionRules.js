const { Op, col, literal } = require('sequelize');
const { Promotion, PromotionUsage, SavedPromotion } = require('../models');

const SCOPE_LABELS = {
  SPA_SERVICE: 'dịch vụ spa',
  PRODUCT: 'sản phẩm',
  TREATMENT_PACKAGE: 'gói liệu trình',
};

class PromotionError extends Error {}

// Kiểm tra 1 mã và tính số tiền giảm.
// order_value: tổng toàn bộ đơn; scope_values: tiền theo từng nhóm { SPA_SERVICE, PRODUCT, TREATMENT_PACKAGE }
// Mã có phạm vi riêng chỉ được tính trên phần tiền thuộc phạm vi đó.
const evaluatePromotion = async ({ code, order_value, scope_values = {}, customer_id, transaction }) => {
  if (!code) throw new PromotionError('Thiếu mã giảm giá');

  const promo = await Promotion.findOne({ where: { code: String(code).toUpperCase(), status: 'ACTIVE' }, transaction });
  if (!promo) throw new PromotionError('Mã không tồn tại hoặc đã bị khóa.');

  if (customer_id) {
    const isUsed = await PromotionUsage.findOne({ where: { customer_id, promotion_id: promo.id }, transaction });
    if (isUsed) throw new PromotionError('Khách hàng đã dùng mã này');
  }

  const now = new Date();
  if (promo.start_date && now < new Date(promo.start_date)) throw new PromotionError('Mã này chưa đến thời gian áp dụng.');
  if (promo.end_date && now > new Date(promo.end_date)) throw new PromotionError('Mã này đã hết hạn.');
  if (promo.usage_limit != null && Number(promo.used_count || 0) >= Number(promo.usage_limit)) {
    throw new PromotionError('Mã này đã hết lượt sử dụng.');
  }

  const base = promo.applicable_scope === 'ALL'
    ? Number(order_value || 0)
    : Number(scope_values[promo.applicable_scope] || 0);
  if (base <= 0) {
    throw new PromotionError(`Mã chỉ áp dụng cho ${SCOPE_LABELS[promo.applicable_scope]}, đơn hiện không có mục phù hợp.`);
  }

  const minOrderVal = Number(promo.min_order_value || 0);
  if (base < minOrderVal) {
    throw new PromotionError(`Đơn hàng tối thiểu ${minOrderVal.toLocaleString('vi-VN')}đ để áp dụng.`);
  }

  let discount = promo.discount_type === 'PERCENTAGE'
    ? (base * Number(promo.discount_value)) / 100
    : Number(promo.discount_value);
  if (promo.max_discount && discount > Number(promo.max_discount)) discount = Number(promo.max_discount);
  // Không giảm vượt quá phần tiền được áp mã
  discount = Math.round(Math.min(discount, base));

  return { promo, discount };
};

// Ghi nhận khách đã dùng mã (gọi trong transaction tạo đơn / chốt hóa đơn).
// Tăng used_count có điều kiện để 2 đơn đồng thời không vượt usage_limit.
const redeemPromotion = async ({ promo, customer_id, transaction }) => {
  const [affected] = await Promotion.update(
    { used_count: literal('used_count + 1') },
    {
      where: {
        id: promo.id,
        [Op.or]: [{ usage_limit: null }, { used_count: { [Op.lt]: col('usage_limit') } }],
      },
      transaction,
    }
  );
  if (affected === 0) throw new PromotionError('Mã này đã hết lượt sử dụng.');

  if (customer_id) {
    await PromotionUsage.create({ customer_id, promotion_id: promo.id }, { transaction });
    await SavedPromotion.destroy({ where: { customer_id, promotion_id: promo.id }, transaction });
  }
};

module.exports = { evaluatePromotion, redeemPromotion, PromotionError };
