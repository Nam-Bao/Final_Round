const { Promotion } = require('../models');
const { Op } = require('sequelize');

// [ADMIN] Lấy toàn bộ mã khuyến mãi
exports.getAllPromotionsForAdmin = async (req, res) => {
  try {
    const promos = await Promotion.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json({ data: promos });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// [ADMIN] Tạo mã mới
exports.createPromotion = async (req, res) => {
  try {
    // Đảm bảo mã luôn in hoa để dễ check
    if (req.body.code) req.body.code = req.body.code.toUpperCase();
    
    const newPromo = await Promotion.create(req.body);
    res.status(201).json({ message: 'Tạo mã khuyến mãi thành công', data: newPromo });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Mã Code này đã tồn tại!' });
    }
    res.status(500).json({ message: 'Lỗi tạo mã', error: error.message });
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
    res.status(200).json({ message: 'Cập nhật thành công', data: promo });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
  }
};

// [ADMIN] Ẩn mã khuyến mãi
exports.deletePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findByPk(req.params.id);
    if (!promo) return res.status(404).json({ message: 'Không tìm thấy mã' });

    await promo.update({ status: 'HIDDEN' });
    res.status(200).json({ message: 'Đã vô hiệu hóa mã' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa', error: error.message });
  }
};

// [PUBLIC] API Kiểm tra và tính toán giảm giá (Dùng cho lúc thanh toán)
exports.applyPromotion = async (req, res) => {
  try {
    const { code, order_value } = req.body;
    if (!code || order_value == null) {
      return res.status(400).json({ message: 'Thiếu mã code hoặc tổng đơn hàng' });
    }

    const promo = await Promotion.findOne({ 
      where: { code: code.toUpperCase(), status: 'ACTIVE' } 
    });

    if (!promo) return res.status(400).json({ message: 'Mã không tồn tại hoặc đã bị khóa.' });

    const now = new Date();
    if (now < promo.start_date) return res.status(400).json({ message: 'Mã này chưa đến thời gian áp dụng.' });
    if (now > promo.end_date) return res.status(400).json({ message: 'Mã này đã hết hạn.' });

    if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
      return res.status(400).json({ message: 'Mã này đã hết lượt sử dụng.' });
    }

    if (order_value < promo.min_order_value) {
      return res.status(400).json({ message: `Đơn hàng tối thiểu ${Number(promo.min_order_value).toLocaleString('vi-VN')}đ để áp dụng.` });
    }

    // Tính toán số tiền được giảm
    let discount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      discount = (order_value * Number(promo.discount_value)) / 100;
      if (promo.max_discount && discount > Number(promo.max_discount)) {
        discount = Number(promo.max_discount);
      }
    } else {
      discount = Number(promo.discount_value);
    }

    // Không cho phép giảm quá tổng tiền đơn hàng
    if (discount > order_value) discount = order_value;

    res.status(200).json({
      message: 'Áp dụng mã thành công',
      data: {
        promotion_id: promo.id,
        discount_amount: discount,
        final_price: order_value - discount
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Lỗi xử lý khuyến mãi', error: error.message });
  }
};