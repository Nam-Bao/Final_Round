// [SYSTEM] POST /users/print-info — thông tin người in trên chứng từ (phiếu thanh toán, đơn thuốc, hóa đơn quầy).
// Chỉ service khác gọi (token hệ thống), nhân viên xem chứng từ qua API in của booking / commerce đã phân quyền.
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Profile, DoctorProfile, PatientProfile, MedicalRecord } = require('../models');

const systemOnly = (req, res, next) => {
  try {
    const payload = jwt.verify(String(req.header('Authorization') || '').replace('Bearer ', ''), process.env.JWT_SECRET);
    if (payload.sys !== true) return res.status(403).json({ message: 'Forbidden' });
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

const ids = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 50);

const printInfo = async (req, res) => {
  try {
    const userIds = ids(req.body?.user_ids);
    const patientIds = ids(req.body?.patient_ids);
    const appointmentId = ids([req.body?.appointment_id])[0];
    const [users, patients, record] = await Promise.all([
      userIds.length ? User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'email', 'role'], include: [{ model: Profile, attributes: ['full_name', 'phone', 'dob', 'gender'] }, { model: DoctorProfile, attributes: ['title', 'specialty', 'license_number'] }] }) : [],
      patientIds.length ? PatientProfile.findAll({ where: { id: { [Op.in]: patientIds } }, attributes: ['id', 'user_id', 'full_name', 'phone', 'dob', 'gender', 'relationship'] }) : [],
      appointmentId ? MedicalRecord.findOne({ where: { appointment_id: appointmentId }, attributes: ['symptoms', 'diagnosis', 'doctor_notes', 'follow_up_date', 'exam_date'], order: [['createdAt', 'DESC']] }) : null,
    ]);
    res.json({
      users: Object.fromEntries(users.map((u) => [u.id, {
        role: u.role, full_name: u.Profile?.full_name || null, phone: u.Profile?.phone || null, dob: u.Profile?.dob || null, gender: u.Profile?.gender || null,
        title: u.DoctorProfile?.title || null, specialty: u.DoctorProfile?.specialty || null, license_number: u.DoctorProfile?.license_number || null,
      }])),
      patients: Object.fromEntries(patients.map((p) => [p.id, p.toJSON()])),
      medical_record: record ? record.toJSON() : null,
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { systemOnly, printInfo };
