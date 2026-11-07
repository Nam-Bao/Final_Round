const { Op } = require('sequelize');
const dayjs = require('dayjs');
const axios = require('axios');
const { Appointment, FollowUpLog } = require('../models');

// CSKH gọi chăm sóc khách: nhắc lịch hẹn, nhắc tái khám, thăm hỏi sau khám.
// Đổi lịch / hủy / đặt lịch tái khám đi qua API lịch hẹn sẵn có (giữ khóa chống trùng giờ và quy tắc cọc), ở đây chỉ lập danh sách và lưu nhật ký.
const IDENTITY_API = 'http://localhost:4000/api/identity';
const REMIND_DAYS = 3;      // nhắc trước ngày hẹn
const AFTERCARE_DAYS = 14;  // thăm hỏi trong vòng 14 ngày sau khám

const UPCOMING_STATUSES = ['PENDING', 'CONFIRMED'];
const OUTCOMES = {
  REMINDER: ['CAN_COME', 'CANNOT_COME', 'NO_ANSWER'],
  REVISIT: ['CAN_COME', 'RESCHEDULED', 'CANCELLED', 'NO_ANSWER'],
  AFTERCARE: ['ANSWERED', 'NO_ANSWER'],
};
const REASON_REQUIRED = ['CANNOT_COME', 'RESCHEDULED', 'CANCELLED'];
const MIN_REASON = 10;
const SKIN_STATUSES = ['MUCH_BETTER', 'BETTER', 'SAME', 'WORSE'];
const ADHERENCE = ['FULL', 'PARTIAL', 'STOPPED'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const timeOf = (value) => String(value || '').slice(0, 5);
const slotOf = (apt) => `${apt.appointment_date} ${timeOf(apt.appointment_time)}`;
const dayKey = (value) => dayjs(value).format('YYYY-MM-DD');

const fetchIdentity = (req, path) => axios
  .get(`${IDENTITY_API}${path}`, { headers: { Authorization: req.headers.authorization } })
  .then((res) => res.data?.data || [])
  .catch(() => null);

// Lịch có thể đặt cho người thân => ưu tiên tên, SĐT của hồ sơ được khám
const patientOf = (customers, customerId, profileId) => {
  const customer = customers.find((c) => c.id === customerId);
  const profile = customer?.PatientProfiles?.find((p) => p.id === profileId);
  return {
    customer_name: profile?.full_name || customer?.Profile?.full_name || 'Khách hàng',
    customer_phone: profile?.phone || customer?.Profile?.phone || '',
  };
};

const doctorName = (doctors, id) => {
  const doctor = doctors.find((d) => d.id === id);
  return doctor?.Profile?.full_name || doctor?.full_name || '';
};

// [STAFF] GET /follow-ups/calls — 3 danh sách cần gọi
const getCallLists = async (req, res) => {
  try {
    const today = dayjs();
    const todayKey = today.format('YYYY-MM-DD');
    const [customersRes, doctorsRes, recordsRes] = await Promise.all([
      fetchIdentity(req, '/users/customers'),
      fetchIdentity(req, '/users/doctors'),
      fetchIdentity(req, '/medical-records/follow-ups/upcoming'),
    ]);
    const customers = customersRes || [];
    const doctors = doctorsRes || [];
    const records = recordsRes || [];

    const appointments = await Appointment.findAll({
      where: {
        [Op.or]: [
          { status: { [Op.in]: UPCOMING_STATUSES }, appointment_date: { [Op.between]: [today.add(1, 'day').format('YYYY-MM-DD'), today.add(REMIND_DAYS, 'day').format('YYYY-MM-DD')] } },
          { status: 'COMPLETED', appointment_date: { [Op.between]: [today.subtract(AFTERCARE_DAYS, 'day').format('YYYY-MM-DD'), todayKey] } },
        ],
      },
      raw: true,
    });

    // Lịch khám gốc của bệnh án và các lịch tái khám đã có của cùng hồ sơ
    const profileIds = [...new Set(records.map((r) => r.patient_profile_id).filter(Boolean))];
    const [sourceAppointments, followUps] = await Promise.all([
      Appointment.findAll({ where: { id: { [Op.in]: records.map((r) => r.appointment_id) } }, raw: true }),
      Appointment.findAll({ where: { type: 'FOLLOW_UP', patient_profile_id: { [Op.in]: profileIds }, status: { [Op.notIn]: ['CANCELLED', 'NO_SHOW'] } }, raw: true }),
    ]);
    // Lịch tái khám đặt sau lần khám ghi trong bệnh án
    const followUpOf = (record) => followUps.find((a) => a.patient_profile_id === record.patient_profile_id
      && a.id !== record.appointment_id && a.appointment_date > dayKey(record.exam_date));

    const logs = await FollowUpLog.findAll({
      where: {
        [Op.or]: [
          { appointment_id: { [Op.in]: appointments.map((a) => a.id) } },
          { medical_record_id: { [Op.in]: records.map((r) => r.id) } },
        ],
      },
      order: [['createdAt', 'DESC']],
      raw: true,
    });
    const logsOf = (callType, match) => logs.filter((l) => l.call_type === callType && match(l));
    const missedCalls = (list) => list.filter((l) => l.outcome === 'NO_ANSWER').length;

    const isCancelled = (record) => logsOf('REVISIT', (l) => l.medical_record_id === record.id && l.outcome === 'CANCELLED').length > 0;
    // Hồ sơ có nhiều bệnh án: lịch tái khám thuộc bệnh án còn hiệu lực có ngày hẹn gần lịch nhất
    const recordOf = (apt) => records
      .filter((r) => r.patient_profile_id === apt.patient_profile_id && dayKey(r.exam_date) < apt.appointment_date && !isCancelled(r))
      .sort((a, b) => Math.abs(dayjs(a.follow_up_date).diff(apt.appointment_date, 'day')) - Math.abs(dayjs(b.follow_up_date).diff(apt.appointment_date, 'day')))[0];

    const describe = (apt) => ({
      appointment_id: apt.id,
      customer_id: apt.customer_id,
      patient_profile_id: apt.patient_profile_id,
      ...patientOf(customers, apt.customer_id, apt.patient_profile_id),
      doctor_id: apt.doctor_id,
      doctor_name: doctorName(doctors, apt.doctor_id),
      date: apt.appointment_date,
      time: timeOf(apt.appointment_time),
      type: apt.type,
      status: apt.status,
    });

    // Khách báo không đến được: lịch ở lại danh sách tới khi CSKH đổi xong; đổi rồi thì coi như đã xử lý
    const reminders = appointments
      .filter((a) => UPCOMING_STATUSES.includes(a.status) && a.type !== 'FOLLOW_UP')
      .flatMap((apt) => {
        const tried = logsOf('REMINDER', (l) => l.appointment_id === apt.id);
        const last = tried[0];
        const sameSlot = last?.scheduled_for === slotOf(apt);
        if ((last?.outcome === 'CAN_COME' && sameSlot) || (last?.outcome === 'CANNOT_COME' && !sameSlot)) return [];
        return [{ ...describe(apt), key: apt.id, attempts: missedCalls(tried), waiting_change: last?.outcome === 'CANNOT_COME', reason: last?.outcome === 'CANNOT_COME' ? last.reason : null }];
      });

    const bookedRevisits = appointments
      .filter((a) => UPCOMING_STATUSES.includes(a.status) && a.type === 'FOLLOW_UP')
      .flatMap((apt) => {
        const tried = logsOf('REVISIT', (l) => l.appointment_id === apt.id);
        const last = tried[0];
        if (['CAN_COME', 'RESCHEDULED'].includes(last?.outcome) && last.scheduled_for === slotOf(apt)) return [];
        const record = recordOf(apt);
        return [{ ...describe(apt), key: apt.id, kind: 'APPOINTMENT', medical_record_id: record?.id || null, diagnosis: record?.diagnosis || null, attempts: missedCalls(tried) }];
      });

    // Bác sĩ hẹn ngày tái khám nhưng chưa có lịch: CSKH gọi rồi xếp giờ
    const unbookedRevisits = records
      .filter((r) => !followUpOf(r) && !isCancelled(r))
      .map((record) => {
        const source = sourceAppointments.find((a) => a.id === record.appointment_id);
        const customerId = record.Patient?.user_id || source?.customer_id;
        const doctorId = record.doctor_id || source?.doctor_id;
        const account = patientOf(customers, customerId, record.patient_profile_id);
        return {
          key: record.id,
          kind: 'RECORD',
          medical_record_id: record.id,
          appointment_id: record.appointment_id,
          customer_id: customerId,
          patient_profile_id: record.patient_profile_id,
          customer_name: record.Patient?.full_name || account.customer_name,
          customer_phone: record.Patient?.phone || account.customer_phone,
          doctor_id: doctorId,
          doctor_name: doctorName(doctors, doctorId),
          date: record.follow_up_date,
          time: null,
          old_time: timeOf(source?.appointment_time) || null,
          diagnosis: record.diagnosis,
          attempts: missedCalls(logsOf('REVISIT', (l) => l.medical_record_id === record.id)),
        };
      });

    const aftercare = appointments
      .filter((a) => a.status === 'COMPLETED')
      .flatMap((apt) => {
        const tried = logsOf('AFTERCARE', (l) => l.appointment_id === apt.id);
        if (tried.some((l) => l.outcome === 'ANSWERED')) return [];
        return [{ ...describe(apt), key: apt.id, diagnosis: apt.diagnosis, attempts: missedCalls(tried) }];
      });

    const byDate = (a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`);
    res.status(200).json({
      data: {
        reminders: reminders.sort(byDate),
        revisits: [...bookedRevisits, ...unbookedRevisits].sort(byDate),
        aftercare: aftercare.sort(byDate),
      },
      warning: customersRes && doctorsRes && recordsRes ? null : 'Không tải đủ thông tin khách, bác sĩ hoặc lịch tái khám từ hồ sơ. Vui lòng tải lại.',
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// Thông tin khách sau khám: kiểm tra đủ trường rồi mới lưu
const readAftercare = (input = {}) => {
  const satisfaction = Number(input.satisfaction);
  if (!SKIN_STATUSES.includes(input.skin_status)) return { error: 'Chọn tình trạng da sau khám' };
  if (!ADHERENCE.includes(input.adherence)) return { error: 'Chọn mức độ khách dùng thuốc theo phác đồ' };
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) return { error: 'Chọn mức độ hài lòng từ 1 đến 5 sao' };
  const symptoms = Array.isArray(input.symptoms) ? [...new Set(input.symptoms.map((s) => clean(s, 60)).filter(Boolean))].slice(0, 10) : [];
  return { data: { skin_status: input.skin_status, adherence: input.adherence, satisfaction, symptoms, complaint: input.complaint === true } };
};

// [STAFF] POST /follow-ups/calls — lưu kết quả 1 cuộc gọi
const saveCall = async (req, res) => {
  try {
    const { call_type, appointment_id, medical_record_id, outcome } = req.body;
    const reason = clean(req.body.reason, 500);
    const note = clean(req.body.note, 2000);

    if (!OUTCOMES[call_type]?.includes(outcome)) return res.status(400).json({ message: 'Kết quả cuộc gọi không hợp lệ' });
    if (!UUID.test(appointment_id || '')) return res.status(400).json({ message: 'Thiếu lịch hẹn của cuộc gọi' });
    if (medical_record_id && !UUID.test(medical_record_id)) return res.status(400).json({ message: 'Bệnh án không hợp lệ' });
    if (REASON_REQUIRED.includes(outcome) && reason.length < MIN_REASON) {
      return res.status(400).json({ message: `Nhập lý do khách không đến được (ít nhất ${MIN_REASON} ký tự)` });
    }

    const apt = await Appointment.findByPk(appointment_id);
    if (!apt) return res.status(404).json({ message: 'Không tìm thấy lịch hẹn' });
    if (call_type === 'REMINDER' && !UPCOMING_STATUSES.includes(apt.status)) {
      return res.status(409).json({ message: 'Lịch hẹn này không còn ở trạng thái chờ khách đến' });
    }

    let aftercare = null;
    if (call_type === 'AFTERCARE') {
      if (apt.status !== 'COMPLETED') return res.status(409).json({ message: 'Lịch hẹn này chưa khám xong' });
      const done = await FollowUpLog.count({ where: { appointment_id, call_type, outcome: 'ANSWERED' } });
      if (done > 0) return res.status(409).json({ message: 'Lần khám này đã có thông tin thăm hỏi' });
      if (outcome === 'ANSWERED') {
        const parsed = readAftercare(req.body.aftercare);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        if ((parsed.data.skin_status === 'WORSE' || parsed.data.complaint) && note.length < MIN_REASON) {
          return res.status(400).json({ message: `Da nặng hơn hoặc khách khiếu nại: ghi rõ nội dung (ít nhất ${MIN_REASON} ký tự)` });
        }
        aftercare = parsed.data;
      }
    }

    const log = await FollowUpLog.create({
      customer_id: apt.customer_id,
      appointment_id,
      consultant_id: req.user.id,
      patient_profile_id: apt.patient_profile_id,
      medical_record_id: medical_record_id || null,
      call_type,
      outcome,
      call_status: outcome === 'NO_ANSWER' ? 'NO_ANSWER' : (aftercare?.complaint || aftercare?.skin_status === 'WORSE') ? 'COMPLAINT' : 'SUCCESS',
      scheduled_for: slotOf(apt),
      reason: reason || null,
      call_note: note || null,
      aftercare,
    });
    res.status(201).json({ message: 'Đã lưu kết quả cuộc gọi', data: log });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] GET /follow-ups/calls/history — các cuộc gọi đã lưu, mới nhất trước
const getCallHistory = async (req, res) => {
  try {
    const [customersRes, staffRes] = await Promise.all([fetchIdentity(req, '/users/customers'), fetchIdentity(req, '/users')]);
    const customers = customersRes || [];
    const staff = staffRes || [];
    const logs = await FollowUpLog.findAll({
      where: { call_type: { [Op.ne]: null } },
      order: [['createdAt', 'DESC']],
      limit: 200,
      raw: true,
    });
    res.status(200).json({
      data: logs.map((log) => {
        const caller = staff.find((u) => u.id === log.consultant_id);
        return {
          ...log,
          ...patientOf(customers, log.customer_id, log.patient_profile_id),
          consultant_name: caller?.Profile?.full_name || caller?.full_name || caller?.email || '',
        };
      }),
    });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { getCallLists, saveCall, getCallHistory };
