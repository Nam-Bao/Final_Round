const { Category } = require('../models');

// 1. Lấy danh sách danh mục (Ai cũng xem được để mua hàng)
const getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({ order: [['id', 'DESC']] });
    res.status(200).json({ data: categories });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. Thêm danh mục mới (Chỉ Admin)
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const newCategory = await Category.create({ name, description, status: 'ACTIVE' });
    res.status(201).json({ message: 'Tạo danh mục thành công', data: newCategory });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo', error: error.message });
  }
};

// 3. Cập nhật danh mục (Chỉ Admin)
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    await Category.update({ name, description, status }, { where: { id } });
    res.status(200).json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

// 4. Xóa danh mục (Chỉ Admin)
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await Category.destroy({ where: { id } });
    res.status(200).json({ message: 'Xóa thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa', error: error.message });
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };