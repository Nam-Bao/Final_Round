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
    const { name, type, price, stock_quantity, category_id } = req.body;
    const newProduct = await Product.create({ 
      name, type, price, stock_quantity, category_id 
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

module.exports = { getProducts, createProduct, updateProduct, deleteProduct };