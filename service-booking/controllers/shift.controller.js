const { WorkShift } = require('../models');
const { Op } = require('sequelize');

// 1. Lấy danh sách ca làm việc theo tuần/tháng
const getShifts = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let whereClause = {};
    
    // Nếu Frontend truyền lên khoảng thời gian, ta sẽ lọc
    if (startDate && endDate) {
      whereClause.date = { [Op.between]: [startDate, endDate] };
    }

    const shifts = await WorkShift.findAll({ where: whereClause });
    res.status(200).json({ data: shifts });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu ca làm', error: error.message });
  }
};

// 2. Thêm ca làm việc hàng loạt (Bulk Create)
const createShifts = async (req, res) => {
  try {
    const { employee_id, startDate, endDate, shift_types } = req.body;
    const payload = [];

    // Chuyển đổi ngày để lặp
    let currDate = new Date(startDate);
    const end = new Date(endDate);

    // Lặp qua từng ngày trong khoảng thời gian đã chọn
    while (currDate <= end) {
      const dateStr = currDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Với mỗi ngày, lặp qua các ca (Sáng, Chiều, Tối) được chọn
      shift_types.forEach(shift_type => {
        payload.push({
          employee_id,
          date: dateStr,
          shift_type,
          status: 'SCHEDULED' // Lịch đã được lên
        });
      });
      
      // Tăng lên 1 ngày
      currDate.setDate(currDate.getDate() + 1);
    }

    // Lưu toàn bộ mảng xuống DB trong 1 lệnh duy nhất (Cực nhanh)
    await WorkShift.bulkCreate(payload);
    res.status(201).json({ message: 'Phân ca thành công!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi phân ca', error: error.message });
  }
};

// 3. Hủy một ca làm việc
const deleteShift = async (req, res) => {
  try {
    await WorkShift.destroy({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Đã hủy ca làm việc!' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi hủy', error: error.message });
  }
};

// API Dành riêng cho Nhân viên: Lấy lịch làm việc của chính họ
const getMyShifts = async (req, res) => {
  try {
    // req.user.id được giải mã từ Token lúc đăng nhập
    const myId = req.user.id; 
    
    const shifts = await WorkShift.findAll({
      where: { employee_id: myId }, // Khóa chặt: Chỉ lấy đúng ID của mình
      order: [['date', 'ASC']] // Sắp xếp ngày gần nhất lên đầu
    });
    
    res.status(200).json({ data: shifts });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy lịch làm việc', error: error.message });
  }
};

//API Tạo Đơn xin nghỉ / đổi ca
const createShiftRequest = async (req, res) => {
  try {
    const { from_shift_id, reason } = req.body;
    
    // Kiểm tra ca này có đúng là của nhân viên này không
    const shift = await WorkShift.findOne({ where: { id: from_shift_id, employee_id: req.user.id } });
    if (!shift) return res.status(403).json({ message: 'Bạn không có quyền xin nghỉ ca của người khác!' });

    const newRequest = await ShiftRequest.create({
      employee_id: req.user.id,
      from_shift_id,
      reason,
      status: 'PENDING'
    });

    res.status(201).json({ message: 'Đã gửi đơn xin nghỉ cho Quản lý!', data: newRequest });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo đơn', error: error.message });
  }
};

module.exports = { getShifts, createShifts, deleteShift, getMyShifts, createShiftRequest };