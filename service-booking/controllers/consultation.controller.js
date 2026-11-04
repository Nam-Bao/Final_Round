const dayjs = require('dayjs');
const axios = require('axios');
const { Op } = require('sequelize');
const { sequelize, Consultation, ExpertShift } = require('../models');
const { SHIFT_SLOTS } = require('../utils/shiftSlots');
const { generateRoomToken } = require('../utils/zegoToken');
const { maskName } = require('./review.controller');

// ===== QUY ĐỊNH TƯ VẤN CHUYÊN GIA =====
// Cọc 50k giữ chỗ. Buổi tư vấn hoàn thành => 50k được trừ vào phí khám của lần đặt khám tiếp theo (trong 30 ngày).
// Khách không vào phòng => mất cọc. Chuyên gia không vào / phòng khám hủy => hoàn cọc.
// Khách tự hủy => mất cọc (giống lịch khám).
const CONSULT_DEPOSIT = 50000;
const CONSULT_FIELDS = { DERMATOLOGY: 'Da liễu', NUTRITION: 'Dinh dưỡng', COSMETICS: 'Mỹ phẩm' };
const PAYMENT_HOLD_MINUTES = Number(process.env.PAYMENT_HOLD_MINUTES || 15);
const EXPERT_OPEN_BEFORE_MINUTES = 15; // chuyên gia vào phòng sớm để chuẩn bị; khách vào đúng giờ hẹn
const ROOM_CLOSE_AFTER_MINUTES = 60;
const CREDIT_VALID_DAYS = 30;
const STAFF_ROLES = ['ADMIN', 'GEN_MANAGER', 'CONSULTANT'];
const IDENTITY = 'http://localhost:4000/api/identity';

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && dayjs(v).format('YYYY-MM-DD') === v;
const startOf = (c) => dayjs(`${c.appointment_date} ${String(c.appointment_time).slice(0, 5)}`);
const holdExpiresAt = (c) => new Date(new Date(c.createdAt).getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000);
const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

class ConsultError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const sendError = (res, error) => {
  if (error instanceof ConsultError) return res.status(error.status).json({ message: error.message, ...error.extra });
  console.error('[Consultation]', error);
  return res.status(500).json({ message: 'Lỗi server', error: error.message });
};

// Chuyên gia đang hoạt động (đã có lĩnh vực) lấy từ identity; không gọi được => 503
const fetchExpert = async (expertId) => {
  const r = await axios.get(`${IDENTITY}/users/experts/public`).catch(() => null);
  if (!r) throw new ConsultError('Không kiểm tra được thông tin chuyên gia, vui lòng thử lại', 503);
  return (r.data?.data || []).find((e) => e.id === expertId) || null;
};

// ===== DỌN DẸP / CHỐT TRẠNG THÁI (gọi trước khi đọc danh sách + mỗi phút ở index.js) =====
const releaseExpiredConsultHolds = async () => {
  const n = await Consultation.destroy({
    where: { status: 'PENDING_PAYMENT', createdAt: { [Op.lt]: new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000) } }
  });
  if (n) console.log(`🧹 [TƯ VẤN] Đã giải phóng ${n} lịch tư vấn quá ${PAYMENT_HOLD_MINUTES} phút chưa cọc`);
};

// Phòng đã đóng mà lịch vẫn CONFIRMED => có bên không vào phòng
const settleFinishedConsultations = async () => {
  const list = await Consultation.findAll({ where: { status: 'CONFIRMED', appointment_date: { [Op.lte]: dayjs().format('YYYY-MM-DD') } } });
  const now = dayjs();
  for (const c of list) {
    if (now.isBefore(startOf(c).add(ROOM_CLOSE_AFTER_MINUTES, 'minute'))) continue;
    if (!c.expert_joined_at) {
      // Lỗi phía phòng khám => hoàn cọc cho khách
      await c.update({ status: 'EXPERT_ABSENT', deposit_outcome: 'REFUND_PENDING' });
    } else {
      // Chuyên gia có mặt, khách không vào => mất cọc
      await c.update({ status: 'NO_SHOW', deposit_outcome: 'FORFEITED' });
    }
  }
};

const runMaintenance = async () => {
  try {
    await releaseExpiredConsultHolds();
    await settleFinishedConsultations();
  } catch (err) { console.warn('[TƯ VẤN] Lỗi dọn lịch:', err.message); }
};

// ===== KHUNG GIỜ TRỐNG =====
const getSlotsFor = async (expert_id, date) => {
  const shifts = await ExpertShift.findAll({ where: { expert_id, date }, raw: true });
  const taken = await Consultation.findAll({
    where: { expert_id, appointment_date: date, status: { [Op.ne]: 'CANCELLED' } },
    attributes: ['appointment_time'], raw: true
  });
  const takenTimes = taken.map((c) => String(c.appointment_time).slice(0, 5));
  const now = dayjs();
  return shifts
    .flatMap((s) => SHIFT_SLOTS[s.shift_type] || [])
    .sort()
    .map((time) => ({ time, available: !takenTimes.includes(time) && dayjs(`${date} ${time}`).isAfter(now) }));
};

// [PUBLIC] GET /consultations/slots?expert_id=&date=
const getAvailableConsultSlots = async (req, res) => {
  try {
    const { expert_id, date } = req.query;
    if (!isUuid(expert_id) || !isDate(date)) return res.status(400).json({ message: 'Thiếu chuyên gia hoặc ngày hợp lệ' });
    await releaseExpiredConsultHolds();
    res.status(200).json({ data: await getSlotsFor(expert_id, date) });
  } catch (error) { sendError(res, error); }
};

// ===== KHÁCH HÀNG =====
// [CUSTOMER] POST /consultations — giữ chỗ chờ cọc (15 phút)
const createConsultation = async (req, res) => {
  try {
    const { expert_id, appointment_date } = req.body;
    const time = String(req.body.appointment_time || '').slice(0, 5);
    const question = String(req.body.question || '').trim();

    if (!isUuid(expert_id) || !isDate(appointment_date) || !/^\d{2}:\d{2}$/.test(time)) {
      throw new ConsultError('Vui lòng chọn chuyên gia, ngày và giờ tư vấn');
    }
    if (question.length < 10 || question.length > 2000) {
      throw new ConsultError('Mô tả vấn đề cần tư vấn từ 10 đến 2000 ký tự để chuyên gia chuẩn bị trước');
    }
    if (!dayjs(`${appointment_date} ${time}`).isAfter(dayjs())) {
      throw new ConsultError('Không thể đặt lịch vào thời gian đã qua, vui lòng chọn giờ khác');
    }

    const expert = await fetchExpert(expert_id);
    if (!expert) throw new ConsultError('Chuyên gia không tồn tại hoặc đã ngừng nhận tư vấn', 404);

    // Tên khách chụp lại lúc đặt (chuyên gia không có quyền đọc danh sách khách hàng)
    const me = await axios.get(`${IDENTITY}/users/profile`, { headers: { Authorization: req.headers.authorization } }).catch(() => null);
    const customer_name = me?.data?.data?.Profile?.full_name || 'Khách hàng';

    await releaseExpiredConsultHolds();
    const consultation = await sequelize.transaction(async (t) => {
      // Khóa các ca của chuyên gia trong ngày => 2 khách bấm cùng lúc thì chỉ 1 người giữ được giờ
      const shifts = await ExpertShift.findAll({ where: { expert_id, date: appointment_date }, transaction: t, lock: t.LOCK.UPDATE });
      if (!shifts.some((s) => (SHIFT_SLOTS[s.shift_type] || []).includes(time))) {
        throw new ConsultError('Chuyên gia không nhận tư vấn vào giờ này, vui lòng chọn giờ khác');
      }
      const taken = await Consultation.count({
        where: { expert_id, appointment_date, appointment_time: { [Op.in]: [time, `${time}:00`] }, status: { [Op.ne]: 'CANCELLED' } },
        transaction: t
      });
      if (taken > 0) throw new ConsultError('Giờ này vừa có người đặt, vui lòng chọn giờ khác', 409);

      // Mỗi khách chỉ giữ 1 chỗ chưa cọc: chỗ cũ bỏ dở được trả lại
      await Consultation.destroy({ where: { customer_id: req.user.id, status: 'PENDING_PAYMENT' }, transaction: t });

      return Consultation.create({
        customer_id: req.user.id, customer_name,
        expert_id, expert_name: expert.full_name, consult_field: expert.consult_field,
        appointment_date, appointment_time: `${time}:00`, question,
        deposit_amount: CONSULT_DEPOSIT, status: 'PENDING_PAYMENT'
      }, { transaction: t });
    });

    res.status(201).json({ message: 'Đã giữ chỗ, vui lòng đặt cọc để xác nhận lịch tư vấn', data: { id: consultation.id } });
  } catch (error) { sendError(res, error); }
};

const toCustomerView = (c) => {
  const start = startOf(c);
  return {
    id: c.id,
    expert_id: c.expert_id,
    expert_name: c.expert_name,
    consult_field: c.consult_field,
    consult_field_label: CONSULT_FIELDS[c.consult_field] || c.consult_field,
    appointment_date: c.appointment_date,
    appointment_time: String(c.appointment_time).slice(0, 5),
    question: c.question,
    status: c.status,
    deposit_amount: Number(c.deposit_amount),
    deposit_outcome: c.deposit_outcome,
    cancel_initiator: c.cancel_initiator,
    cancel_reason: c.cancel_reason,
    expert_note: c.expert_note,
    recommend_exam: c.recommend_exam,
    rating: c.rating,
    review_comment: c.review_comment,
    room_opens_at: start.toISOString(),
    room_closes_at: start.add(ROOM_CLOSE_AFTER_MINUTES, 'minute').toISOString(),
    credit_used: !!c.credit_appointment_id,
    credit_available: c.status === 'COMPLETED' && !c.credit_appointment_id && c.deposit_outcome === 'NONE'
      && dayjs(c.completed_at).add(CREDIT_VALID_DAYS, 'day').isAfter(dayjs()),
    credit_expires_at: c.completed_at ? dayjs(c.completed_at).add(CREDIT_VALID_DAYS, 'day').toISOString() : null,
  };
};

// [CUSTOMER] GET /consultations/mine
const getMyConsultations = async (req, res) => {
  try {
    await runMaintenance();
    const list = await Consultation.findAll({
      where: { customer_id: req.user.id, status: { [Op.ne]: 'PENDING_PAYMENT' } },
      order: [['appointment_date', 'DESC'], ['appointment_time', 'DESC']]
    });
    res.status(200).json({ data: list.map(toCustomerView) });
  } catch (error) { sendError(res, error); }
};

// [CUSTOMER] GET /consultations/:id/check-payment — trang thanh toán hỏi định kỳ
const checkConsultPayment = async (req, res) => {
  try {
    const c = await Consultation.findByPk(req.params.id);
    if (!c || c.customer_id !== req.user.id) {
      return res.status(404).json({ message: 'Lịch giữ chỗ đã hết hạn hoặc đã bị hủy, vui lòng đặt lại' });
    }
    res.status(200).json({
      isPaid: c.status !== 'PENDING_PAYMENT',
      amount: Number(c.deposit_amount),
      exam_fee: Number(c.deposit_amount),
      is_online: true,
      holdExpiresAt: c.status === 'PENDING_PAYMENT' ? holdExpiresAt(c) : null
    });
  } catch (error) { sendError(res, error); }
};

// [CUSTOMER] DELETE /consultations/:id/unpaid — rời trang thanh toán mà chưa cọc
const abandonUnpaidConsultation = async (req, res) => {
  try {
    const c = await Consultation.findByPk(req.params.id);
    if (!c) return res.status(200).json({ message: 'Lịch giữ chỗ đã được giải phóng' });
    if (c.customer_id !== req.user.id) return res.status(403).json({ message: 'Bạn không có quyền với lịch tư vấn này' });
    if (c.status !== 'PENDING_PAYMENT') return res.status(409).json({ message: 'Lịch tư vấn đã được đặt cọc' });
    await c.destroy();
    res.status(200).json({ message: 'Đã hủy giữ chỗ' });
  } catch (error) { sendError(res, error); }
};

// SePay báo có tiền với nội dung "TV xxxxxx" (6 ký tự đầu mã lịch tư vấn). Trả về true nếu đúng là mã tư vấn.
const handleConsultTransfer = async (content, transferAmount) => {
  const match = String(content || '').match(/(?<![a-z0-9])TV\s?([a-z0-9]{6})/i);
  if (!match) return false;
  const code = match[1].toLowerCase();
  const pending = await Consultation.findAll({ where: { status: 'PENDING_PAYMENT' } });
  const candidates = pending.filter((c) => c.id.toLowerCase().startsWith(code));
  if (candidates.length !== 1) {
    console.warn(`⚠️ [SEPAY] Nhận ${transferAmount}đ mã TV ${code} nhưng khớp ${candidates.length} lịch tư vấn chờ cọc, cần đối soát tay`);
    return true;
  }
  const c = candidates[0];
  if (Number(transferAmount) >= Number(c.deposit_amount)) {
    await c.update({ status: 'CONFIRMED', paid_at: new Date(), payment_method: 'VIETQR' });
  }
  return true;
};

// [CUSTOMER / STAFF] PUT /consultations/:id/cancel — cùng quy định với hủy lịch khám
const cancelConsultation = async (req, res) => {
  const isCustomer = req.user.role === 'CUSTOMER';
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const initiator = isCustomer ? 'CUSTOMER' : req.body.initiator;
  try {
    if (!isCustomer) {
      if (!['CUSTOMER', 'CLINIC'].includes(initiator)) throw new ConsultError('Chọn bên yêu cầu hủy: khách hàng hay phòng khám');
      if (reason.length < 10) throw new ConsultError('Nhập lý do hủy (ít nhất 10 ký tự) để lưu hồ sơ');
    }
    const result = await sequelize.transaction(async (t) => {
      const c = await Consultation.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!c) throw new ConsultError('Không tìm thấy lịch tư vấn', 404);
      if (isCustomer && c.customer_id !== req.user.id) throw new ConsultError('Bạn không có quyền hủy lịch của người khác', 403);
      const started = !dayjs().isBefore(startOf(c));
      // Khách chỉ hủy được trước giờ hẹn; nhân viên hủy được tới khi phòng đóng (VD chuyên gia báo bận đột xuất)
      const closed = !dayjs().isBefore(startOf(c).add(ROOM_CLOSE_AFTER_MINUTES, 'minute'));
      if (c.status !== 'CONFIRMED' || (isCustomer ? started : closed)) {
        throw new ConsultError('Lịch tư vấn đã diễn ra, đã kết thúc hoặc đã hủy, không thể hủy nữa');
      }
      const deposit = Number(c.deposit_amount);
      if (isCustomer && req.body.accept_forfeit !== true) {
        throw new ConsultError(`Hủy lịch này bạn sẽ mất ${money(deposit)} tiền cọc. Vui lòng xác nhận để tiếp tục.`, 409, { code: 'CONFIRM_FORFEIT', deposit_paid: deposit });
      }
      const deposit_outcome = initiator === 'CLINIC' ? 'REFUND_PENDING' : 'FORFEITED';
      await c.update({
        status: 'CANCELLED', cancel_initiator: initiator, cancel_reason: reason || null,
        cancelled_by: req.user.id, cancelled_at: new Date(), deposit_outcome
      }, { transaction: t });
      return { deposit_outcome, deposit };
    });
    const messages = {
      FORFEITED: `Đã hủy lịch tư vấn. Tiền cọc ${money(result.deposit)} không được hoàn theo chính sách.`,
      REFUND_PENDING: `Đã hủy lịch tư vấn. Khách được hoàn ${money(result.deposit)} tiền cọc, vui lòng liên hệ khách để hoàn tiền.`,
    };
    res.status(200).json({ message: messages[result.deposit_outcome], ...result });
  } catch (error) { sendError(res, error); }
};

// [CUSTOMER] POST /consultations/:id/review — 1 lần, sau khi buổi tư vấn hoàn thành
const reviewConsultation = async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || '').trim().slice(0, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ConsultError('Chọn số sao từ 1 đến 5');
    const c = await Consultation.findByPk(req.params.id);
    if (!c || c.customer_id !== req.user.id) throw new ConsultError('Không tìm thấy lịch tư vấn', 404);
    if (c.status !== 'COMPLETED') throw new ConsultError('Chỉ đánh giá được buổi tư vấn đã hoàn thành');
    if (c.rating) throw new ConsultError('Bạn đã đánh giá buổi tư vấn này', 409);
    await c.update({ rating, review_comment: comment || null, reviewed_at: new Date() });
    res.status(200).json({ message: 'Cảm ơn bạn đã đánh giá!' });
  } catch (error) { sendError(res, error); }
};

// ===== PHÒNG VIDEO (khách + chuyên gia của đúng lịch) =====
// [CUSTOMER / EXPERT] GET /consultations/:id/video-token
const getConsultVideoToken = async (req, res) => {
  try {
    const appID = Number(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SERVER_SECRET;
    if (!appID || !serverSecret) throw new ConsultError('Server chưa cấu hình ZEGO_APP_ID / ZEGO_SERVER_SECRET', 500);

    const c = await Consultation.findByPk(req.params.id);
    if (!c) throw new ConsultError('Không tìm thấy lịch tư vấn', 404);
    const userID = String(req.user.id);
    const isExpert = userID === c.expert_id;
    if (userID !== c.customer_id && !isExpert) throw new ConsultError('Bạn không thuộc lịch tư vấn này', 403);
    if (!['CONFIRMED', 'COMPLETED'].includes(c.status)) throw new ConsultError('Lịch tư vấn chưa đặt cọc, đã kết thúc hoặc đã hủy');

    const start = startOf(c);
    const end = start.add(ROOM_CLOSE_AFTER_MINUTES, 'minute');
    const opensAt = isExpert ? start.subtract(EXPERT_OPEN_BEFORE_MINUTES, 'minute') : start;
    const now = dayjs();
    if (now.isBefore(opensAt)) {
      throw new ConsultError(
        isExpert
          ? `Phòng tư vấn mở trước giờ hẹn ${EXPERT_OPEN_BEFORE_MINUTES} phút (lúc ${opensAt.format('HH:mm DD/MM/YYYY')}).`
          : `Chưa đến giờ hẹn. Buổi tư vấn bắt đầu lúc ${start.format('HH:mm')} ngày ${start.format('DD/MM/YYYY')}, bạn vui lòng quay lại đúng giờ.`,
        400, { code: 'NOT_STARTED', opens_at: opensAt.toISOString() }
      );
    }
    if (now.isAfter(end)) throw new ConsultError('Đã quá giờ của buổi tư vấn này', 400, { code: 'ENDED' });

    // Ghi nhận lần đầu vào phòng của mỗi bên = bằng chứng buổi tư vấn diễn ra (căn cứ trả thù lao)
    const patch = {};
    if (isExpert && !c.expert_joined_at) patch.expert_joined_at = new Date();
    if (!isExpert && !c.customer_joined_at) patch.customer_joined_at = new Date();
    const expertIn = c.expert_joined_at || patch.expert_joined_at;
    const customerIn = c.customer_joined_at || patch.customer_joined_at;
    if (c.status === 'CONFIRMED' && expertIn && customerIn) Object.assign(patch, { status: 'COMPLETED', completed_at: new Date() });
    if (Object.keys(patch).length) await c.update(patch);

    const roomID = `glowskin_tv_${c.id}`;
    const token = generateRoomToken(appID, userID, serverSecret, roomID, Math.max(end.diff(now, 'second'), 60));
    res.status(200).json({ data: { appID, userID, roomID, token } });
  } catch (error) { sendError(res, error); }
};

// ===== CHUYÊN GIA =====
const toExpertView = (c) => ({
  ...toCustomerView(c),
  customer_name: c.customer_name,
  customer_joined: !!c.customer_joined_at,
  expert_joined: !!c.expert_joined_at,
});

const monthRange = (month) => {
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? dayjs(`${month}-01`) : dayjs().startOf('month');
  return { from: m.startOf('month').format('YYYY-MM-DD'), to: m.endOf('month').format('YYYY-MM-DD'), month: m.format('YYYY-MM') };
};

// [EXPERT] GET /consultations/expert/mine — lịch tư vấn của chính chuyên gia (đã cọc trở đi)
const getExpertConsultations = async (req, res) => {
  try {
    await runMaintenance();
    const list = await Consultation.findAll({
      where: { expert_id: req.user.id, status: { [Op.ne]: 'PENDING_PAYMENT' } },
      order: [['appointment_date', 'DESC'], ['appointment_time', 'DESC']],
      limit: 300
    });
    res.status(200).json({ data: list.map(toExpertView) });
  } catch (error) { sendError(res, error); }
};

// [EXPERT] PUT /consultations/:id/note — ghi chú tư vấn gửi khách
const saveExpertNote = async (req, res) => {
  try {
    const note = String(req.body.expert_note || '').trim();
    if (note.length < 10 || note.length > 3000) throw new ConsultError('Ghi chú tư vấn từ 10 đến 3000 ký tự');
    const c = await Consultation.findByPk(req.params.id);
    if (!c || c.expert_id !== req.user.id) throw new ConsultError('Không tìm thấy lịch tư vấn', 404);
    if (c.status !== 'COMPLETED') throw new ConsultError('Chỉ ghi chú được buổi tư vấn đã diễn ra');
    await c.update({ expert_note: note, recommend_exam: req.body.recommend_exam === true });
    res.status(200).json({ message: 'Đã gửi ghi chú tư vấn cho khách' });
  } catch (error) { sendError(res, error); }
};

// Thống kê theo chuyên gia trong 1 tháng (căn cứ trả thù lao = số ca COMPLETED)
const buildStats = async ({ from, to }, expertId) => {
  const where = { appointment_date: { [Op.between]: [from, to] }, status: { [Op.ne]: 'PENDING_PAYMENT' } };
  if (expertId) where.expert_id = expertId;
  const rows = await Consultation.findAll({ where, raw: true });
  const byExpert = {};
  for (const c of rows) {
    const s = byExpert[c.expert_id] ||= {
      expert_id: c.expert_id, expert_name: c.expert_name, consult_field: c.consult_field,
      completed: 0, no_show: 0, expert_absent: 0, cancelled: 0, upcoming: 0, rating_total: 0, rating_count: 0, deposits_kept: 0
    };
    if (c.status === 'COMPLETED') s.completed += 1;
    else if (c.status === 'NO_SHOW') s.no_show += 1;
    else if (c.status === 'EXPERT_ABSENT') s.expert_absent += 1;
    else if (c.status === 'CANCELLED') s.cancelled += 1;
    else if (c.status === 'CONFIRMED') s.upcoming += 1;
    if (c.rating) { s.rating_total += c.rating; s.rating_count += 1; }
    if (c.paid_at && ['NONE', 'FORFEITED'].includes(c.deposit_outcome)) s.deposits_kept += Number(c.deposit_amount);
  }
  return Object.values(byExpert).map(({ rating_total, ...s }) => ({
    ...s, avg_rating: s.rating_count ? Number((rating_total / s.rating_count).toFixed(1)) : null
  }));
};

// [EXPERT] GET /consultations/expert/stats?month=YYYY-MM
const getMyExpertStats = async (req, res) => {
  try {
    await runMaintenance();
    const range = monthRange(req.query.month);
    const [stats] = await buildStats(range, req.user.id);
    res.status(200).json({ data: { month: range.month, ...(stats || { completed: 0, no_show: 0, expert_absent: 0, cancelled: 0, upcoming: 0, avg_rating: null, rating_count: 0 }) } });
  } catch (error) { sendError(res, error); }
};

// ===== NHÂN VIÊN / QUẢN LÝ =====
// [STAFF] GET /consultations?month=&status=
const getAllConsultations = async (req, res) => {
  try {
    await runMaintenance();
    const { from, to } = monthRange(req.query.month);
    const where = { appointment_date: { [Op.between]: [from, to] }, status: { [Op.ne]: 'PENDING_PAYMENT' } };
    if (['CONFIRMED', 'COMPLETED', 'NO_SHOW', 'EXPERT_ABSENT', 'CANCELLED'].includes(req.query.status)) where.status = req.query.status;
    if (req.query.refund === 'pending') { delete where.appointment_date; where.deposit_outcome = 'REFUND_PENDING'; }
    const list = await Consultation.findAll({ where, order: [['appointment_date', 'DESC'], ['appointment_time', 'DESC']] });
    res.status(200).json({
      data: list.map((c) => ({ ...toExpertView(c), customer_id: c.customer_id, paid_at: c.paid_at, refund_ref: c.refund_ref, refunded_at: c.refunded_at }))
    });
  } catch (error) { sendError(res, error); }
};

// [STAFF] PUT /consultations/:id/refund — ghi nhận đã chuyển khoản hoàn cọc
const confirmConsultRefund = async (req, res) => {
  try {
    const refund_ref = String(req.body.refund_ref || '').trim();
    if (refund_ref.length < 4 || refund_ref.length > 50) throw new ConsultError('Nhập mã giao dịch chuyển khoản hoàn cọc (4 - 50 ký tự)');
    await sequelize.transaction(async (t) => {
      const c = await Consultation.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!c || c.deposit_outcome !== 'REFUND_PENDING') throw new ConsultError('Lịch này không có khoản cọc chờ hoàn');
      await c.update({ deposit_outcome: 'REFUNDED', refund_ref, refunded_by: req.user.id, refunded_at: new Date() }, { transaction: t });
    });
    res.status(200).json({ message: 'Đã ghi nhận hoàn cọc cho khách' });
  } catch (error) { sendError(res, error); }
};

