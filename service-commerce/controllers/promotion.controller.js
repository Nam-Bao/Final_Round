const { Promotion, SavedPromotion, PromotionUsage } = require('../models');
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

// [PUBLIC] API Kiểm tra và tính toán giảm giá (Dùng khi checkout/áp mã)
exports.applyPromotion = async (req, res) => {
  try {
    // 1. [THÊM MỚI] Lấy thêm customer_id từ req.body
    const { code, order_value, customer_id } = req.body; 
    
    if (!code || order_value == null) {
      return res.status(400).json({ message: 'Thiếu mã code hoặc tổng đơn hàng' });
    }

    const promo = await Promotion.findOne({
      where: { code: code.toUpperCase(), status: 'ACTIVE' }
    });

    if (!promo) return res.status(400).json({ message: 'Mã không tồn tại hoặc đã bị khóa.' });

    // 2. [THÊM MỚI] Kiểm tra xem khách hàng này đã dùng mã chưa
    if (customer_id) {
      const isUsed = await PromotionUsage.findOne({ where: { customer_id, promotion_id: promo.id } });
      if (isUsed) {
        return res.status(400).json({ message: 'Bạn đã dùng mã này' });
      }
    }

    // --- TỪ ĐÂY TRỞ XUỐNG GIỮ NGUYÊN 100% LOGIC CŨ CỦA BẠN ---
    const now = new Date();
    if (promo.start_date && now < new Date(promo.start_date)) {
      return res.status(400).json({ message: 'Mã này chưa đến thời gian áp dụng.' });
    }
    if (promo.end_date && now > new Date(promo.end_date)) {
      return res.status(400).json({ message: 'Mã này đã hết hạn.' });
    }

    if (promo.usage_limit != null && Number(promo.used_count || 0) >= Number(promo.usage_limit)) {
      return res.status(400).json({ message: 'Mã này đã hết lượt sử dụng.' });
    }

    const minOrderVal = Number(promo.min_order_value || 0);
    if (Number(order_value) < minOrderVal) {
      return res.status(400).json({
        message: `Đơn hàng tối thiểu ${minOrderVal.toLocaleString('vi-VN')}đ để áp dụng.`
      });
    }

    // Tính toán số tiền được giảm
    let discount = 0;
    if (promo.discount_type === 'PERCENTAGE' || promo.discount_type === 'PERCENT') {
      discount = (Number(order_value) * Number(promo.discount_value)) / 100;
      if (promo.max_discount && discount > Number(promo.max_discount)) {
        discount = Number(promo.max_discount);
      }
    } else {
      discount = Number(promo.discount_value);
    }

    // Không cho phép giảm vượt quá tổng tiền đơn hàng
    if (discount > Number(order_value)) discount = Number(order_value);

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
    return res.status(500).json({ message: 'Lỗi xử lý khuyến mãi', error: error.message });
  }
};

exports.incrementUsage = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Thiếu mã code' });
    
    await Promotion.increment('used_count', { 
      by: 1, 
      where: { code: code.toUpperCase() } 
    });
    res.status(200).json({ message: 'Đã tăng lượt sử dụng voucher' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật lượt dùng voucher', error: error.message });
  }
};

// [PUBLIC] Khách hàng lưu mã khuyến mãi
exports.savePromotion = async (req, res) => {
  try {
    const { customer_id, promotion_id } = req.body;
    if (!customer_id || !promotion_id) return res.status(400).json({ message: 'Thiếu thông tin lưu mã' });

    // Kiểm tra xem đã lưu chưa
    const existing = await SavedPromotion.findOne({ where: { customer_id, promotion_id } });
    if (existing) return res.status(400).json({ message: 'Bạn đã lưu mã này rồi' });

    await SavedPromotion.create({ customer_id, promotion_id });
    return res.status(200).json({ success: true, message: 'Đã lưu mã thành công' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [PUBLIC] Lấy danh sách mã đã lưu của khách hàng
exports.getSavedPromotions = async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) return res.status(400).json({ message: 'Thiếu định danh khách hàng' });

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
    const { customer_id } = req.query;
    if (!customer_id) return res.status(400).json({ message: 'Thiếu định danh' });
    
    const used = await PromotionUsage.findAll({ where: { customer_id }, attributes: ['promotion_id'] });
    return res.status(200).json({ success: true, data: used.map(u => u.promotion_id) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};