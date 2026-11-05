// Danh mục và trường riêng theo vai trò của hồ sơ nhân sự (khớp service-identity/utils/staffRecordFields.js)
export const HR_API = 'http://localhost:4000/api/identity/hr/records';

export const ROLE_INFO = {
  DOCTOR: { label: 'Bác sĩ', color: 'purple', position: 'Bác sĩ Da liễu' },
  EXPERT: { label: 'Chuyên gia', color: 'magenta', position: 'Chuyên gia tư vấn' },
  TECHNICIAN: { label: 'Kỹ thuật viên', color: 'cyan', position: 'Kỹ thuật viên' },
  CONSULTANT: { label: 'CSKH', color: 'blue', position: 'Chuyên viên CSKH' },
  SALES: { label: 'Nhân viên bán hàng', color: 'green', position: 'Nhân viên bán hàng' },
  GEN_MANAGER: { label: 'Quản lý', color: 'gold', position: 'Quản lý phòng khám' },
  ADMIN: { label: 'Quản trị hệ thống', color: 'red', position: 'Quản trị hệ thống' },
};

export const GENDERS = [{ value: 'MALE', label: 'Nam' }, { value: 'FEMALE', label: 'Nữ' }, { value: 'OTHER', label: 'Khác' }];
export const MARITAL = [{ value: 'SINGLE', label: 'Độc thân' }, { value: 'MARRIED', label: 'Đã kết hôn' }, { value: 'OTHER', label: 'Khác' }];
export const EMPLOYMENT_TYPES = { FULL_TIME: 'Toàn thời gian', PART_TIME: 'Bán thời gian', COLLABORATOR: 'Cộng tác viên' };
export const CONTRACT_TYPES = { PROBATION: 'Thử việc', FIXED_TERM: 'Xác định thời hạn', INDEFINITE: 'Không xác định thời hạn', SERVICE: 'Hợp đồng dịch vụ' };
export const EMPLOYMENT_STATUS = {
  WORKING: { color: 'green', label: 'Đang làm việc' },
  ON_LEAVE: { color: 'gold', label: 'Tạm nghỉ' },
  RESIGNED: { color: 'default', label: 'Đã nghỉ việc' },
};
export const toOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

const PRACTICE = [
  { key: 'license_issue_date', label: 'Ngày cấp chứng chỉ hành nghề', type: 'date' },
  { key: 'license_issue_place', label: 'Nơi cấp chứng chỉ hành nghề', type: 'text' },
  { key: 'practice_scope', label: 'Phạm vi hoạt động chuyên môn', type: 'text', wide: true },
  { key: 'practice_registered_at', label: 'Ngày đăng ký hành nghề tại phòng khám', type: 'date' },
  { key: 'cme_expiry', label: 'Hạn đào tạo liên tục (CME)', type: 'date' },
];

// Mỗi vai trò có phần "Hồ sơ nghề nghiệp" riêng. type: text | date | list
export const ROLE_FIELDS = {
  DOCTOR: PRACTICE,
  EXPERT: [{ key: 'home_organization', label: 'Đơn vị công tác chính', type: 'text', wide: true }, ...PRACTICE],
  TECHNICIAN: [
    { key: 'certificate_name', label: 'Tên chứng chỉ nghề', type: 'text', wide: true },
    { key: 'certificate_no', label: 'Số chứng chỉ', type: 'text' },
    { key: 'certificate_issue_place', label: 'Nơi cấp', type: 'text' },
    { key: 'certificate_issue_date', label: 'Ngày cấp', type: 'date' },
    { key: 'certificate_expiry', label: 'Ngày hết hạn', type: 'date' },
    { key: 'trained_devices', label: 'Thiết bị được đào tạo vận hành', type: 'list', wide: true },
    { key: 'trained_services', label: 'Dịch vụ / liệu trình được thực hiện', type: 'list', wide: true },
  ],
  CONSULTANT: [
    { key: 'languages', label: 'Ngoại ngữ', type: 'list', wide: true },
    { key: 'channels', label: 'Kênh phụ trách', type: 'list', wide: true, placeholder: 'Hotline, Zalo, Chat web...' },
    { key: 'training_certificates', label: 'Chứng chỉ / khóa đào tạo CSKH', type: 'list', wide: true },
  ],
  SALES: [
    { key: 'counter_area', label: 'Quầy / khu vực phụ trách', type: 'text', wide: true },
    { key: 'pharmacy_certificate_no', label: 'Số chứng chỉ hành nghề dược (nếu có)', type: 'text' },
    { key: 'pharmacy_certificate_date', label: 'Ngày cấp', type: 'date' },
    { key: 'product_training', label: 'Khóa đào tạo sản phẩm', type: 'list', wide: true },
  ],
  GEN_MANAGER: [
    { key: 'appointment_decision_no', label: 'Số quyết định bổ nhiệm', type: 'text' },
    { key: 'appointment_date', label: 'Ngày bổ nhiệm', type: 'date' },
    { key: 'managed_scope', label: 'Phạm vi quản lý', type: 'text', wide: true },
  ],
  ADMIN: [
    { key: 'system_scope', label: 'Phạm vi quản trị hệ thống', type: 'text', wide: true },
    { key: 'confidentiality_signed_at', label: 'Ngày ký cam kết bảo mật', type: 'date' },
  ],
};

// Trường ngày của phần chung (đổi qua lại giữa dayjs và chuỗi YYYY-MM-DD)
export const DATE_FIELDS = ['dob', 'national_id_issue_date', 'start_date', 'end_date', 'contract_start', 'contract_end', 'health_check_date'];

// Ô nào nằm ở tab nào, để báo lỗi thì mở đúng tab
export const TAB_OF_FIELD = {
  personal: ['full_name', 'gender', 'dob', 'phone', 'national_id', 'national_id_issue_date', 'national_id_issue_place', 'permanent_address', 'current_address', 'nationality', 'ethnicity', 'marital_status', 'education_level', 'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone'],
  work: ['position', 'employment_type', 'employment_status', 'start_date', 'end_date', 'contract_type', 'contract_no', 'contract_start', 'contract_end'],
  finance: ['tax_code', 'social_insurance_no', 'bank_name', 'bank_account_no', 'bank_account_name', 'health_check_date'],
  career: ['role_data', 'professional'],
};
