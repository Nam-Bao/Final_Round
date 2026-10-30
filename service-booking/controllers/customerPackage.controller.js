const axios = require('axios');
const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { CustomerPackage, TreatmentPackage, TreatmentSession, ServiceSession, WorkShift } = require('../models');

// Số ngày tối đa khách được đặt trước cho buổi liệu trình tiếp theo
const BOOK_AHEAD_DAYS = 30;
const DATE_FORMAT = 'YYYY-MM-DD';

// Mã các KTV đang làm việc (service-identity, chỉ trả về mã)
const fetchTechnicianIds = async (authorization) => {
  const res = await axios.get('http://localhost:4000/api/identity/users/technician-ids', { headers: { Authorization: authorization } });
  return res.data.data || [];
};

// Ngày có KTV trực (ca SCHEDULED / ATTENDED) trong khoảng [from, to]: { 'YYYY-MM-DD': [technicianId, ...] }
const getTechnicianDays = async (technicianIds, from, to) => {
  if (!technicianIds.length || from > to) return {};
  const shifts = await WorkShift.findAll({
    where: { employee_id: technicianIds, date: { [Op.between]: [from, to] }, status: { [Op.in]: ['SCHEDULED', 'ATTENDED'] } },
    raw: true
  });
  return shifts.reduce((acc, s) => {
    acc[s.date] ??= [];
    if (!acc[s.date].includes(s.employee_id)) acc[s.date].push(s.employee_id);
    return acc;
  }, {});
};

// Trạng thái đặt lịch của 1 gói: buổi đã làm, buổi sắp tới, hạn dùng, ngày sớm nhất được đặt buổi tiếp theo
const describePackage = (cp) => {
  const pkg = cp.TreatmentPackage;
  const sessions = [...(cp.TreatmentSessions || [])].sort((a, b) => a.session_number - b.session_number);
  const completed = sessions.filter(s => s.status === 'COMPLETED');
  const upcoming = sessions.find(s => s.status !== 'COMPLETED') || null;
  const today = dayjs().format(DATE_FORMAT);
  const expiresAt = dayjs(cp.createdAt).add(pkg?.validity_days || 90, 'day').format(DATE_FORMAT);
  const lastDate = sessions.length ? sessions[sessions.length - 1].session_date : null;
  const intervalReady = lastDate ? dayjs(lastDate).add(pkg?.interval_days || 0, 'day').format(DATE_FORMAT) : today;
  const earliest = intervalReady > today ? intervalReady : today;

  let blockReason = null;
  if (cp.status !== 'ACTIVE') blockReason = cp.status === 'COMPLETED' ? 'Gói đã hoàn thành' : 'Gói đã hủy';
  else if (sessions.length >= cp.total_sessions) blockReason = 'Đã đặt đủ số buổi của gói';
  else if (upcoming) blockReason = 'Bạn đang có buổi chưa thực hiện, hãy hoàn thành buổi đó trước';
  else if (today > expiresAt) blockReason = 'Gói đã hết hạn sử dụng';
  else if (earliest > expiresAt) blockReason = 'Không còn ngày phù hợp trước khi gói hết hạn';

  return {
    sessions, completed, upcoming, expiresAt, earliest, blockReason,
    latest: [expiresAt, dayjs().add(BOOK_AHEAD_DAYS, 'day').format(DATE_FORMAT)].sort()[0]
  };
};

const findMyPackage = (id, customerId) => CustomerPackage.findOne({
  where: { id, customer_id: customerId },
  include: [{ model: TreatmentPackage }, { model: TreatmentSession }]
});

// [CUSTOMER] GET /packages/mine — các gói đã mua, tiến độ và những ngày đặt được buổi tiếp theo
exports.getMyPackages = async (req, res) => {
  try {
    const packages = await CustomerPackage.findAll({
      where: { customer_id: req.user.id },
      include: [{ model: TreatmentPackage }, { model: TreatmentSession }],
      order: [['createdAt', 'DESC']]
    });

    const technicianIds = packages.length ? await fetchTechnicianIds(req.headers.authorization).catch(() => []) : [];
    const data = await Promise.all(packages.map(async (cp) => {
      const info = describePackage(cp);
      const days = info.blockReason ? {} : await getTechnicianDays(technicianIds, info.earliest, info.latest);
      return {
        id: cp.id,
        package_id: cp.package_id,
        name: cp.TreatmentPackage?.name || 'Gói liệu trình',
        thumbnail_url: cp.TreatmentPackage?.thumbnail_url || null,
        interval_days: cp.TreatmentPackage?.interval_days || 0,
        status: cp.status,
        total_sessions: cp.total_sessions,
        completed_sessions: info.completed.length,
        remaining_sessions: cp.remaining_sessions,
        purchased_at: cp.createdAt,
        expires_at: info.expiresAt,
        sessions: info.sessions.map(s => ({ id: s.id, session_number: s.session_number, session_date: s.session_date, status: s.status })),
        upcoming: info.upcoming ? { id: info.upcoming.id, session_number: info.upcoming.session_number, session_date: info.upcoming.session_date, status: info.upcoming.status } : null,
        can_book: !info.blockReason && Object.keys(days).length > 0,
        block_reason: info.blockReason || (Object.keys(days).length ? null : 'Chưa có lịch kỹ thuật viên trong thời gian tới, vui lòng liên hệ CSKH'),
        available_dates: Object.keys(days).sort()
      };
    }));
    res.status(200).json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tải gói liệu trình', error: error.message });
  }
};

