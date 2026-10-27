const { Product, Category } = require('../models');

// 1. Lấy danh sách Sản phẩm (Kèm theo thông tin Danh mục)
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Category, attributes: ['id', 'name'] }],
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
    const { name, type, price, stock_quantity, category_id, start_date, end_date, image_url } = req.body;
    const newProduct = await Product.create({ 
      name, type, price, stock_quantity, category_id, start_date, end_date, image_url 
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

module.exports = { getProducts, createProduct, updateProduct, deleteProduct, deductInventory, getAllProducts };