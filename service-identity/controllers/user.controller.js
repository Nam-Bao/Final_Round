const { User, Profile } = require('../models');
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

// 1. API THÊM TÀI KHOẢN (Chỉ dành cho Admin tạo nhân viên)
const createUser = async (req, res) => {
  try {
    const { email, password, role, full_name, phone } = req.body;

    // Băm mật khẩu
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Dùng Transaction lưu vào 2 bảng
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
    res.status(500).json({ message: 'Lỗi khi tạo tài khoản', error: error.message });
  }
};

// 2. API SỬA TÀI KHOẢN
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status, full_name, phone } = req.body;

    await sequelize.transaction(async (t) => {
      // Cập nhật bảng User (Đổi chức vụ, đổi trạng thái)
      await User.update(
        { role, status },
        { where: { id }, transaction: t }
      );
      
      // Cập nhật bảng Profile (Đổi thông tin cá nhân)
      await Profile.update(
        { full_name, phone },
        { where: { user_id: id }, transaction: t }
      );
    });

    res.status(200).json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi cập nhật', error: error.message });
  }
};

// 3. API XÓA TÀI KHOẢN
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Chống tự sát: Không cho phép Admin tự xóa chính mình
    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ message: 'Bạn không thể tự xóa chính mình!' });
    }

    // Vì ta đã thiết lập khóa ngoại CASCADE ở Model, xóa User sẽ tự bay màu Profile
    await User.destroy({ where: { id } });
    
    res.status(200).json({ message: 'Đã xóa tài khoản vĩnh viễn' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi xóa tài khoản', error: error.message });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser };