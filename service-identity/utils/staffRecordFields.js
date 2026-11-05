// Trường riêng của hồ sơ nhân sự theo vai trò (lưu trong EmployeeRecords.role_data).
// text: chuỗi | date: YYYY-MM-DD | list: danh sách chuỗi. Nhãn hiển thị nằm ở frontend-admin/components/hr/staffFields.js
const PRACTICE = { license_issue_date: 'date', license_issue_place: 'text', practice_scope: 'text', practice_registered_at: 'date', cme_expiry: 'date' };

const ROLE_FIELDS = {
  DOCTOR: PRACTICE,
  EXPERT: { ...PRACTICE, home_organization: 'text' },
  TECHNICIAN: { certificate_name: 'text', certificate_no: 'text', certificate_issue_date: 'date', certificate_issue_place: 'text', certificate_expiry: 'date', trained_devices: 'list', trained_services: 'list' },
  CONSULTANT: { languages: 'list', channels: 'list', training_certificates: 'list' },
  SALES: { counter_area: 'text', pharmacy_certificate_no: 'text', pharmacy_certificate_date: 'date', product_training: 'list' },
  GEN_MANAGER: { appointment_decision_no: 'text', appointment_date: 'date', managed_scope: 'text' },
  ADMIN: { system_scope: 'text', confidentiality_signed_at: 'date' },
};

// Các ngày hết hạn cần cảnh báo trước
const EXPIRY_FIELDS = { certificate_expiry: 'Chứng chỉ KTV', cme_expiry: 'Đào tạo liên tục (CME)' };

const STAFF_ROLES = Object.keys(ROLE_FIELDS);
// Quản lý không xem / sửa hồ sơ của Admin và Quản lý khác (thông tin lương, CCCD...)
const visibleRoles = (actorRole) => (actorRole === 'ADMIN' ? STAFF_ROLES : STAFF_ROLES.filter((r) => !['ADMIN', 'GEN_MANAGER'].includes(r)));

module.exports = { ROLE_FIELDS, EXPIRY_FIELDS, STAFF_ROLES, visibleRoles };
