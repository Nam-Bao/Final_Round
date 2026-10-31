const { MedicalRecord, User, Profile, PatientProfile } = require('../models');
const { Op } = require('sequelize'); 
const dayjs = require('dayjs');

// 1. Lưu hồ sơ mới
const createMedicalRecord = async (req, res) => {
  try {
    // SỬA ĐỔI: Nhận patient_profile_id thay vì customer_id
    const { patient_profile_id, appointment_id, symptoms, diagnosis, doctor_notes, follow_up_date, pre_exam_images, post_exam_images } = req.body;
    // Bác sĩ tạo hồ sơ => doctor_id lấy từ token, không cho ghi danh bác sĩ khác. Quản lý tạo hộ thì lấy từ body.
    const doctor_id = req.user.role === 'DOCTOR' ? req.user.id : req.body.doctor_id;
    if (!patient_profile_id || !appointment_id) {
      return res.status(400).json({ message: 'Thiếu patient_profile_id hoặc appointment_id' });
    }

    const newRecord = await MedicalRecord.create({
      patient_profile_id, 
      doctor_id,
      appointment_id,
      symptoms,
      diagnosis,
      doctor_notes,
      follow_up_date,
      pre_exam_images: pre_exam_images || [], 
      post_exam_images: post_exam_images || []
    });

    res.status(201).json({ message: 'Tạo hồ sơ y tế thành công', data: newRecord });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo hồ sơ y tế', error: error.message });
  }
};

// 2. Lấy toàn bộ hồ sơ y tế của một Khách hàng (Nhân viên dùng)
const getCustomerMedicalHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const history = await MedicalRecord.findAll({
      where: { patient_profile_id: id },
      include: [
        { 
          model: User, 
          as: 'Doctor', 
          attributes: ['id', 'email'],
          include: [{ model: Profile, attributes: ['full_name'] }] 
        },
        {
          model: PatientProfile,
          as: 'Patient',
          attributes: ['full_name', 'phone', 'relationship']
        }
      ],
      order: [['exam_date', 'DESC']] 
    });

    res.status(200).json({ data: history });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy lịch sử y tế', error: error.message });
  }
};

// 3. Lấy danh sách Khách hàng có lịch tái khám sắp tới
const getUpcomingFollowUps = async (req, res) => {
  try {
    const today = dayjs().startOf('day').toDate();
    const threeDaysLater = dayjs().add(3, 'day').endOf('day').toDate();

    const followUps = await MedicalRecord.findAll({
      where: {
        follow_up_date: { [Op.between]: [today, threeDaysLater] }
      },
      include: [
        { 
          model: PatientProfile, 
          as: 'Patient', 
          attributes: ['id', 'user_id', 'full_name', 'phone'] // Chỉ lấy thông tin người bệnh cụ thể
        }
      ],
      order: [['follow_up_date', 'ASC']]
    });

    res.status(200).json({ data: followUps });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 4. Lấy hồ sơ y tế của TẤT CẢ Profile mà Account này quản lý (Cho màn hình "Hồ sơ của tôi")
const getMyMedicalRecords = async (req, res) => {
  try {
    const myAccountId = req.user.id;
    
    // Bước 1: Lấy tất cả PatientProfile thuộc Account này
    const myProfiles = await PatientProfile.findAll({
        where: { user_id: myAccountId },
        attributes: ['id']
    });
    
    // Rút trích mảng ID
    const profileIds = myProfiles.map(p => p.id);

    // Bước 2: Truy vấn MedicalRecords dựa trên tập ID này
    const history = await MedicalRecord.findAll({
      where: { patient_profile_id: { [Op.in]: profileIds } }, // In clause
      include: [
        {
          model: User,
          as: 'Doctor',
          attributes: ['id', 'email'],
          include: [{ model: Profile, attributes: ['full_name'] }]
        },
        {
          model: PatientProfile,
          as: 'Patient',
          attributes: ['full_name', 'relationship'] // Kèm theo tên để phân biệt khám cho ai
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ data: history });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy hồ sơ cá nhân', error: error.message });
  }
};

module.exports = { createMedicalRecord, getCustomerMedicalHistory, getUpcomingFollowUps, getMyMedicalRecords };