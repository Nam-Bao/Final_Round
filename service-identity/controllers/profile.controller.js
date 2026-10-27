const { User, Profile, PatientProfile } = require('../models');

// Chuẩn hóa các trường có thể để trống: chuỗi rỗng / 'Invalid date' -> null.
// (Cột DATEONLY và ENUM của Postgres không nhận chuỗi rỗng => gây lỗi 500)
// Trường nào client không gửi (undefined) thì bỏ qua, giữ nguyên giá trị cũ.
const NULLABLE_FIELDS = ['phone', 'dob', 'gender'];
const buildProfileFields = (body, keys) => {
    const out = {};
    keys.forEach((k) => {
        const v = body[k];
        if (v === undefined) return;
        if (NULLABLE_FIELDS.includes(k) && (v === '' || v === 'Invalid date')) {
            out[k] = null;
        } else {
            out[k] = v;
        }
    });
    return out;
};

// [Giữ nguyên] API Lấy thông tin Tài khoản
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'role', 'status'], 
      include: [{
        model: Profile,
        attributes: ['full_name', 'phone', 'dob', 'gender', 'avatar']
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

const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const fields = buildProfileFields(req.body, ['full_name', 'phone', 'dob', 'gender']);

        // Cập nhật bảng Profile chính
        const profile = await Profile.findOne({ where: { user_id: userId } });
        if (profile) {
            await profile.update(fields);
        }

        // SỬA LỖI 1: Tự động đồng bộ thông tin sang PatientProfile "Bản thân"
        const selfPatient = await PatientProfile.findOne({ 
            where: { user_id: userId, relationship: 'Bản thân' } 
        });
        if (selfPatient) {
            await selfPatient.update(fields);
        }

        res.status(200).json({ message: 'Cập nhật tài khoản thành công', data: profile });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server khi cập nhật', error: error.message });
    }
};

// =====================================
// API QUẢN LÝ HỒ SƠ NGƯỜI BỆNH (PATIENT PROFILES)
// =====================================

// Lấy danh sách Hồ sơ người bệnh do Account này quản lý
const getMyPatientProfiles = async (req, res) => {
    try {
        const userId = req.user.id;
        const profiles = await PatientProfile.findAll({
            where: { user_id: userId },
            order: [['createdAt', 'ASC']] // Bản thân thường sẽ đứng đầu
        });
        res.status(200).json({ data: profiles });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách hồ sơ', error: error.message });
    }
};

// Thêm hồ sơ người thân mới
const createPatientProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, relationship, phone, dob, gender } = req.body;

        if (!full_name || !relationship) {
            return res.status(400).json({ message: 'Vui lòng nhập họ tên và mối quan hệ' });
        }

        const newProfile = await PatientProfile.create({
            user_id: userId,
            full_name,
            relationship,
            ...buildProfileFields({ phone, dob, gender }, ['phone', 'dob', 'gender'])
        });

        res.status(201).json({ message: 'Thêm hồ sơ người thân thành công', data: newProfile });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tạo hồ sơ mới', error: error.message });
    }
};

// Cập nhật thông tin hồ sơ
const updatePatientProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profileId = req.params.id;
        
        // Kiểm tra xem profile này có thuộc quyền sở hữu của User đang đăng nhập không
        const profile = await PatientProfile.findOne({ where: { id: profileId, user_id: userId }});
        if (!profile) {
            return res.status(403).json({ message: 'Không có quyền chỉnh sửa hồ sơ này' });
        }

        // Chỉ cho sửa các trường hợp lệ (không cho ghi đè user_id, id...)
        const fields = buildProfileFields(req.body, ['full_name', 'relationship', 'phone', 'dob', 'gender']);
        // Hồ sơ gốc "Bản thân" không được đổi mối quan hệ
        if (profile.relationship === 'Bản thân') delete fields.relationship;

        await profile.update(fields);
        res.status(200).json({ message: 'Cập nhật thành công', data: profile });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi cập nhật', error: error.message });
    }
};

const deletePatientProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profileId = req.params.id;
        
        const profile = await PatientProfile.findOne({ where: { id: profileId, user_id: userId }});
        if (!profile) return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });

        // Chặn không cho xóa thẻ Bản thân
        if (profile.relationship === 'Bản thân') {
            return res.status(400).json({ message: 'Không thể xóa hồ sơ gốc của tài khoản' });
        }

        await profile.destroy();
        res.status(200).json({ message: 'Xóa hồ sơ thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa hồ sơ' });
    }
};

const getPatientProfilesByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        const profiles = await PatientProfile.findAll({
            where: { user_id: userId },
            order: [['createdAt', 'ASC']]
        });
        res.status(200).json({ data: profiles });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};

module.exports = { getMyProfile, getMyPatientProfiles, createPatientProfile, updatePatientProfile, updateMyProfile, deletePatientProfile, getPatientProfilesByUserId };