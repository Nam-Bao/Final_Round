const { sequelize, User, Profile, DoctorProfile, EmployeeRecord } = require('../models');
const { ROLE_FIELDS, EXPIRY_FIELDS, visibleRoles } = require('../utils/staffRecordFields');
const { buildProfessionalData } = require('./doctorProfile.controller');

// Hồ sơ nhân sự: 1 tài khoản nhân viên = tối đa 1 hồ sơ.
// Họ tên, giới tính, ngày sinh, SĐT, ảnh lưu ở Profiles; hồ sơ công khai của bác sĩ / chuyên gia lưu ở DoctorProfiles.
// Xóa hồ sơ = xóa mềm (không đụng tới tài khoản, chấm công, lương); tạo lại cho tài khoản đó sẽ khôi phục bản cũ.

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'COLLABORATOR'];
const CONTRACT_TYPES = ['PROBATION', 'FIXED_TERM', 'INDEFINITE', 'SERVICE'];
const EMPLOYMENT_STATUSES = ['WORKING', 'ON_LEAVE', 'RESIGNED'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const MARITAL = ['SINGLE', 'MARRIED', 'OTHER'];
const EXPIRY_WARNING_DAYS = 30;

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(new Date(v).getTime());
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const fail = (res, error) => res.status(error.status || 500).json({ message: error.status ? error.message : 'Lỗi server', error: error.message });

const text = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw bad(`${label} tối đa ${max} ký tự`);
  return s || null;
};
const date = (v, label) => {
  if (v === null || v === undefined || v === '') return null;
  if (!isDate(v)) throw bad(`${label} không hợp lệ`);
  return String(v);
};
const oneOf = (v, list, label) => {
  if (!list.includes(v)) throw bad(`${label} không hợp lệ`);
  return v;
};
const required = (v, label) => {
  if (!v) throw bad(`Vui lòng nhập ${label}`);
  return v;
};

// Tài khoản nhân viên mà người gọi được quản lý hồ sơ
const loadAccount = async (actor, userId, options = {}) => {
  if (!isUuid(userId)) throw bad('Không tìm thấy tài khoản', 404);
  const user = await User.findOne({ where: { id: userId, role: visibleRoles(actor.role) }, attributes: ['id', 'email', 'role', 'status'], ...options });
  if (!user) throw bad('Không tìm thấy tài khoản nhân viên hoặc bạn không có quyền với hồ sơ này', 404);
  return user;
};

