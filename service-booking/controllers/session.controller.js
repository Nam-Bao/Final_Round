const { TreatmentSession, ServiceSession, CustomerPackage, TreatmentPackage, SpaService } = require('../models');
const axios = require('axios');
const dayjs = require('dayjs');

const getTechnicianQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const token = req.headers.authorization;
    const myId = req.user.id;

    const tSessions = await TreatmentSession.findAll({
      where: { session_date: today, technician_id: myId },
      include: [{ model: CustomerPackage, include: [{ model: TreatmentPackage, attributes: ['name'] }] }],
      raw: true, nest: true
    });

    const sSessions = await ServiceSession.findAll({
      where: { session_date: today, technician_id: myId },
      include: [{ model: SpaService, attributes: ['name'] }],
      raw: true, nest: true
    });

    if (tSessions.length === 0 && sSessions.length === 0) {
      return res.status(200).json({ data: { waiting: [], inProgress: [], completed: [] } });
    }

    let allUsers = [];
    try {
      const identityRes = await axios.get('http://localhost:4000/api/identity/users/customers', { headers: { 'Authorization': token } });
      allUsers = identityRes.data.data;
    } catch (err) { console.warn("Không gọi được identity"); }

    const mappedTSessions = tSessions.map(session => {
      const customer = allUsers.find(u => u.id === session.CustomerPackage.customer_id);
      // Lấy ĐÚNG hồ sơ người bệnh thay vì lấy hồ sơ đầu tiên
      const patientProfile = customer?.PatientProfiles?.find(p => p.id === session.patient_profile_id); 
      return {
        id: session.id,
        type: 'PACKAGE',
        customer_name: patientProfile?.full_name || customer?.Profile?.full_name || 'Khách hàng',
        customer_phone: patientProfile?.phone || customer?.Profile?.phone || 'Chưa cập nhật',
        service_name: session.CustomerPackage.TreatmentPackage.name,
        current_session: session.session_number,
        total_sessions: session.CustomerPackage.total_sessions,
        status: session.status,
        technician_note: session.technician_note,
        post_treatment_images: session.post_treatment_images // Kéo ảnh xuống FE
      };
    });

    const mappedSSessions = sSessions.map(session => {
      const customer = allUsers.find(u => u.id === session.customer_id);
      // Lấy ĐÚNG hồ sơ người bệnh thay vì lấy hồ sơ đầu tiên
      const patientProfile = customer?.PatientProfiles?.find(p => p.id === session.patient_profile_id);
      return {
        id: session.id,
        type: 'SINGLE',
        customer_name: patientProfile?.full_name || customer?.Profile?.full_name || 'Khách hàng',
        customer_phone: patientProfile?.phone || customer?.Profile?.phone || 'Chưa cập nhật',
        service_name: session.SpaService.name,
        current_session: 1,
        total_sessions: 1,
        status: session.status,
        technician_note: session.technician_note,
        post_treatment_images: session.post_treatment_images // Kéo ảnh xuống FE
      };
    });

    const allSessions = [...mappedTSessions, ...mappedSSessions];

    res.status(200).json({
      data: {
        waiting: allSessions.filter(s => ['SCHEDULED', 'WAITING'].includes(s.status)),
        inProgress: allSessions.filter(s => s.status === 'IN_PROGRESS'),
        completed: allSessions.filter(s => s.status === 'COMPLETED')
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const updateSessionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, technician_note, type, post_treatment_images } = req.body; // THÊM nhận mảng ảnh
    
    if (type === 'PACKAGE') {
        const session = await TreatmentSession.findByPk(id);
        if (!session) return res.status(404).json({ message: 'Không tìm thấy ca làm' });
        const wasCompleted = session.status === 'COMPLETED';
        
        session.status = status;
        if (technician_note) session.technician_note = technician_note;
        if (post_treatment_images) session.post_treatment_images = post_treatment_images; // Lưu ảnh
        await session.save();

        // Chỉ trừ buổi khi lần đầu chuyển sang COMPLETED (bấm lại không trừ thêm)
        if (status === 'COMPLETED' && !wasCompleted) {
          const customerPkg = await CustomerPackage.findByPk(session.customer_package_id);
          if (customerPkg && customerPkg.remaining_sessions > 0) {
            customerPkg.remaining_sessions -= 1;
            await customerPkg.save();
          }
        }
    } else if (type === 'SINGLE') {
        const session = await ServiceSession.findByPk(id);
        if (!session) return res.status(404).json({ message: 'Không tìm thấy ca làm' });
        
        session.status = status;
        if (technician_note) session.technician_note = technician_note;
        if (post_treatment_images) session.post_treatment_images = post_treatment_images; // Lưu ảnh
        await session.save();
    } else {
        return res.status(400).json({ message: 'Loại dịch vụ không hợp lệ' });
    }

    res.status(200).json({ message: 'Đã cập nhật ca làm' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Lấy lịch sử ca làm KTV cho Admin (Doctor/CSKH)
const getPatientSessions = async (req, res) => {
  try {
    const { patientProfileId } = req.params;
    const tSessions = await TreatmentSession.findAll({
      where: { patient_profile_id: patientProfileId, status: 'COMPLETED' },
      include: [{ model: CustomerPackage, include: [{ model: TreatmentPackage, attributes: ['name'] }] }],
      raw: true, nest: true
    });
    const sSessions = await ServiceSession.findAll({
      where: { patient_profile_id: patientProfileId, status: 'COMPLETED' },
      include: [{ model: SpaService, attributes: ['name'] }],
      raw: true, nest: true
    });

    const formatted = [
      ...tSessions.map(s => ({ ...s, service_name: s.CustomerPackage.TreatmentPackage.name, type: 'PACKAGE' })),
      ...sSessions.map(s => ({ ...s, service_name: s.SpaService.name, type: 'SINGLE' }))
    ];
    res.status(200).json({ data: formatted });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// Lấy lịch sử ca làm KTV cho chính Khách hàng đang đăng nhập
const getMySessions = async (req, res) => {
  try {
    const tSessions = await TreatmentSession.findAll({
      include: [{ model: CustomerPackage, where: { customer_id: req.user.id } }],
      where: { status: 'COMPLETED' }, raw: true, nest: true
    });
    const sSessions = await ServiceSession.findAll({
      where: { customer_id: req.user.id, status: 'COMPLETED' }, raw: true, nest: true
    });
    res.status(200).json({
      data: [
        ...tSessions.map(s => ({ ...s, session_type: 'PACKAGE' })),
        ...sSessions.map(s => ({ ...s, session_type: 'SINGLE' }))
      ]
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

module.exports = { getTechnicianQueues, updateSessionStatus, getPatientSessions, getMySessions };