// [ADMIN / GEN_MANAGER] GET /consultations/stats?month=YYYY-MM — thống kê trả thù lao chuyên gia
const getConsultStats = async (req, res) => {
  try {
    await runMaintenance();
    const range = monthRange(req.query.month);
    res.status(200).json({ data: { month: range.month, experts: await buildStats(range) } });
  } catch (error) { sendError(res, error); }
};

// ===== CA RẢNH CỦA CHUYÊN GIA =====
// [STAFF / EXPERT] GET /consultations/shifts?from=&to=&expert_id= (chuyên gia chỉ xem ca của mình)
const getExpertShifts = async (req, res) => {
  try {
    const from = isDate(req.query.from) ? req.query.from : dayjs().format('YYYY-MM-DD');
    const to = isDate(req.query.to) ? req.query.to : dayjs(from).add(30, 'day').format('YYYY-MM-DD');
    const where = { date: { [Op.between]: [from, to] } };
    if (req.user.role === 'EXPERT') where.expert_id = req.user.id;
    else if (isUuid(req.query.expert_id)) where.expert_id = req.query.expert_id;
    const shifts = await ExpertShift.findAll({ where, order: [['date', 'ASC'], ['shift_type', 'ASC']] });
    res.status(200).json({ data: shifts });
  } catch (error) { sendError(res, error); }
};

