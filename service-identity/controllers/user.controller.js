const { User, Profile } = require('../models');

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

module.exports = { getAllUsers };