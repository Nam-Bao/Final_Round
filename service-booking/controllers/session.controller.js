const { TreatmentSession, ServiceSession, CustomerPackage, TreatmentPackage, SpaService } = require('../models');
const axios = require('axios');
const { Op } = require('sequelize');
const dayjs = require('dayjs');

const getTechnicianQueues = async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const token = req.headers.authorization;
    const myId = req.user.id;

    const tSessions = await TreatmentSession.findAll({
      where: { session_date: today, [Op.or]: [{ technician_id: myId }, { technician_id: null }] }, // buổi chưa giao ai: KTV nào rảnh thì nhận
      include: [{ model: CustomerPackage, include: [{ model: TreatmentPackage, attributes: ['name'] }] }],
      raw: true, nest: true
    });

    const sSessions = await ServiceSession.findAll({
      where: { session_date: today, [Op.or]: [{ technician_id: myId }, { technician_id: null }] }, // buổi chưa giao ai: KTV nào rảnh thì nhận
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
        target_type: 'PACKAGE', target_id: session.CustomerPackage.package_id, // để tải định mức vật tư
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
        target_type: 'SERVICE', target_id: session.spa_service_id, // để tải định mức vật tư
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
    if (!['WAITING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }
    if (type !== 'PACKAGE' && type !== 'SINGLE') {
      return res.status(400).json({ message: 'Loại dịch vụ không hợp lệ' });
    }

    const session = type === 'PACKAGE' ? await TreatmentSession.findByPk(id) : await ServiceSession.findByPk(id);
    if (!session) return res.status(404).json({ message: 'Không tìm thấy ca làm' });
    // KTV chỉ xử lý buổi được giao cho mình; buổi chưa giao ai thì KTV bấm đầu tiên nhận buổi đó
    if (session.technician_id && session.technician_id !== req.user.id) {
      return res.status(403).json({ message: 'Buổi này được giao cho kỹ thuật viên khác' });
    }
    // Buổi đặt trước cho ngày sau chưa được làm sớm
    if (status !== 'WAITING' && session.session_date > dayjs().format('YYYY-MM-DD')) {
      return res.status(400).json({ message: 'Chưa đến ngày hẹn của buổi này' });
    }
    const wasCompleted = session.status === 'COMPLETED';

    // Lần đầu hoàn thành buổi: ghi vật tư đã dùng => service-commerce trừ kho (mỗi buổi 1 lần).
    // Ghi vật tư lỗi thì chưa chuyển trạng thái để KTV thử lại, tránh buổi đã xong mà kho không trừ.
    let materialResult = null;
    if (status === 'COMPLETED' && !wasCompleted && Array.isArray(req.body.materials) && req.body.materials.length) {
      const isPackage = type === 'PACKAGE';
      let target_id = session.spa_service_id;
      let target_name = '';
      if (isPackage) {
        const pkg = await CustomerPackage.findByPk(session.customer_package_id, { include: [{ model: TreatmentPackage, attributes: ['name'] }] });
        target_id = pkg?.package_id;
        target_name = pkg?.TreatmentPackage?.name || '';
      } else {
        target_name = (await SpaService.findByPk(session.spa_service_id, { attributes: ['name'] }))?.name || '';
      }
      try {
        const r = await axios.post('http://localhost:4000/api/commerce/materials/usage', {
          reference_type: isPackage ? 'TREATMENT_SESSION' : 'SERVICE_SESSION', reference_id: session.id,
          target_type: isPackage ? 'PACKAGE' : 'SERVICE', target_id, target_name,
          items: req.body.materials,
        }, { headers: { Authorization: req.headers.authorization }, timeout: 10000 });
        materialResult = r.data;
      } catch (err) {
        return res.status(err.response?.status && err.response.status < 500 ? err.response.status : 502)
          .json({ message: err.response?.data?.message || 'Không ghi được vật tư, vui lòng thử lại' });
      }
    }

    session.technician_id = session.technician_id || req.user.id;
    session.status = status;
    if (technician_note) session.technician_note = technician_note;
    if (post_treatment_images) session.post_treatment_images = post_treatment_images; // Lưu ảnh
    await session.save();

    // Buổi liệu trình: chỉ trừ buổi khi lần đầu chuyển sang COMPLETED (bấm lại không trừ thêm); hết buổi thì gói hoàn thành
    if (type === 'PACKAGE' && status === 'COMPLETED' && !wasCompleted) {
      const customerPkg = await CustomerPackage.findByPk(session.customer_package_id);
      if (customerPkg && customerPkg.remaining_sessions > 0) {
        customerPkg.remaining_sessions -= 1;
        if (customerPkg.remaining_sessions === 0) customerPkg.status = 'COMPLETED';
        await customerPkg.save();
      }
    }

    res.status(200).json({ message: materialResult?.message ? `Đã cập nhật ca làm. ${materialResult.message}` : 'Đã cập nhật ca làm', materials: materialResult });
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

// [ADMIN/GEN_MANAGER] Số buổi đã đặt trong N ngày tới theo dịch vụ lẻ / gói => service-commerce dự báo nhu cầu vật tư
const getUpcomingDemand = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 60);
    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(days, 'day').format('YYYY-MM-DD');
    const where = { session_date: { [Op.between]: [from, to] }, status: { [Op.ne]: 'COMPLETED' } };
    const [tRows, sRows] = await Promise.all([
      TreatmentSession.findAll({ where, include: [{ model: CustomerPackage, attributes: ['package_id'] }], attributes: ['id'], raw: true, nest: true }),
      ServiceSession.findAll({ where, attributes: ['spa_service_id'], raw: true }),
    ]);
    const PACKAGE = {};
    const SERVICE = {};
    tRows.forEach((r) => { const id = r.CustomerPackage?.package_id; if (id) PACKAGE[id] = (PACKAGE[id] || 0) + 1; });
    sRows.forEach((r) => { SERVICE[r.spa_service_id] = (SERVICE[r.spa_service_id] || 0) + 1; });
    res.status(200).json({ data: { PACKAGE, SERVICE }, from, to, days });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getTechnicianQueues, updateSessionStatus, getPatientSessions, getMySessions, getUpcomingDemand };