const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Profile, PatientProfile, sequelize } = require('../models');

const register = async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ email, mật khẩu và họ tên' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await sequelize.transaction(async (t) => {
      // 1. Tạo User Account
      const newUser = await User.create({
        email,
        password_hash,
        role: 'CUSTOMER' 
      }, { transaction: t });

      // 2. Vẫn tạo Profile (Để dùng chung cho cấu trúc hệ thống nếu cần - ví dụ chứa Avatar tài khoản)
      await Profile.create({
        user_id: newUser.id,
        full_name,
        phone
      }, { transaction: t });

      // 3. THÊM MỚI: Tự động tạo 1 PatientProfile Mặc định (Bản thân) cho khách hàng này
      await PatientProfile.create({
        user_id: newUser.id,
        full_name: full_name,
        phone: phone,
        relationship: 'Bản thân'
      }, { transaction: t });

      return newUser;
    });

    res.status(201).json({ 
      message: 'Đăng ký tài khoản thành công!', 
      userId: result.id 
    });

  } catch (error) {
    console.error('Lỗi API Register:', error);
    res.status(500).json({ message: 'Lỗi server nội bộ' });
  }
};

const login = async (req, res) => {
  // [Toàn bộ logic hàm Login giữ nguyên như cũ của bạn]
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    const user = await User.findOne({ 
      where: { email },
      include: [
        { model: Profile } 
      ] 
    });
    
    if (!user) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Mật khẩu không chính xác' });
    }

    const payload = {
      id: user.id,
      role: user.role
    };

    const JWT_SECRET = process.env.JWT_SECRET;
    // Hết hạn sau 8 giờ (1 ca làm), sau đó phải đăng nhập lại
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.status(200).json({
      message: 'Đăng nhập thành công',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        Profile: user.Profile 
      }
    });

  } catch (error) {
  console.error('[Register Error]:', error);
  return res.status(500).json({ 
    success: false, 
    message: 'Lỗi hệ thống khi đăng ký', 
    error: error.message 
  });
  }
};

module.exports = { register, login };