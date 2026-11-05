const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Profile, PatientProfile, WalkInClaim, sequelize } = require('../models');
const { getSecret } = require('../middlewares/auth.middleware.js');

const MAX_CLAIM_ATTEMPTS = 5;

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

    // Khách đã khám tại quầy: đúng SĐT + mã CSKH cấp => tài khoản tạm thành tài khoản thật, giữ nguyên lịch khám và bệnh án
    const claimCode = String(req.body.claim_code || '').trim();
    if (claimCode) {
      const claim = await WalkInClaim.findOne({ where: { phone: String(phone || '').trim(), claimed_at: null } });
      if (!claim || claim.attempts >= MAX_CLAIM_ATTEMPTS || claim.code !== claimCode) {
        if (claim) await claim.increment('attempts');
        return res.status(400).json({ message: 'SĐT hoặc mã hồ sơ không đúng. Nếu nhập sai nhiều lần, vui lòng liên hệ CSKH để được cấp mã mới' });
      }
      await sequelize.transaction(async (t) => {
        const [count] = await WalkInClaim.update({ claimed_at: new Date() }, { where: { id: claim.id, claimed_at: null }, transaction: t });
        if (!count) throw new Error('Hồ sơ đã được liên kết');
        await User.update({ email, password_hash }, { where: { id: claim.user_id }, transaction: t });
      });
      return res.status(201).json({ message: 'Đăng ký thành công, đã liên kết hồ sơ khám tại phòng khám!', userId: claim.user_id, linked: true });
    }

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
    
    // Cùng 1 thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký
    const isMatch = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không chính xác' });
    }
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa hoặc ngừng hoạt động' });
    }

    const payload = {
      id: user.id,
      role: user.role
    };

    const token = jwt.sign(payload, getSecret(), { expiresIn: '8h' }); // Hết hạn sau 8 giờ (1 ca làm), sau đó phải đăng nhập lại

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
  console.error('[Login Error]:', error);
  return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi đăng nhập' });
  }
};

module.exports = { register, login };