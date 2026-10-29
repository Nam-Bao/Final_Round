const axios = require('axios');
const { sequelize, Review, Order, OrderDetail } = require('../models');

// "Nguyễn Văn An" -> "Nguyễn V. A." (che bớt tên thật khi hiển thị công khai)
const maskName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Khách hàng';
  if (parts.length === 1) return `${parts[0].charAt(0)}***`;
  return [parts[0], ...parts.slice(1).map(p => `${p.charAt(0).toUpperCase()}.`)].join(' ');
};

// Điểm trung bình & số lượt đánh giá thật của các sản phẩm: { [product_id]: { avg_rating, review_count } }
exports.getRatingStats = async (productIds) => {
  const rows = await Review.findAll({
    where: { status: 'VISIBLE', ...(productIds ? { product_id: productIds } : {}) },
    attributes: [
      'product_id',
      [sequelize.fn('AVG', sequelize.col('rating')), 'avg_rating'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'review_count']
    ],
    group: ['product_id'],
    raw: true
  });
  const stats = {};
  rows.forEach(r => {
    stats[r.product_id] = { avg_rating: Number(Number(r.avg_rating).toFixed(1)), review_count: Number(r.review_count) };
  });
  return stats;
};

// [PUBLIC] GET /reviews/product/:productId
exports.getProductReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { product_id: req.params.productId, status: 'VISIBLE' },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    const stats = (await exports.getRatingStats([req.params.productId]))[req.params.productId] || { avg_rating: 0, review_count: 0 };
    return res.status(200).json({
      success: true,
      data: {
        ...stats,
        reviews: reviews.map(r => ({
          id: r.id,
          customer_name: maskName(r.customer_name),
          rating: r.rating,
          comment: r.comment || '',
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [CUSTOMER] GET /reviews/mine — các sản phẩm (theo đơn) mình đã đánh giá
exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { customer_id: req.user.id },
      attributes: ['id', 'order_id', 'product_id', 'rating', 'comment', 'createdAt']
    });
    return res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// [CUSTOMER] POST /reviews — chỉ đánh giá sản phẩm trong đơn của chính mình và đơn đã giao xong
exports.createReview = async (req, res) => {
  try {
    const { order_id, product_id, comment } = req.body;
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Số sao phải từ 1 đến 5' });
    }
    if (comment && String(comment).length > 1000) {
      return res.status(400).json({ message: 'Nhận xét tối đa 1000 ký tự' });
    }

    const order = await Order.findOne({ where: { id: order_id, customer_id: req.user.id } });
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng của bạn' });
    if (order.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Chỉ đánh giá được sau khi đã nhận hàng' });
    }
    const detail = await OrderDetail.findOne({ where: { order_id, product_id } });
    if (!detail) return res.status(400).json({ message: 'Sản phẩm này không có trong đơn hàng' });

    const existing = await Review.findOne({ where: { order_id, product_id } });
    if (existing) return res.status(400).json({ message: 'Bạn đã đánh giá sản phẩm này trong đơn hàng này rồi' });

    // Lấy tên thật của khách từ service-identity
    const profileRes = await axios.get('http://localhost:4000/api/identity/profile/me', {
      headers: { Authorization: req.headers.authorization }
    }).catch(() => null);

    const review = await Review.create({
      customer_id: req.user.id,
      order_id,
      product_id,
      customer_name: profileRes?.data?.Profile?.full_name || null,
      rating,
      comment: comment ? String(comment).trim() : null
    });
    return res.status(201).json({ success: true, message: 'Cảm ơn bạn đã đánh giá!', data: review });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