// Kiểm tra dữ liệu hồ sơ gửi lên; trả về { profile, record }
const parseBody = (b, role) => {
  const profile = {
    full_name: required(text(b.full_name, 100, 'Họ tên'), 'họ tên'),
    gender: oneOf(b.gender, GENDERS, 'Giới tính'),
    dob: required(date(b.dob, 'Ngày sinh'), 'ngày sinh'),
    phone: required(text(b.phone, 15, 'Số điện thoại'), 'số điện thoại'),
  };
  if (!/^0\d{9,10}$/.test(profile.phone)) throw bad('Số điện thoại không hợp lệ');
  const age = (new Date() - new Date(profile.dob)) / (365.25 * 86400000);
  if (age < 15 || age > 100) throw bad('Ngày sinh không hợp lệ (nhân viên phải từ đủ 15 tuổi)');
  if ('avatar' in b) {
    profile.avatar = text(b.avatar, 500, 'Ảnh đại diện');
    if (profile.avatar && !/^https:\/\/\S+$/.test(profile.avatar)) throw bad('Ảnh đại diện phải là đường dẫn https hợp lệ');
  }

  const record = {
    national_id: required(text(b.national_id, 12, 'Số CCCD'), 'số CCCD'),
    national_id_issue_date: date(b.national_id_issue_date, 'Ngày cấp CCCD'),
    national_id_issue_place: text(b.national_id_issue_place, 200, 'Nơi cấp CCCD'),
    permanent_address: required(text(b.permanent_address, 300, 'Địa chỉ thường trú'), 'địa chỉ thường trú'),
    current_address: text(b.current_address, 300, 'Địa chỉ hiện tại'),
    nationality: text(b.nationality, 50, 'Quốc tịch') || 'Việt Nam',
    ethnicity: text(b.ethnicity, 50, 'Dân tộc'),
    marital_status: b.marital_status ? oneOf(b.marital_status, MARITAL, 'Tình trạng hôn nhân') : null,
    education_level: text(b.education_level, 100, 'Trình độ học vấn'),
    emergency_contact_name: required(text(b.emergency_contact_name, 100, 'Người liên hệ khẩn cấp'), 'người liên hệ khẩn cấp'),
    emergency_contact_relation: text(b.emergency_contact_relation, 50, 'Quan hệ'),
    emergency_contact_phone: required(text(b.emergency_contact_phone, 15, 'SĐT liên hệ khẩn cấp'), 'SĐT liên hệ khẩn cấp'),
    position: required(text(b.position, 100, 'Chức danh'), 'chức danh'),
    employment_type: oneOf(b.employment_type, EMPLOYMENT_TYPES, 'Hình thức làm việc'),
    employment_status: oneOf(b.employment_status || 'WORKING', EMPLOYMENT_STATUSES, 'Trạng thái làm việc'),
    start_date: required(date(b.start_date, 'Ngày vào làm'), 'ngày vào làm'),
    end_date: date(b.end_date, 'Ngày nghỉ việc'),
    contract_type: oneOf(b.contract_type, CONTRACT_TYPES, 'Loại hợp đồng'),
    contract_no: text(b.contract_no, 50, 'Số hợp đồng'),
    contract_start: date(b.contract_start, 'Ngày bắt đầu hợp đồng'),
    contract_end: date(b.contract_end, 'Ngày kết thúc hợp đồng'),
    tax_code: text(b.tax_code, 14, 'Mã số thuế'),
    social_insurance_no: text(b.social_insurance_no, 15, 'Số sổ BHXH'),
    bank_name: text(b.bank_name, 100, 'Ngân hàng'),
    bank_account_no: text(b.bank_account_no, 30, 'Số tài khoản'),
    bank_account_name: text(b.bank_account_name, 100, 'Tên chủ tài khoản'),
    health_check_date: date(b.health_check_date, 'Ngày khám sức khỏe'),
    notes: text(b.notes, 2000, 'Ghi chú'),
  };
  if (!/^\d{12}$/.test(record.national_id)) throw bad('Số CCCD phải gồm đúng 12 chữ số');
  if (!/^0\d{9,10}$/.test(record.emergency_contact_phone)) throw bad('SĐT liên hệ khẩn cấp không hợp lệ');
  if (record.tax_code && !/^\d{10}(-?\d{3})?$/.test(record.tax_code)) throw bad('Mã số thuế gồm 10 hoặc 13 chữ số');
  if (record.bank_account_no && !/^\d{6,30}$/.test(record.bank_account_no)) throw bad('Số tài khoản ngân hàng chỉ gồm chữ số');
  if (record.employment_status === 'RESIGNED' && !record.end_date) throw bad('Nhân viên đã nghỉ việc phải có ngày nghỉ');
  if (record.end_date && record.end_date < record.start_date) throw bad('Ngày nghỉ việc phải sau ngày vào làm');
  if (['PROBATION', 'FIXED_TERM', 'SERVICE'].includes(record.contract_type) && !record.contract_end) throw bad('Hợp đồng này phải có ngày kết thúc');
  if (record.contract_start && record.contract_end && record.contract_end <= record.contract_start) throw bad('Ngày kết thúc hợp đồng phải sau ngày bắt đầu');

  // Trường riêng theo vai trò
  const roleData = {};
  const input = b.role_data || {};
  for (const [key, type] of Object.entries(ROLE_FIELDS[role] || {})) {
    if (type === 'date') roleData[key] = date(input[key], 'Ngày trong hồ sơ nghề nghiệp');
    else if (type === 'list') roleData[key] = (Array.isArray(input[key]) ? input[key] : []).map((x) => String(x).trim().slice(0, 150)).filter(Boolean).slice(0, 30);
    else roleData[key] = text(input[key], 300, 'Thông tin nghề nghiệp');
  }
  record.role_data = roleData;

  // Tài liệu đính kèm: bằng cấp, hợp đồng... (đường dẫn https)
  record.documents = (Array.isArray(b.documents) ? b.documents : []).slice(0, 20).map((d) => {
    const name = text(d?.name, 150, 'Tên tài liệu');
    const url = text(d?.url, 500, 'Đường dẫn tài liệu');
    if (!name || !url || !/^https:\/\/\S+$/.test(url)) throw bad('Tài liệu đính kèm thiếu tên hoặc đường dẫn không hợp lệ');
    return { name, url };
  });
  return { profile, record };
};

// Mã nhân viên NV0001, NV0002... (khóa để 2 người tạo cùng lúc không trùng mã; tính cả hồ sơ đã xóa)
const nextEmployeeCode = async (transaction) => {
  await sequelize.query('SELECT pg_advisory_xact_lock(7001)', { transaction });
  const rows = await EmployeeRecord.findAll({ attributes: ['employee_code'], paranoid: false, raw: true, transaction });
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.employee_code).replace(/\D/g, '')) || 0), 0);
  return `NV${String(max + 1).padStart(4, '0')}`;
};

const assertNationalIdFree = async (nationalId, userId, transaction) => {
  const other = await EmployeeRecord.findOne({ where: { national_id: nationalId }, paranoid: false, attributes: ['user_id', 'employee_code'], transaction });
  if (other && other.user_id !== userId) throw bad(`Số CCCD đã có trong hồ sơ ${other.employee_code}`, 409);
};

// Ghi Profiles + EmployeeRecords + DoctorProfiles trong cùng 1 giao dịch
const persist = async (req, user, existing) => {
  const { profile, record } = parseBody(req.body, user.role);
  const hasProfessional = ['DOCTOR', 'EXPERT'].includes(user.role);
  const professional = hasProfessional ? buildProfessionalData(user.role, req.body.professional || {}, req.user.id) : null;

  return sequelize.transaction(async (t) => {
    await assertNationalIdFree(record.national_id, user.id, t);
    const [account] = await Profile.findOrCreate({ where: { user_id: user.id }, defaults: profile, transaction: t });
    await account.update(profile, { transaction: t });
    if (professional) {
      const [doc] = await DoctorProfile.findOrCreate({ where: { user_id: user.id }, defaults: professional, transaction: t });
      await doc.update(professional, { transaction: t });
    }
    if (existing) {
      if (existing.deletedAt) await existing.restore({ transaction: t });
      return existing.update({ ...record, updated_by: req.user.id }, { transaction: t });
    }
    return EmployeeRecord.create({
      ...record, user_id: user.id, employee_code: await nextEmployeeCode(t), created_by: req.user.id, updated_by: req.user.id,
    }, { transaction: t });
  });
};

// Hợp đồng / chứng chỉ đã hoặc sắp hết hạn (30 ngày tới)
const alertsOf = (record) => {
  if (!record || record.employment_status === 'RESIGNED') return [];
  const now = today();
  const soon = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86400000).toISOString().slice(0, 10);
  const items = [['Hợp đồng', record.contract_end], ...Object.entries(EXPIRY_FIELDS).map(([k, label]) => [label, record.role_data?.[k]])];
  return items.filter(([, d]) => d && d <= soon).map(([label, d]) => ({ label, date: d, expired: d < now }));
};

