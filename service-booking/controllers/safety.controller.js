const axios = require('axios');
const dayjs = require('dayjs');
const { PatientSafety, SpaService, TreatmentPackage } = require('../models');
const { FLAGS, proceduresOf, ingredientsOf, evaluate } = require('../utils/safetyRules');

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const screenedToday = (row) => !!row?.screened_at && dayjs(row.screened_at).isSame(dayjs(), 'day');

const systemWarning = (code, message) => ({ code, severity: 'CAUTION', severity_label: 'Thận trọng', condition: 'Sàng lọc an toàn', item: null, message, sources: [] });

// Dịch vụ, gói, sản phẩm được kê => danh sách để so với quy tắc. Không đọc được thành phần thì báo, không coi là an toàn
const collectItems = async ({ services = [], packages = [], medicines = [], authorization }) => {
  const [svcRows, pkgRows, productRes] = await Promise.all([
    services.length ? SpaService.findAll({ where: { id: services }, attributes: ['name'], raw: true }) : [],
    packages.length ? TreatmentPackage.findAll({ where: { id: packages }, attributes: ['name', 'description'], raw: true }) : [],
    medicines.length
      ? axios.get('http://localhost:4000/api/commerce/products/safety-info', { params: { ids: medicines.join(',') }, headers: { Authorization: authorization } }).catch(() => null)
      : { data: { data: [] } },
  ]);
  const products = productRes?.data?.data || [];
  const items = [
    ...svcRows.map((s) => ({ name: s.name, targets: proceduresOf(s.name), text: '' })),
    ...pkgRows.map((p) => ({ name: p.name, targets: proceduresOf(`${p.name} ${p.description || ''}`), text: '' })),
    ...products.map((p) => ({ name: p.name, targets: ingredientsOf(p.ingredients), text: `${p.name} ${p.ingredients || ''}` })),
  ];
  return { items, unknown: !productRes || products.some((p) => !p.ingredients) };
};

// Kiểm tra đơn kê của 1 hồ sơ người khám. Dùng cho màn hình bác sĩ, lúc hoàn tất khám và lúc chốt hoá đơn
const checkPrescription = async ({ patient_profile_id, services, packages, medicines, authorization }) => {
  if (!services?.length && !packages?.length && !medicines?.length) return [];
  const safety = isUuid(patient_profile_id) ? await PatientSafety.findByPk(patient_profile_id, { raw: true }) : null;
  const { items, unknown } = await collectItems({ services, packages, medicines, authorization });
  const warnings = evaluate({ flags: safety?.flags || [], allergies: safety?.allergies, items });
  if (!screenedToday(safety)) warnings.unshift(systemWarning('NOT_SCREENED', 'Chưa xác nhận sàng lọc an toàn trong lần khám này (thai kỳ, thuốc đang dùng, dị ứng).'));
  if (unknown) warnings.push(systemWarning('UNKNOWN_INGREDIENTS', 'Không đọc được thành phần của một số sản phẩm, chưa kiểm tra được.'));
  return warnings;
};

// [STAFF] GET /safety/flags
const getFlags = (req, res) => res.status(200).json({ data: Object.entries(FLAGS).map(([value, label]) => ({ value, label })) });

// [STAFF] GET /safety/patients/:id
const getPatientSafety = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const row = await PatientSafety.findByPk(req.params.id, { raw: true });
    res.status(200).json({ data: { flags: row?.flags || [], allergies: row?.allergies || '', screened_at: row?.screened_at || null, screened_today: screenedToday(row) } });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] PUT /safety/patients/:id { flags, allergies } — lưu = đã hỏi khách trong lần khám này
const savePatientSafety = async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const flags = Array.isArray(req.body.flags) ? [...new Set(req.body.flags)] : [];
    if (flags.some((f) => !FLAGS[f])) return res.status(400).json({ message: 'Thông tin sàng lọc không hợp lệ' });
    const allergies = String(req.body.allergies || '').trim().slice(0, 500);
    await PatientSafety.upsert({ patient_profile_id: req.params.id, flags, allergies, screened_at: new Date(), screened_by: req.user.id });
    res.status(200).json({ message: 'Đã lưu sàng lọc an toàn' });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

// [STAFF] POST /safety/check { patient_profile_id, spa_services, treatment_package, prescriptions }
const checkSafety = async (req, res) => {
  try {
    const { patient_profile_id, spa_services = [], treatment_package, prescriptions = [] } = req.body;
    if (!isUuid(patient_profile_id)) return res.status(400).json({ message: 'Hồ sơ người khám không hợp lệ' });
    const warnings = await checkPrescription({
      patient_profile_id, services: spa_services, packages: treatment_package ? [treatment_package] : [],
      medicines: prescriptions.map((p) => p?.product_id).filter(Boolean), authorization: req.headers.authorization,
    });
    res.status(200).json({ data: warnings });
  } catch (error) { res.status(500).json({ message: 'Lỗi server', error: error.message }); }
};

module.exports = { checkPrescription, getFlags, getPatientSafety, savePatientSafety, checkSafety };
