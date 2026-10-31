const { Cart, CartItem, Product } = require('../models');

// Tìm món trong giỏ và đảm bảo nó thuộc giỏ của khách đang đăng nhập
const findOwnCartItem = (item_id, customer_id) =>
  CartItem.findOne({
    where: { id: item_id },
    include: [Product, { model: Cart, where: { customer_id }, attributes: [] }]
  });

// 1. Lấy giỏ hàng của user (Tạo mới nếu chưa có)
exports.getCart = async (req, res) => {
  const customer_id = req.user.id;
  try {
    let cart = await Cart.findOne({ where: { customer_id } });
    if (!cart) {
      cart = await Cart.create({ customer_id });
    }
    const cartItems = await CartItem.findAll({
      where: { cart_id: cart.id },
      include: [{ model: Product, attributes: ['id', 'name', 'price', 'image_url', 'stock_quantity', 'weight'] }],
      order: [['createdAt', 'DESC']]
    });
    return res.status(200).json({ success: true, data: { cart_id: cart.id, items: cartItems } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Thêm sản phẩm vào giỏ
exports.addToCart = async (req, res) => {
  const customer_id = req.user.id;
  const { product_id, quantity = 1 } = req.body;
  try {
    let cart = await Cart.findOne({ where: { customer_id } });
    if (!cart) cart = await Cart.create({ customer_id });

    // Kiểm tra tồn kho
    const product = await Product.findByPk(product_id);
    if (!product || product.stock_quantity < quantity) {
      return res.status(400).json({ success: false, message: 'Sản phẩm không đủ số lượng' });
    }

    let cartItem = await CartItem.findOne({ where: { cart_id: cart.id, product_id } });
    if (cartItem) {
      // Nếu đã có trong giỏ, cộng dồn số lượng
      cartItem.quantity += parseInt(quantity);
      if (cartItem.quantity > product.stock_quantity) {
         return res.status(400).json({ success: false, message: 'Vượt quá số lượng tồn kho' });
      }
      await cartItem.save();
    } else {
      // Nếu chưa có, tạo mới
      cartItem = await CartItem.create({ cart_id: cart.id, product_id, quantity });
    }
    return res.status(200).json({ success: true, message: 'Đã thêm vào giỏ hàng' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. Cập nhật số lượng (+ / -)
exports.updateCartItem = async (req, res) => {
  const { item_id } = req.params;
  const { quantity } = req.body;
  try {
    const cartItem = await findOwnCartItem(item_id, req.user.id);
    if (!cartItem) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' });

    if (quantity <= 0) {
      await cartItem.destroy();
      return res.status(200).json({ success: true, message: 'Đã xóa sản phẩm khỏi giỏ' });
    }

    if (quantity > cartItem.Product.stock_quantity) {
      return res.status(400).json({ success: false, message: 'Vượt quá số lượng tồn kho' });
    }

    cartItem.quantity = quantity;
    await cartItem.save();
    return res.status(200).json({ success: true, message: 'Đã cập nhật số lượng' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Xóa sản phẩm khỏi giỏ
exports.removeFromCart = async (req, res) => {
  const { item_id } = req.params;
  try {
    const cartItem = await findOwnCartItem(item_id, req.user.id);
    if (!cartItem) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm trong giỏ' });
    await cartItem.destroy();
    return res.status(200).json({ success: true, message: 'Đã xóa sản phẩm' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};