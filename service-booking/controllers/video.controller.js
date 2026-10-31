const dayjs = require('dayjs');
const { Appointment } = require('../models');
const { generateRoomToken } = require('../utils/zegoToken');

// Dùng includes: lịch đã dời được thêm tiền tố "[ĐÃ DỜI LỊCH: ...] - " trước "[ONLINE]"
const isOnlineAppointment = (apt) => Boolean(apt?.pre_notes?.includes('[ONLINE]'));

// Khách vào phòng đúng từ giờ hẹn; bác sĩ được vào sớm 15 phút để chuẩn bị. Phòng đóng sau giờ hẹn 2 tiếng
const DOCTOR_OPEN_BEFORE_MINUTES = 15;
const CLOSE_AFTER_MINUTES = 120;
const JOINABLE_STATUSES = ['CONFIRMED', 'WAITING', 'IN_PROGRESS'];

// GET /appointments/:id/video-token — cấp token Zego vào phòng khám của đúng lịch hẹn online
const getVideoToken = async (req, res) => {
  try {
    const appID = Number(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SERVER_SECRET;
    if (!appID || !serverSecret) {
      return res.status(500).json({ message: 'Server chưa cấu hình ZEGO_APP_ID / ZEGO_SERVER_SECRET' });
    }

    const apt = await Appointment.findByPk(req.params.id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });

    const userID = String(req.user.id);
    if (userID !== apt.customer_id && userID !== apt.doctor_id) {
      return res.status(403).json({ message: 'Bạn không thuộc lịch hẹn này' });
    }
    if (!isOnlineAppointment(apt)) {
      return res.status(400).json({ message: 'Lịch hẹn này là khám tại phòng khám, không có phòng video' });
    }
    if (!JOINABLE_STATUSES.includes(apt.status)) {
      return res.status(400).json({ message: 'Lịch hẹn chưa thanh toán, đã kết thúc hoặc đã hủy' });
    }

    const start = dayjs(`${apt.appointment_date} ${String(apt.appointment_time).slice(0, 5)}`, 'YYYY-MM-DD HH:mm');
    const end = start.add(CLOSE_AFTER_MINUTES, 'minute');
    const isDoctor = userID === apt.doctor_id;
    const opensAt = isDoctor ? start.subtract(DOCTOR_OPEN_BEFORE_MINUTES, 'minute') : start;
    const now = dayjs();
    if (now.isBefore(opensAt)) {
      return res.status(400).json({
        code: 'NOT_STARTED',
        opens_at: opensAt.toISOString(),
        message: isDoctor
          ? `Phòng khám mở trước giờ hẹn ${DOCTOR_OPEN_BEFORE_MINUTES} phút (lúc ${opensAt.format('HH:mm DD/MM/YYYY')}).`
          : `Chưa đến giờ hẹn. Buổi khám online bắt đầu lúc ${start.format('HH:mm')} ngày ${start.format('DD/MM/YYYY')}, bạn vui lòng quay lại đúng giờ.`
      });
    }
    if (now.isAfter(end)) {
      return res.status(400).json({ code: 'ENDED', message: 'Đã quá giờ khám của lịch hẹn này' });
    }

    const roomID = `glowskin_${apt.id}`;
    // Token chỉ dùng được tới lúc phòng đóng
    const token = generateRoomToken(appID, userID, serverSecret, roomID, Math.max(end.diff(now, 'second'), 60));
    res.status(200).json({ data: { appID, userID, roomID, token } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo phòng khám video', error: error.message });
  }
};

module.exports = { getVideoToken, isOnlineAppointment };