// GET /hr/records — tất cả tài khoản nhân viên + tóm tắt hồ sơ (không kèm CCCD, ngân hàng)
exports.listRecords = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: visibleRoles(req.user.role) },
      attributes: ['id', 'email', 'role', 'status'],
      include: [
        { model: Profile, attributes: ['full_name', 'phone', 'avatar'] },
        { model: DoctorProfile, attributes: ['title', 'specialty'] },
        { model: EmployeeRecord, attributes: ['employee_code', 'position', 'employment_type', 'employment_status', 'contract_type', 'contract_end', 'start_date', 'role_data'] },
      ],
      order: [['createdAt', 'ASC']],
    });
    res.status(200).json({
      data: users.map((u) => {
        const r = u.EmployeeRecord;
        return {
          user_id: u.id, email: u.email, role: u.role, account_status: u.status,
          full_name: u.Profile?.full_name || null, phone: u.Profile?.phone || null, avatar: u.Profile?.avatar || null,
          title: u.DoctorProfile?.title || null, specialty: u.DoctorProfile?.specialty || null,
          record: r ? {
            employee_code: r.employee_code, position: r.position, employment_type: r.employment_type, employment_status: r.employment_status,
            contract_type: r.contract_type, contract_end: r.contract_end, start_date: r.start_date,
          } : null,
          alerts: alertsOf(r),
        };
      }),
      roles: visibleRoles(req.user.role),
    });
  } catch (error) { fail(res, error); }
};

// GET /hr/records/:userId — đầy đủ hồ sơ; chưa có hồ sơ thì trả thông tin tài khoản để điền sẵn form
exports.getRecord = async (req, res) => {
  try {
    const user = await loadAccount(req.user, req.params.userId, {
      include: [{ model: Profile }, { model: DoctorProfile }, { model: EmployeeRecord }],
    });
    // Hồ sơ đã xóa trước đây: nạp lại để tạo lại không phải nhập từ đầu
    const record = user.EmployeeRecord || await EmployeeRecord.findOne({ where: { user_id: user.id }, paranoid: false });
    res.status(200).json({
      data: {
        user_id: user.id, email: user.email, role: user.role, account_status: user.status,
        profile: user.Profile || {}, professional: user.DoctorProfile || null,
        record, deleted: !!record?.deletedAt,
      },
    });
  } catch (error) { fail(res, error); }
};

// POST /hr/records { user_id, ... } — tạo hồ sơ cho tài khoản chưa có hồ sơ
exports.createRecord = async (req, res) => {
  try {
    const user = await loadAccount(req.user, req.body.user_id);
    const existing = await EmployeeRecord.findOne({ where: { user_id: user.id }, paranoid: false });
    if (existing && !existing.deletedAt) throw bad('Tài khoản này đã có hồ sơ nhân sự', 409);
    const record = await persist(req, user, existing);
    res.status(201).json({ message: existing ? `Đã khôi phục hồ sơ ${record.employee_code}` : `Đã tạo hồ sơ ${record.employee_code}`, data: { employee_code: record.employee_code } });
  } catch (error) { fail(res, error); }
};

// PUT /hr/records/:userId
exports.updateRecord = async (req, res) => {
  try {
    const user = await loadAccount(req.user, req.params.userId);
    const existing = await EmployeeRecord.findOne({ where: { user_id: user.id } });
    if (!existing) throw bad('Tài khoản này chưa có hồ sơ nhân sự', 404);
    await persist(req, user, existing);
    res.status(200).json({ message: 'Đã cập nhật hồ sơ nhân sự' });
  } catch (error) { fail(res, error); }
};

// DELETE /hr/records/:userId — xóa mềm; tài khoản vẫn giữ nguyên
exports.deleteRecord = async (req, res) => {
  try {
    const user = await loadAccount(req.user, req.params.userId);
    const existing = await EmployeeRecord.findOne({ where: { user_id: user.id } });
    if (!existing) throw bad('Tài khoản này chưa có hồ sơ nhân sự', 404);
    await existing.update({ updated_by: req.user.id });
    await existing.destroy();
    res.status(200).json({ message: `Đã xóa hồ sơ ${existing.employee_code}. Tài khoản đăng nhập vẫn giữ nguyên` });
  } catch (error) { fail(res, error); }
};
exports.parseBody = parseBody;
exports.nextEmployeeCode = nextEmployeeCode;
