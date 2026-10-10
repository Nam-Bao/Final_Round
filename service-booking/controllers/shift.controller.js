const { WorkShift, ShiftRequest, Appointment } = require('../models');
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
    const myId = req.user.id; 
    
    // Tối ưu: Chỉ Query các ca làm việc từ hôm nay trở về sau (giảm tải DB)
    const today = new Date().toISOString().split('T')[0];

    const shifts = await WorkShift.findAll({
      where: { 
        employee_id: myId,
        date: { [Op.gte]: today } // gte: Greater than or equal (Lớn hơn hoặc bằng)
      }, 
      order: [['date', 'ASC']]
    });
    
    // Đếm số lượng khách hẹn trong từng ca (Map & Count)
    const mappedShifts = await Promise.all(shifts.map(async (shift) => {
      // 1. Xác định khung giờ của ca làm đó
      let startTime = '00:00:00';
      let endTime = '23:59:59';
      
      if (shift.shift_type === 'MORNING') { startTime = '08:00:00'; endTime = '12:00:59'; }
      else if (shift.shift_type === 'AFTERNOON') { startTime = '13:00:00'; endTime = '17:00:59'; }
      else if (shift.shift_type === 'EVENING') { startTime = '18:00:00'; endTime = '22:00:59'; }

      // 2. Đếm số lịch hẹn của Bác sĩ này, trong ngày này, nằm trong khung giờ này
      const count = await Appointment.count({
        where: {
          doctor_id: myId,
          appointment_date: shift.date,
          appointment_time: { [Op.between]: [startTime, endTime] },
          status: { [Op.notIn]: ['CANCELLED'] } // Bỏ qua các đơn đã bị khách hủy
        }
      });

      // 3. Trả về object ca làm gốc + nhồi thêm biến đếm
      return {
        ...shift.toJSON(),
        appointment_count: count 
      };
    }));

    res.status(200).json({ data: mappedShifts });
  } catch (error) {
    console.error("Lỗi getMyShifts:", error);
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

// 4. Lấy danh sách đơn xin nghỉ/đổi ca đang chờ duyệt
const getShiftRequests = async (req, res) => {
  try {
    const requests = await ShiftRequest.findAll({
      where: { status: 'PENDING' },
      order: [['createdAt', 'DESC']]
    });

    // Map thêm thông tin ca làm (WorkShift) vào từng đơn để Frontend hiển thị
    const mappedRequests = await Promise.all(requests.map(async (request) => {
      let shift = null;
      if (request.from_shift_id) {
        shift = await WorkShift.findByPk(request.from_shift_id);
      }
      return {
        ...request.toJSON(),
        WorkShift: shift // Đính kèm thông tin ca trực
      };
    }));

    res.status(200).json({ data: mappedRequests });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy danh sách đơn', error: error.message });
  }
};

// 5. Phê duyệt hoặc từ chối đơn
const handleShiftRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const request = await ShiftRequest.findByPk(id);
    if (!request) return res.status(404).json({ message: 'Không tìm thấy đơn' });

    request.status = status;
    request.approver_id = req.user.id;
    await request.save();

    // NẾU QUẢN LÝ DUYỆT ĐƠN KHẨN CẤP -> Hủy ca làm & Chuyển khách sang cho CSKH
    if (status === 'APPROVED' && request.from_shift_id) {
      const shift = await WorkShift.findByPk(request.from_shift_id);
      
      if (shift) {
        // 1. Xác định khung giờ của ca bị hủy
        let startTime = '00:00:00'; let endTime = '23:59:59';
        if (shift.shift_type === 'MORNING') { startTime = '08:00:00'; endTime = '12:00:59'; }
        else if (shift.shift_type === 'AFTERNOON') { startTime = '13:00:00'; endTime = '17:00:59'; }
        else if (shift.shift_type === 'EVENING') { startTime = '18:00:00'; endTime = '22:00:59'; }

        // 2. Chuyển tất cả khách trong ca này sang trạng thái "Cần Dời Lịch"
        await Appointment.update(
          { status: 'NEEDS_RESCHEDULE' },
          {
            where: {
              doctor_id: shift.employee_id,
              appointment_date: shift.date,
              appointment_time: { [Op.between]: [startTime, endTime] },
              status: { [Op.in]: ['PENDING', 'CONFIRMED'] } // Chỉ lấy những khách đang chờ
            }
          }
        );

        // 3. Xóa ca làm đó đi
        await shift.destroy();
      }
    }

    res.status(200).json({ message: 'Đã xử lý đơn thành công!' });
  } catch (error) {
    console.error("Lỗi xử lý đơn xin nghỉ:", error);
    res.status(500).json({ message: 'Lỗi xử lý đơn', error: error.message });
  }
};

// 6. API Dành riêng cho Nhân viên: Xem lịch sử đơn xin nghỉ của chính mình
const getMyShiftRequests = async (req, res) => {
  try {
    const myId = req.user.id; 
    const requests = await ShiftRequest.findAll({
      where: { employee_id: myId },
      order: [['createdAt', 'DESC']]
    });

    // Map thêm thông tin ca làm để Frontend hiển thị rõ ngày nào
    const mappedRequests = await Promise.all(requests.map(async (request) => {
      let shift = null;
      if (request.from_shift_id) {
        shift = await WorkShift.findByPk(request.from_shift_id);
      }
      return {
        ...request.toJSON(),
        WorkShift: shift
      };
    }));

    res.status(200).json({ data: mappedRequests });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lấy lịch sử đơn', error: error.message });
  }
};

const getDoctorShifts = async (req, res) => {
  try {
    const { doctorId, startDate, endDate } = req.query;

    if (!doctorId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp ID bác sĩ' });
    }

    let whereClause = {
      employee_id: doctorId,
      status: 'SCHEDULED' // Chỉ lấy những ca có lịch đi làm
    };
    
    if (startDate && endDate) {
      whereClause.date = { [Op.between]: [startDate, endDate] };
    }

    const shifts = await WorkShift.findAll({ 
      where: whereClause,
      attributes: ['date', 'shift_type'] // CHỈ trả về ngày và buổi (Sáng/Chiều/Tối), giấu ID và các thông tin nội bộ
    });

    res.status(200).json({ data: shifts });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy ca làm việc bác sĩ', error: error.message });
  }
};

module.exports = { getShifts, createShifts, deleteShift, getMyShifts, createShiftRequest, getShiftRequests, handleShiftRequest, getMyShiftRequests, getDoctorShifts };