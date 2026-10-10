const { MedicalRecord, User, Profile } = require('../models');
const { Op } = require('sequelize'); const dayjs = require('dayjs');

// 1. API: Lưu hồ sơ mới (Được gọi tự động khi Bác sĩ hoàn tất khám)
const createMedicalRecord = async (req, res) => {
  try {
    const { customer_id, doctor_id, appointment_id, symptoms, diagnosis, doctor_notes, follow_up_date } = req.body;

    const newRecord = await MedicalRecord.create({
      customer_id,
      doctor_id,
      appointment_id,
      symptoms,
      diagnosis,
      doctor_notes,
      follow_up_date
    });

    res.status(201).json({ message: 'Tạo hồ sơ y tế thành công', data: newRecord });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo hồ sơ y tế', error: error.message });
  }
};

// 2. API: Lấy toàn bộ hồ sơ y tế của một Khách hàng (Dành cho trang Quản lý hồ sơ)
const getCustomerMedicalHistory = async (req, res) => {
  try {
    const { customerId } = req.params;

    const history = await MedicalRecord.findAll({
      where: { customer_id: customerId },
      include: [
        { 
          model: User, 
          as: 'Doctor', 
          attributes: ['id', 'email'],
          include: [{ model: Profile, attributes: ['full_name'] }] // Lấy kèm tên Bác sĩ khám
        }
      ],
      order: [['exam_date', 'DESC']] // Sắp xếp ngày khám mới nhất lên đầu
    });

    res.status(200).json({ data: history });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy lịch sử y tế', error: error.message });
  }
};

// --- Lấy danh sách Khách hàng có lịch tái khám sắp tới ---
const getUpcomingFollowUps = async (req, res) => {
  try {
    const today = dayjs().startOf('day').toDate();
    const threeDaysLater = dayjs().add(3, 'day').endOf('day').toDate();

    const followUps = await MedicalRecord.findAll({
      where: {
        follow_up_date: { [Op.between]: [today, threeDaysLater] }
      },
      include: [{ model: User, as: 'Customer', include: [{ model: Profile }] }],
      order: [['follow_up_date', 'ASC']]
    });

    res.status(200).json({ data: followUps });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { createMedicalRecord, getCustomerMedicalHistory, getUpcomingFollowUps };