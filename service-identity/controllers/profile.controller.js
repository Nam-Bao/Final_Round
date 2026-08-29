const { User, Profile } = require('../models');

const getMyProfile = async (req, res) => {
  try {
    // Lấy ID từ payload của token đã được giải mã ở middleware
    const userId = req.user.id;

    // Truy vấn Database: Tìm User và kết nối (JOIN) luôn với bảng Profile
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'role', 'status'], // Chỉ lấy các cột cần thiết, không lấy password_hash
      include: [{
        model: Profile,
        attributes: ['full_name', 'phone', 'dob', 'avatar']
      }]
    });

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Lỗi API Get Profile:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
};

module.exports = { getMyProfile };