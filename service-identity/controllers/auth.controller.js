const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Profile, sequelize } = require('../models');

const register = async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body;

    // 1. Kiểm tra dữ liệu đầu vào
    if (!email || !password || !full_name) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ email, mật khẩu và họ tên' });
    }

    // 2. Kiểm tra email trùng lặp
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email này đã được sử dụng' });
    }

    // 3. Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 4. Lưu vào Database (Sử dụng Transaction để đảm bảo tính toàn vẹn)
    // Nếu tạo Profile lỗi thì User cũng sẽ bị hủy tạo (Rollback)
    const result = await sequelize.transaction(async (t) => {
      // Tạo User trước
      const newUser = await User.create({
        email,
        password_hash,
        role: 'CUSTOMER' // Mặc định đăng ký mới là Khách hàng
      }, { transaction: t });

      // Lấy ID của User vừa tạo để làm khóa ngoại cho Profile
      await Profile.create({
        user_id: newUser.id,
        full_name,
        phone
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
  try {
    const { email, password } = req.body;

    // 1. Kiểm tra đầu vào
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    // 2. Tìm user trong Database
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'Tài khoản không tồn tại' });
    }

    // 3. So sánh mật khẩu (mật khẩu người dùng nhập vs mật khẩu đã băm trong DB)
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Mật khẩu không chính xác' });
    }

    // 4. Tạo Payload (những thông tin công khai nhét vào trong Token)
    // Lưu ý: Tuyệt đối không nhét password vào đây!
    const payload = {
      id: user.id,
      role: user.role
    };

    // 5. Ký Token (Ký bằng một mã bí mật của Server, token có hạn 1 ngày)
    // Thực tế mã bí mật này nên để trong file .env
    const JWT_SECRET = 'O2O_SKINCARE_SECRET_KEY_2026'; 
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

    // 6. Trả về cho Client
    res.status(200).json({
      message: 'Đăng nhập thành công',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Lỗi API Login:', error);
    res.status(500).json({ message: 'Lỗi server nội bộ' });
  }
};

module.exports = { register, login };