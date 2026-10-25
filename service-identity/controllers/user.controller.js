// 1. ĐÃ SỬA: Import thêm 'sequelize' vào đây!
const { User, Profile, PatientProfile, sequelize } = require('../models');
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

const createQuickCustomer = async (req, res) => {
  try {
    const { email, full_name, phone, dob, gender } = req.body;
    if (!email || !full_name || !phone) {
       return res.status(400).json({ message: 'Vui lòng cung cấp đủ Email, Họ tên và SĐT' });
    }

    // Set mật khẩu mặc định là 12345
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('12345', salt);

    const result = await sequelize.transaction(async (t) => {
      // 1. Tạo Account
      const newUser = await User.create({ email, password_hash, role: 'CUSTOMER' }, { transaction: t });
      // 2. Tạo Profile định danh Account
      await Profile.create({ user_id: newUser.id, full_name, phone, dob, gender: gender || 'OTHER' }, { transaction: t });
      // 3. Tự động sinh PatientProfile "Bản thân"
      const patientProfile = await PatientProfile.create({
        user_id: newUser.id, full_name, relationship: 'Bản thân', phone, dob, gender: gender || 'OTHER'
      }, { transaction: t });

      return { userId: newUser.id, patientProfileId: patientProfile.id };
    });

    res.status(201).json({ message: 'Tạo khách hàng thành công', data: result });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
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

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: 'Email chưa được đăng ký trong hệ thống' });

    // Sinh Token ngẫu nhiên (Mã OTP 6 số để dễ nhập qua điện thoại)
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    
    user.reset_password_token = resetToken;
    user.reset_password_expires = Date.now() + 15 * 60 * 1000; // Token sống 15 phút
    await user.save();

    // TO-DO: Tích hợp thư viện Nodemailer gửi email chứa `resetToken` tại đây
    console.log(`[HỆ THỐNG] Mã OTP Reset Pass của ${email} là: ${resetToken}`);

    res.status(200).json({ message: 'Mã khôi phục đã được tạo (Xem log hệ thống). Vui lòng gửi email cho khách.' });
  } catch (error) { res.status(500).json({ message: 'Lỗi xử lý quên mật khẩu' }); }
};

const resetPassword = async (req, res) => {
  try {
    const { email, token, new_password } = req.body;
    const user = await User.findOne({ 
      where: { 
        email, 
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: Date.now() } // Kiểm tra còn hạn không
      } 
    });

    if (!user) return res.status(400).json({ message: 'Mã OTP không hợp lệ hoặc đã hết hạn' });

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    res.status(200).json({ message: 'Cập nhật mật khẩu mới thành công' });
  } catch (error) { res.status(500).json({ message: 'Lỗi cập nhật mật khẩu' }); }
};

const getDoctors = async (req, res) => {
  try {
    const doctors = await User.findAll({
      where: { 
        role: 'DOCTOR',
        status: 'ACTIVE' // Chỉ lấy Bác sĩ đang còn làm việc
      },
      attributes: ['id', 'email', 'role'], // CHỈ trả về thông tin công khai an toàn
      include: [
        { 
          model: Profile, 
          attributes: ['full_name', 'avatar'] // Chỉ lấy tên và avatar để hiển thị
        }
      ]
    });

    res.status(200).json({ data: doctors });
  } catch (error) {
    console.error("Lỗi lấy danh sách bác sĩ:", error);
    res.status(500).json({ message: 'Lỗi server nội bộ', error: error.message });
  }
};

// Lấy danh sách Khách hàng
const getCustomers = async (req, res) => {
  try {
    const customers = await User.findAll({
      where: { role: 'CUSTOMER' },
      attributes: ['id', 'email', 'status'], 
      include: [{ model: Profile, attributes: ['full_name', 'phone', 'dob'] }, { model: PatientProfile, as: 'PatientProfiles' }]
      
    });
    res.status(200).json({ data: customers });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const getCusProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'role', 'status'],
      include: [
        { model: Profile, attributes: ['full_name', 'phone', 'dob', 'gender', 'avatar'] },
        { model: PatientProfile, as: 'PatientProfiles' }
      ]
    });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    res.status(200).json({ data: user });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// Lấy danh sách Nhân sự nội bộ
const getEmployees = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: { [Op.ne]: 'CUSTOMER' } }, // Lấy tất cả trừ CUSTOMER
      attributes: ['id', 'email', 'role', 'status'], 
      include: [{ model: Profile, attributes: ['full_name', 'phone'] }]
    });
    res.status(200).json({ data: employees });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser, getDoctors, getCustomers, getEmployees, createQuickCustomer, forgotPassword, resetPassword, getCusProfile };