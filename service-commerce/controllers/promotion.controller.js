const { sequelize, Promotion, SavedPromotion, PromotionUsage } = require('../models');
const { evaluatePromotion, redeemPromotion, PromotionError } = require('../utils/promotionRules');
const { Op } = require('sequelize');

// [PUBLIC] Lấy danh sách mã khuyến mãi đang hoạt động cho trang Khách hàng (/promotions)
exports.getActivePromotions = async (req, res) => {
  try {
    // Truy vấn tất cả mã có trạng thái ACTIVE
    const promos = await Promotion.findAll({
      where: {
        status: 'ACTIVE'
      },
      order: [['createdAt', 'DESC']]
    });

    const now = new Date();

    // Lọc an toàn bằng JavaScript thuần để tránh lỗi lệch múi giờ PostgreSQL
    const availablePromos = promos.filter((p) => {
      // 1. Kiểm tra ngày bắt đầu (nếu có)
      if (p.start_date && new Date(p.start_date) > now) {
        return false;
      }
      // 2. Kiểm tra ngày kết thúc (nếu có)
      if (p.end_date && new Date(p.end_date) < now) {
        return false;
      }
      // 3. Kiểm tra số lượng lượt dùng (nếu có giới hạn)
      if (p.usage_limit != null && Number(p.used_count || 0) >= Number(p.usage_limit)) {
        return false;
      }
      return true;
    });

    return res.status(200).json({
      success: true,
      data: availablePromos
    });
  } catch (error) {
    console.error('Lỗi lấy khuyến mãi:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi lấy danh sách khuyến mãi',
      error: error.message
    });
  }
};

// [ADMIN] Lấy toàn bộ mã khuyến mãi
exports.getAllPromotionsForAdmin = async (req, res) => {
  try {
    const promos = await Promotion.findAll({
      order: [['createdAt', 'DESC']]
    });
    return res.status(200).json({ data: promos });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [ADMIN] Tạo mã mới
exports.createPromotion = async (req, res) => {
  try {
    if (req.body.code) req.body.code = req.body.code.toUpperCase();

    const newPromo = await Promotion.create(req.body);
    return res.status(201).json({ message: 'Tạo mã khuyến mãi thành công', data: newPromo });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Mã Code này đã tồn tại!' });
    }
    return res.status(500).json({ message: 'Lỗi tạo mã', error: error.message });
  }
};

// [ADMIN] Cập nhật mã
exports.updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body.code) req.body.code = req.body.code.toUpperCase();

    const promo = await Promotion.findByPk(id);
    if (!promo) return res.status(404).json({ message: 'Không tìm thấy mã' });

    await promo.update(req.body);
    return res.status(200).json({ message: 'Cập nhật thành công', data: promo });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
  }
};

// [ADMIN] Ẩn mã khuyến mãi
exports.deletePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findByPk(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Không tìm thấy mã' });

    await promo.update({ status: 'HIDDEN' });
    return res.status(200).json({ message: 'Đã vô hiệu hóa mã' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi khi xóa', error: error.message });
  }
};

// Kiểm tra mã và tính số tiền giảm (chưa ghi nhận lượt dùng)
exports.applyPromotion = async (req, res) => {
  try {
    const { code, order_value, scope_values } = req.body;
    if (!code || order_value == null) {
      return res.status(400).json({ message: 'Thiếu mã code hoặc tổng đơn hàng' });
    }
    // Khách chỉ áp mã cho chính mình; nhân viên áp hộ thì truyền customer_id của khách
    const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : req.body.customer_id;

    const { promo, discount } = await evaluatePromotion({ code, order_value, scope_values, customer_id });
    return res.status(200).json({
      message: 'Áp dụng mã thành công',
      data: {
        promotion_id: promo.id,
        code: promo.code,
        discount_amount: discount,
        final_price: Number(order_value) - discount
      }
    });
  } catch (error) {
    if (error instanceof PromotionError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: 'Lỗi xử lý khuyến mãi', error: error.message });
  }
};

// [STAFF / service-booking] Kiểm tra lại mã và ghi nhận lượt dùng khi chốt hóa đơn tại quầy
exports.redeemPromotion = async (req, res) => {
  const { code, customer_id, order_value, scope_values } = req.body;
  if (!customer_id) return res.status(400).json({ message: 'Thiếu customer_id của khách' });

  const t = await sequelize.transaction();
  try {
    const { promo, discount } = await evaluatePromotion({ code, order_value, scope_values, customer_id, transaction: t });
    await redeemPromotion({ promo, customer_id, transaction: t });
    await t.commit();
    return res.status(200).json({ data: { promotion_id: promo.id, code: promo.code, discount_amount: discount } });
  } catch (error) {
    await t.rollback();
    if (error instanceof PromotionError) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: 'Lỗi ghi nhận voucher', error: error.message });
  }
};

// [CUSTOMER] Khách hàng lưu mã khuyến mãi
exports.savePromotion = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const { promotion_id } = req.body;
    if (!promotion_id) return res.status(400).json({ message: 'Thiếu thông tin lưu mã' });

    // Kiểm tra xem đã lưu chưa
    const existing = await SavedPromotion.findOne({ where: { customer_id, promotion_id } });
    if (existing) return res.status(400).json({ message: 'Bạn đã lưu mã này rồi' });

    await SavedPromotion.create({ customer_id, promotion_id });
    return res.status(200).json({ success: true, message: 'Đã lưu mã thành công' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [CUSTOMER] Lấy danh sách mã đã lưu của khách hàng
exports.getSavedPromotions = async (req, res) => {
  try {
    const customer_id = req.user.id;

    const saved = await SavedPromotion.findAll({
      where: { customer_id },
      attributes: ['promotion_id']
    });
    
    // Trả về mảng các promotion_id đã lưu
    const savedIds = saved.map(s => s.promotion_id);
    return res.status(200).json({ success: true, data: savedIds });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUsedPromotions = async (req, res) => {
  try {
    const customer_id = req.user.id;

    const used = await PromotionUsage.findAll({ where: { customer_id }, attributes: ['promotion_id'] });
    return res.status(200).json({ success: true, data: used.map(u => u.promotion_id) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};