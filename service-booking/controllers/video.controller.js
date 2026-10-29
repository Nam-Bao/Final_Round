const dayjs = require('dayjs');
const { Appointment } = require('../models');
const { generateRoomToken } = require('../utils/zegoToken');

const isOnlineAppointment = (apt) => Boolean(apt?.pre_notes?.startsWith('[ONLINE]'));

// Phòng mở trước giờ hẹn 15 phút và đóng sau giờ hẹn 2 tiếng
const OPEN_BEFORE_MINUTES = 15;
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
    const now = dayjs();
    if (now.isBefore(start.subtract(OPEN_BEFORE_MINUTES, 'minute'))) {
      return res.status(400).json({
        message: `Phòng khám mở trước giờ hẹn ${OPEN_BEFORE_MINUTES} phút. Lịch của bạn lúc ${start.format('HH:mm DD/MM/YYYY')}.`
      });
    }
    if (now.isAfter(start.add(CLOSE_AFTER_MINUTES, 'minute'))) {
      return res.status(400).json({ message: 'Đã quá giờ khám của lịch hẹn này' });
    }

    const roomID = `glowskin_${apt.id}`;
    const token = generateRoomToken(appID, userID, serverSecret, roomID, CLOSE_AFTER_MINUTES * 60);
    res.status(200).json({ data: { appID, userID, roomID, token } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tạo phòng khám video', error: error.message });
  }
};

module.exports = { getVideoToken, isOnlineAppointment };
