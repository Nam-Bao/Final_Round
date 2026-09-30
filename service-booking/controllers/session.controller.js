const { TreatmentSession, CustomerPackage, TreatmentPackage } = require('../models');
const axios = require('axios');
const dayjs = require('dayjs');

// 1. Kéo dữ liệu 3 phễu cho KTV
const getTechnicianQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const token = req.headers.authorization;

    // Lấy các ca làm việc trong ngày hôm nay, kèm theo thông tin Gói
    const sessions = await TreatmentSession.findAll({
      where: { session_date: today },
      include: [{
        model: CustomerPackage,
        include: [{ model: TreatmentPackage, attributes: ['name'] }]
      }],
      raw: true, nest: true
    });

    if (sessions.length === 0) {
      return res.status(200).json({ data: { waiting: [], inProgress: [], completed: [] } });
    }

    // Lấy danh sách user từ Identity để map Tên và SĐT
    let allUsers = [];
    try {
      const identityRes = await axios.get('http://localhost:4000/api/identity/users', { headers: { 'Authorization': token } });
      allUsers = identityRes.data.data;
    } catch (err) { console.warn("Không gọi được identity"); }

    const mappedSessions = sessions.map(session => {
      const customer = allUsers.find(u => u.id === session.CustomerPackage.customer_id);
      return {
        id: session.id,
        customer_name: customer?.Profile?.full_name || 'Khách hàng',
        customer_phone: customer?.Profile?.phone || 'Chưa cập nhật',
        package_name: session.CustomerPackage.TreatmentPackage.name,
        current_session: session.session_number,
        total_sessions: session.CustomerPackage.total_sessions,
        status: session.status,
        technician_note: session.technician_note
      };
    });

    res.status(200).json({
      data: {
        waiting: mappedSessions.filter(s => ['SCHEDULED', 'WAITING'].includes(s.status)),
        inProgress: mappedSessions.filter(s => s.status === 'IN_PROGRESS'),
        completed: mappedSessions.filter(s => s.status === 'COMPLETED')
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// 2. Chuyển trạng thái ca làm
const updateSessionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, technician_note } = req.body;
    
    const session = await TreatmentSession.findByPk(id);
    if (!session) return res.status(404).json({ message: 'Không tìm thấy ca làm' });

    session.status = status;
    session.technician_id = req.user.id; // Lưu lại ID KTV nào đang nhận ca này
    if (technician_note) session.technician_note = technician_note;
    await session.save();

    // Nếu hoàn thành, trừ đi 1 buổi trong Gói của khách
    if (status === 'COMPLETED') {
      const customerPkg = await CustomerPackage.findByPk(session.customer_package_id);
      if (customerPkg && customerPkg.remaining_sessions > 0) {
        customerPkg.remaining_sessions -= 1;
        await customerPkg.save();
      }
    }
    res.status(200).json({ message: 'Đã cập nhật ca làm' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getTechnicianQueues, updateSessionStatus };