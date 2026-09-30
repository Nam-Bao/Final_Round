// 1. ĐÃ SỬA: Import thêm 'sequelize' vào đây!
const { User, Profile, sequelize } = require('../models');
const bcrypt = require('bcryptjs');

const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'role', 'status'],
      include: [{
        model: Profile,
        attributes: ['full_name', 'phone']
      }]
    });

    res.status(200).json({
      message: 'Lấy danh sách người dùng thành công',
      total: users.length,
      data: users
    });
  } catch (error) {
    console.error('Lỗi API GetAllUsers:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

const createUser = async (req, res) => {
  try {
    const { email, password, role, full_name, phone } = req.body;

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await sequelize.transaction(async (t) => {
      const newUser = await User.create(
        { email, password_hash, role }, 
        { transaction: t }
      );
      await Profile.create(
        { user_id: newUser.id, full_name, phone }, 
        { transaction: t }
      );
      return newUser;
    });

    res.status(201).json({ message: 'Tạo tài khoản nhân viên thành công' });
  } catch (error) {
    // 2. ĐÃ SỬA: Thêm dòng console.error để nếu lỗi sẽ in ra Terminal màu đỏ!
    console.error("LỖI TẠO USER:", error);
    res.status(500).json({ message: 'Lỗi khi tạo tài khoản', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, full_name, phone } = req.body;

    await sequelize.transaction(async (t) => {
      await User.update(
        { role, status },
        { where: { id }, transaction: t }
      );
      await Profile.update(
        { full_name, phone },
        { where: { user_id: id }, transaction: t }
      );
    });

    res.status(200).json({ message: 'Cập nhật thành công' });
  } catch (error) {
    console.error("LỖI CẬP NHẬT USER:", error);
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 3. ĐÃ SỬA: ID là UUID (chuỗi), nên không dùng parseInt nữa, chỉ so sánh thẳng chuỗi
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ message: 'Bạn không thể tự xóa chính mình!' });
    }

    await User.destroy({ where: { id } });
    res.status(200).json({ message: 'Đã xóa tài khoản vĩnh viễn' });
  } catch (error) {
    console.error("LỖI XÓA USER:", error);
    res.status(500).json({ message: 'Lỗi khi xóa tài khoản', error: error.message });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser };