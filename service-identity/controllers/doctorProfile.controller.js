const { User, Profile, DoctorProfile } = require('../models');

// Các trường hồ sơ chuyên môn được phép công khai cho khách
// (session_fee là thù lao nội bộ => KHÔNG nằm trong danh sách này)
const PUBLIC_FIELDS = ['title', 'specialty', 'workplace', 'experience_years', 'license_number', 'bio', 'education', 'work_history', 'certificates', 'expertise', 'consult_field'];

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

// Chuỗi: cắt khoảng trắng, giới hạn độ dài; rỗng => null
const cleanText = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

// Danh sách chuỗi (chứng chỉ, thế mạnh): bỏ dòng trống, tối đa `limit` dòng
const cleanList = (v, limit = 20, max = 200) =>
  (Array.isArray(v) ? v : [])
    .map((x) => cleanText(x, max))
    .filter(Boolean)
    .slice(0, limit);

// Quá trình đào tạo: [{ degree, school, year }]
const cleanEducation = (v) => {
  const thisYear = new Date().getFullYear();
  return (Array.isArray(v) ? v : [])
    .map((e) => {
      const year = Number(e?.year);
      return {
        degree: cleanText(e?.degree, 150),
        school: cleanText(e?.school, 200),
        year: Number.isInteger(year) && year >= 1950 && year <= thisYear ? year : null,
      };
    })
    .filter((e) => e.degree && e.school)
    .slice(0, 10);
};

// Kinh nghiệm công tác: [{ position, place, from, to }], to = null nghĩa là đang làm. Sắp xếp mới nhất lên đầu.
const cleanWorkHistory = (v) => {
  const thisYear = new Date().getFullYear();
  const toYear = (y) => {
    const n = Number(y);
    return y !== '' && y != null && Number.isInteger(n) && n >= 1950 && n <= thisYear ? n : null;
  };
  return (Array.isArray(v) ? v : [])
    .map((w) => ({ position: cleanText(w?.position, 150), place: cleanText(w?.place, 200), from: toYear(w?.from), to: toYear(w?.to) }))
    .filter((w) => w.position && w.place && w.from && (w.to === null || w.to >= w.from))
    .sort((a, b) => (b.to ?? 9999) - (a.to ?? 9999) || b.from - a.from)
    .slice(0, 10);
};

const toPublic = (user) => {
  const dp = user.DoctorProfile || {};
  const detail = Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, dp[f] ?? null]));
  return {
    id: user.id,
    full_name: user.Profile?.full_name || 'Bác sĩ',
    avatar: user.Profile?.avatar || null,
    gender: user.Profile?.gender || null,
    ...detail,
    education: dp.education || [],
    work_history: dp.work_history || [],
    certificates: dp.certificates || [],
    expertise: dp.expertise || [],
  };
};

// Vai trò có hồ sơ chuyên môn công khai: bác sĩ của phòng khám và chuyên gia tư vấn thỉnh giảng
const PROFESSIONAL_ROLES = ['DOCTOR', 'EXPERT'];
const CONSULT_FIELDS = ['DERMATOLOGY', 'NUTRITION', 'COSMETICS'];