// [ADMIN / GEN_MANAGER] POST /consultations/shifts { expert_id, dates: [], shift_types: [] }
const createExpertShifts = async (req, res) => {
  try {
    const { expert_id } = req.body;
    const dates = [...new Set(Array.isArray(req.body.dates) ? req.body.dates : [])];
    const types = [...new Set(Array.isArray(req.body.shift_types) ? req.body.shift_types : [])];
    if (!isUuid(expert_id)) throw new ConsultError('Chọn chuyên gia');
    if (!dates.length || dates.length > 62 || !dates.every(isDate)) throw new ConsultError('Chọn từ 1 đến 62 ngày hợp lệ');
    if (dates.some((d) => dayjs(d).isBefore(dayjs(), 'day'))) throw new ConsultError('Không mở ca cho ngày đã qua');
    if (!types.length || !types.every((s) => SHIFT_SLOTS[s])) throw new ConsultError('Chọn ca: sáng, chiều hoặc tối');
    if (!(await fetchExpert(expert_id))) throw new ConsultError('Chuyên gia không hoạt động hoặc chưa có lĩnh vực tư vấn', 404);

    const rows = dates.flatMap((date) => types.map((shift_type) => ({ expert_id, date, shift_type, created_by: req.user.id })));
    const created = await ExpertShift.bulkCreate(rows, { ignoreDuplicates: true });
    res.status(201).json({ message: `Đã mở ${rows.length} ca tư vấn (ca đã có được giữ nguyên)`, data: created.length });
  } catch (error) { sendError(res, error); }
};