// [CUSTOMER] POST /packages/mine/:id/sessions — body: { session_date }. Đặt buổi tiếp theo của gói đã mua.
exports.bookNextSession = async (req, res) => {
  try {
    const { session_date } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session_date || '') || !dayjs(session_date).isValid()) {
      return res.status(400).json({ message: 'Ngày hẹn không hợp lệ' });
    }
    const cp = await findMyPackage(req.params.id, req.user.id);
    if (!cp) return res.status(404).json({ message: 'Không tìm thấy gói liệu trình của bạn' });

    const info = describePackage(cp);
    if (info.blockReason) return res.status(400).json({ message: info.blockReason });
    if (session_date < info.earliest) {
      return res.status(400).json({ message: `Buổi tiếp theo cần cách buổi trước tối thiểu ${cp.TreatmentPackage?.interval_days || 0} ngày, sớm nhất từ ${dayjs(info.earliest).format('DD/MM/YYYY')}` });
    }
    if (session_date > info.latest) {
      return res.status(400).json({ message: `Chỉ đặt được đến ngày ${dayjs(info.latest).format('DD/MM/YYYY')}` });
    }

    // Giao cho KTV có ca hôm đó và đang ít buổi nhất
    const technicianIds = await fetchTechnicianIds(req.headers.authorization);
    const onDuty = (await getTechnicianDays(technicianIds, session_date, session_date))[session_date] || [];
    if (!onDuty.length) return res.status(400).json({ message: 'Ngày này chưa có kỹ thuật viên làm việc, vui lòng chọn ngày khác' });
    let technicianId = onDuty[0];
    let minLoad = Infinity;
    for (const ktv of onDuty) {
      const load = await TreatmentSession.count({ where: { session_date, technician_id: ktv } })
        + await ServiceSession.count({ where: { session_date, technician_id: ktv } });
      if (load < minLoad) { minLoad = load; technicianId = ktv; }
    }

    const session = await TreatmentSession.create({
      customer_package_id: cp.id,
      patient_profile_id: info.sessions[0]?.patient_profile_id, // cùng hồ sơ người khám với buổi đầu
      technician_id: technicianId,
      session_number: info.sessions.length + 1,
      session_date,
      status: 'SCHEDULED'
    });
    res.status(201).json({
      message: `Đã đặt buổi ${session.session_number} vào ngày ${dayjs(session_date).format('DD/MM/YYYY')}`,
      data: { id: session.id, session_number: session.session_number, session_date, status: session.status }
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi đặt buổi liệu trình', error: error.message });
  }
};

// [CUSTOMER] DELETE /packages/mine/sessions/:sessionId — hủy buổi đã đặt nhưng chưa thực hiện (để đặt ngày khác)
exports.cancelMySession = async (req, res) => {
  try {
    const session = await TreatmentSession.findByPk(req.params.sessionId, { include: [{ model: CustomerPackage }] });
    if (!session || session.CustomerPackage?.customer_id !== req.user.id) {
      return res.status(404).json({ message: 'Không tìm thấy buổi hẹn của bạn' });
    }
    if (session.status !== 'SCHEDULED') {
      return res.status(400).json({ message: 'Chỉ hủy được buổi đã đặt trước và chưa bắt đầu' });
    }
    if (session.session_date < dayjs().format(DATE_FORMAT)) {
      return res.status(400).json({ message: 'Buổi hẹn đã qua, vui lòng liên hệ CSKH' });
    }
    await session.destroy();
    res.status(200).json({ message: 'Đã hủy buổi hẹn, bạn có thể đặt lại ngày khác' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi hủy buổi hẹn', error: error.message });
  }
};