// GET /users/doctors/public/:id — công khai: hồ sơ chuyên môn của 1 bác sĩ / chuyên gia đang làm việc
const getPublicDoctorDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ message: 'Không tìm thấy bác sĩ' });
    const user = await User.findOne({
      where: { id, role: PROFESSIONAL_ROLES, status: 'ACTIVE' },
      attributes: ['id'],
      include: [
        { model: Profile, attributes: ['full_name', 'avatar', 'gender'] },
        { model: DoctorProfile, attributes: PUBLIC_FIELDS },
      ],
    });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy bác sĩ' });
    res.status(200).json({ data: toPublic(user) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// Kiểm tra phần hồ sơ công khai của bác sĩ / chuyên gia (nhập trong Hồ sơ nhân sự); lỗi => ném lỗi có status 400
const buildProfessionalData = (role, b, actorId) => {
  const bad = (message) => Object.assign(new Error(message), { status: 400 });
  const isExpert = role === 'EXPERT';
  const years = b.experience_years === '' || b.experience_years == null ? null : Number(b.experience_years);
  if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) throw bad('Số năm kinh nghiệm phải là số nguyên từ 0 đến 60');
  if (isExpert && !CONSULT_FIELDS.includes(b.consult_field)) throw bad('Chọn lĩnh vực tư vấn của chuyên gia');
  const fee = b.session_fee === '' || b.session_fee == null ? null : Number(b.session_fee);
  if (isExpert && (!Number.isInteger(fee) || fee < 0 || fee > 10000000)) throw bad('Thù lao mỗi lượt tư vấn phải là số tiền từ 0 đến 10.000.000đ');
  const data = {
    title: cleanText(b.title, 50),
    specialty: cleanText(b.specialty, 150),
    workplace: cleanText(b.workplace, 200),
    experience_years: years,
    license_number: cleanText(b.license_number, 50),
    bio: cleanText(b.bio, 2000),
    education: cleanEducation(b.education),
    work_history: cleanWorkHistory(b.work_history),
    certificates: cleanList(b.certificates),
    expertise: cleanList(b.expertise, 15, 100),
    consult_field: isExpert ? b.consult_field : null,
    session_fee: isExpert ? fee : null,
    updated_by: actorId,
  };
  if (!data.specialty) throw bad('Vui lòng nhập chuyên khoa / chuyên môn');
  // Tư vấn da liễu là hoạt động chuyên môn y khoa: chuyên gia phải là bác sĩ có chứng chỉ hành nghề
  if (isExpert && b.consult_field === 'DERMATOLOGY' && (!/bs|bác sĩ|bác sỹ/i.test(data.title || '') || !data.license_number)) {
    throw bad('Lĩnh vực Da liễu chỉ dành cho bác sĩ: cần học hàm / học vị có BS và số chứng chỉ hành nghề');
  }
  return data;
};

const CARD_FIELDS = ['title', 'specialty', 'workplace', 'experience_years', 'consult_field'];
const toCard = (u, extra = {}) => ({
  id: u.id,
  full_name: u.Profile?.full_name || 'Chuyên gia',
  avatar: u.Profile?.avatar || null,
  ...Object.fromEntries(CARD_FIELDS.map((f) => [f, u.DoctorProfile?.[f] ?? null])),
  ...extra,
});

// GET /users/experts/public?field= — công khai: chuyên gia tư vấn đang hoạt động (đã có lĩnh vực)
const getPublicExperts = async (req, res) => {
  try {
    const where = req.query.field && CONSULT_FIELDS.includes(req.query.field) ? { consult_field: req.query.field } : {};
    const experts = await User.findAll({
      where: { role: 'EXPERT', status: 'ACTIVE' },
      attributes: ['id'],
      include: [
        { model: Profile, attributes: ['full_name', 'avatar'] },
        { model: DoctorProfile, attributes: CARD_FIELDS, where: { ...where, consult_field: where.consult_field || CONSULT_FIELDS }, required: true },
      ],
      order: [['createdAt', 'ASC']],
    });
    res.status(200).json({ data: experts.map((u) => toCard(u)) });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// GET /users/experts — Admin / Quản lý: kèm thù lao mỗi lượt tư vấn + trạng thái (để thống kê trả tiền cuối tháng)
const getExpertsForAdmin = async (req, res) => {
  try {
    const experts = await User.findAll({
      where: { role: 'EXPERT' },
      attributes: ['id', 'email', 'status'],
      include: [
        { model: Profile, attributes: ['full_name', 'avatar', 'phone'] },
        { model: DoctorProfile, attributes: [...CARD_FIELDS, 'session_fee'] },
      ],
      order: [['createdAt', 'ASC']],
    });
    res.status(200).json({
      data: experts.map((u) => toCard(u, { email: u.email, phone: u.Profile?.phone || null, status: u.status, session_fee: u.DoctorProfile?.session_fee ?? null })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

// GET /users/me/professional-profile — bác sĩ / chuyên gia xem hồ sơ của chính mình (chuyên gia thấy thù lao của mình)
const getMyProfessionalProfile = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.user.id, role: PROFESSIONAL_ROLES },
      attributes: ['id'],
      include: [{ model: Profile, attributes: ['full_name', 'avatar', 'gender'] }, { model: DoctorProfile }],
    });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy hồ sơ' });
    res.status(200).json({ data: { ...toPublic(user), session_fee: user.DoctorProfile?.session_fee ?? null } });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

module.exports = { getPublicDoctorDetail, buildProfessionalData, getPublicExperts, getExpertsForAdmin, getMyProfessionalProfile, PUBLIC_FIELDS, CONSULT_FIELDS };