// [ADMIN / GEN_MANAGER] DELETE /consultations/shifts/:id — chỉ đóng được ca chưa có khách đặt
const deleteExpertShift = async (req, res) => {
  try {
    const shift = await ExpertShift.findByPk(req.params.id);
    if (!shift) throw new ConsultError('Không tìm thấy ca', 404);
    const times = SHIFT_SLOTS[shift.shift_type].flatMap((t) => [t, `${t}:00`]);
    const booked = await Consultation.count({
      where: { expert_id: shift.expert_id, appointment_date: shift.date, appointment_time: { [Op.in]: times }, status: { [Op.in]: ['PENDING_PAYMENT', 'CONFIRMED'] } }
    });
    if (booked) throw new ConsultError('Ca này đã có khách đặt. Hãy hủy lịch tư vấn (phòng khám hủy, hoàn cọc) trước khi đóng ca', 409);
    await shift.destroy();
    res.status(200).json({ message: 'Đã đóng ca tư vấn' });
  } catch (error) { sendError(res, error); }
};

// ===== CÔNG KHAI: điểm đánh giá & nhận xét của chuyên gia =====
// [PUBLIC] GET /consultations/expert-stats
const getPublicExpertStats = async (req, res) => {
  try {
    const rows = await Consultation.findAll({ where: { status: 'COMPLETED' }, attributes: ['expert_id', 'rating'], raw: true });
    const stats = {};
    for (const r of rows) {
      const s = stats[r.expert_id] ||= { completed: 0, rating_total: 0, review_count: 0 };
      s.completed += 1;
      if (r.rating) { s.rating_total += r.rating; s.review_count += 1; }
    }
    const data = Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, {
      completed: s.completed, review_count: s.review_count,
      avg_rating: s.review_count ? Number((s.rating_total / s.review_count).toFixed(1)) : null
    }]));
    res.status(200).json({ data });
  } catch (error) { sendError(res, error); }
};

// [PUBLIC] GET /consultations/reviews?expert_id=
const getPublicConsultReviews = async (req, res) => {
  try {
    if (!isUuid(req.query.expert_id)) return res.status(200).json({ data: [] });
    const rows = await Consultation.findAll({
      where: { expert_id: req.query.expert_id, status: 'COMPLETED', rating: { [Op.ne]: null } },
      order: [['reviewed_at', 'DESC']], limit: 20
    });
    res.status(200).json({
      data: rows.map((c) => ({ id: c.id, customer_name: maskName(c.customer_name), rating: c.rating, comment: c.review_comment || '', createdAt: c.reviewed_at }))
    });
  } catch (error) { sendError(res, error); }
};

// ===== TRỪ CỌC TƯ VẤN VÀO PHÍ KHÁM (service lịch khám gọi) =====
// Buổi tư vấn đã hoàn thành, cọc chưa hoàn, chưa trừ lần nào, còn trong hạn 30 ngày
const findAvailableCredit = (customer_id, transaction) => Consultation.findOne({
  where: {
    customer_id, status: 'COMPLETED', deposit_outcome: 'NONE', credit_appointment_id: null, paid_at: { [Op.ne]: null },
    completed_at: { [Op.gte]: dayjs().subtract(CREDIT_VALID_DAYS, 'day').toDate() }
  },
  order: [['completed_at', 'ASC']],
  transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined
});

// Tổng tiền cọc tư vấn đã gắn vào 1 lịch khám
const getCreditForAppointment = async (appointment_id) =>
  Number((await Consultation.sum('deposit_amount', { where: { credit_appointment_id: appointment_id } })) || 0);

// Lịch khám bị hủy / bỏ giữ chỗ => trả lại phần cọc tư vấn để dùng cho lần đặt khám sau
const releaseCredit = (appointmentIds, transaction) =>
  Consultation.update({ credit_appointment_id: null }, { where: { credit_appointment_id: { [Op.in]: [].concat(appointmentIds) } }, transaction });

module.exports = {
  CONSULT_FIELDS,
  runMaintenance,
  getAvailableConsultSlots,
  createConsultation,
  getMyConsultations,
  checkConsultPayment,
  abandonUnpaidConsultation,
  handleConsultTransfer,
  cancelConsultation,
  reviewConsultation,
  getConsultVideoToken,
  getExpertConsultations,
  saveExpertNote,
  getMyExpertStats,
  getAllConsultations,
  confirmConsultRefund,
  getConsultStats,
  getExpertShifts,
  createExpertShifts,
  deleteExpertShift,
  getPublicExpertStats,
  getPublicConsultReviews,
  findAvailableCredit,
  getCreditForAppointment,
  releaseCredit,
  STAFF_ROLES,
};
