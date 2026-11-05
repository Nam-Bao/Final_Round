const { Sequelize, DataTypes } = require('sequelize');

// Cấu hình kết nối (Sẽ cấu hình chi tiết ở file env sau, tạm thời để code mẫu)
// Đọc từ .env; giá trị mặc định khớp docker-compose cho môi trường dev
const sequelize = new Sequelize(
  process.env.DB_NAME || 'identity_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5435), dialect: 'postgres' }
);

// 1. Bảng Users
const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { 
    // EXPERT: chuyên gia tư vấn thỉnh giảng (tài khoản quyền hẹp, không phải nhân viên chính thức)
    type: DataTypes.ENUM('GUEST', 'CUSTOMER', 'GEN_MANAGER', 'ADMIN', 'DOCTOR', 'CONSULTANT', 'TECHNICIAN', 'SALES', 'EXPERT'),
    defaultValue: 'CUSTOMER' 
  },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'BANNED'), defaultValue: 'ACTIVE' },
  reset_password_token: { type: DataTypes.STRING, allowNull: true },
  reset_password_expires: { type: DataTypes.DATE, allowNull: true }
});

// 2. Bảng Profiles (Chứa thông tin nhân viên hoặc thông tin định danh của Account)
const Profile = sequelize.define('Profile', {
  full_name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  dob: { type: DataTypes.DATEONLY },
  gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER') },
  avatar: { type: DataTypes.STRING }
});

// 2b. Hồ sơ chuyên môn của bác sĩ / chuyên gia tư vấn (công khai cho khách xem trước khi đặt lịch).
// Bảng riêng vì sync thường không thêm cột vào Profiles; chỉ Admin/Quản lý cập nhật sau khi xác minh bằng cấp.
const DoctorProfile = sequelize.define('DoctorProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  title: { type: DataTypes.STRING(50) },             // học hàm / học vị, vd "ThS.BS", "BSCKI"
  specialty: { type: DataTypes.STRING(150) },        // chuyên khoa
  workplace: { type: DataTypes.STRING(200) },        // nơi đang công tác
  experience_years: { type: DataTypes.INTEGER },
  license_number: { type: DataTypes.STRING(50) },    // số chứng chỉ hành nghề
  bio: { type: DataTypes.TEXT },                     // giới thiệu ngắn
  education: { type: DataTypes.JSONB, defaultValue: [] },     // [{ degree, school, year }]
  work_history: { type: DataTypes.JSONB, defaultValue: [] },  // kinh nghiệm công tác: [{ position, place, from, to }] (to = null: hiện tại)
  certificates: { type: DataTypes.JSONB, defaultValue: [] },  // ["Chứng chỉ Laser thẩm mỹ - 2019", ...]
  expertise: { type: DataTypes.JSONB, defaultValue: [] },     // thế mạnh điều trị: ["Mụn trứng cá", ...]
  // Chỉ dùng cho chuyên gia tư vấn (EXPERT)
  consult_field: { type: DataTypes.STRING(20) },     // DERMATOLOGY | NUTRITION | COSMETICS
  session_fee: { type: DataTypes.INTEGER },          // thù lao phòng khám trả mỗi ca hoàn thành (NỘI BỘ, không công khai)
  updated_by: { type: DataTypes.UUID }
});

// 2c. Hồ sơ nhân sự: 1 tài khoản nhân viên = tối đa 1 hồ sơ. Họ tên, ngày sinh, SĐT, ảnh nằm ở Profiles.
// paranoid: xóa mềm để giữ hồ sơ theo quy định lưu trữ; role_data là phần riêng theo vai trò (utils/staffRecordFields.js)
const EmployeeRecord = sequelize.define('EmployeeRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  employee_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  // Nhân thân
  national_id: { type: DataTypes.STRING(12), allowNull: false, unique: true },
  national_id_issue_date: { type: DataTypes.DATEONLY },
  national_id_issue_place: { type: DataTypes.STRING(200) },
  permanent_address: { type: DataTypes.STRING(300), allowNull: false },
  current_address: { type: DataTypes.STRING(300) },
  nationality: { type: DataTypes.STRING(50), defaultValue: 'Việt Nam' },
  ethnicity: { type: DataTypes.STRING(50) },
  marital_status: { type: DataTypes.STRING(20) },   // SINGLE | MARRIED | OTHER
  education_level: { type: DataTypes.STRING(100) },
  emergency_contact_name: { type: DataTypes.STRING(100), allowNull: false },
  emergency_contact_relation: { type: DataTypes.STRING(50) },
  emergency_contact_phone: { type: DataTypes.STRING(15), allowNull: false },
  // Công việc & hợp đồng
  position: { type: DataTypes.STRING(100), allowNull: false },
  employment_type: { type: DataTypes.STRING(20), allowNull: false },   // FULL_TIME | PART_TIME | COLLABORATOR
  employment_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'WORKING' }, // WORKING | ON_LEAVE | RESIGNED
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY },
  contract_type: { type: DataTypes.STRING(20), allowNull: false },     // PROBATION | FIXED_TERM | INDEFINITE | SERVICE
  contract_no: { type: DataTypes.STRING(50) },
  contract_start: { type: DataTypes.DATEONLY },
  contract_end: { type: DataTypes.DATEONLY },
  // Thuế, bảo hiểm, ngân hàng (trả lương)
  tax_code: { type: DataTypes.STRING(14) },
  social_insurance_no: { type: DataTypes.STRING(15) },
  bank_name: { type: DataTypes.STRING(100) },
  bank_account_no: { type: DataTypes.STRING(30) },
  bank_account_name: { type: DataTypes.STRING(100) },
  health_check_date: { type: DataTypes.DATEONLY },   // khám sức khỏe định kỳ gần nhất
  role_data: { type: DataTypes.JSONB, defaultValue: {} },
  documents: { type: DataTypes.JSONB, defaultValue: [] }, // [{ name, url }]
  notes: { type: DataTypes.TEXT },
  created_by: { type: DataTypes.UUID },
  updated_by: { type: DataTypes.UUID },
}, { paranoid: true });

// 3. Bảng PatientProfiles (Hồ sơ người bệnh - THAY THẾ BẢNG GUARDIANS)
const PatientProfile = sequelize.define('PatientProfile', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  full_name: { type: DataTypes.STRING, allowNull: false },
  relationship: { type: DataTypes.STRING, defaultValue: 'Bản thân' }, // Ví dụ: Bản thân, Con cái, Bố/mẹ...
  phone: { type: DataTypes.STRING },
  dob: { type: DataTypes.DATEONLY },
  gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER') }
});

// 4. Bảng Attendances (Chấm công nhân viên)
// Hồ sơ khách đến thẳng phòng khám (chưa có tài khoản đăng nhập). Khách đăng ký online bằng đúng SĐT + mã này thì tài khoản tạm
// trở thành tài khoản thật, giữ nguyên lịch khám và bệnh án. SĐT chưa được xác minh nên phải có mã do CSKH đưa tại quầy.
const WalkInClaim = sequelize.define('WalkInClaim', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  phone: { type: DataTypes.STRING(15), allowNull: false, unique: true },
  code: { type: DataTypes.STRING(6), allowNull: false },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // số lần nhập sai
  claimed_at: { type: DataTypes.DATE },
});

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  check_in: { type: DataTypes.DATE },
  check_out: { type: DataTypes.DATE }
});

// 5. Bảng MedicalRecords (Hồ sơ khám bệnh / Sổ y bạ)
const MedicalRecord = sequelize.define('MedicalRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  appointment_id: { type: DataTypes.UUID, allowNull: false },
  exam_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  symptoms: { type: DataTypes.TEXT }, 
  diagnosis: { type: DataTypes.STRING }, 
  doctor_notes: { type: DataTypes.TEXT }, 
  follow_up_date: { type: DataTypes.DATEONLY, allowNull: true },
  pre_exam_images: { type: DataTypes.JSONB, defaultValue: [] }, // Ảnh trước khám
  post_exam_images: { type: DataTypes.JSONB, defaultValue: [] }  // Ảnh sau khám
});

// 6. Bảng ChatSessions (Phiên chat)
const ChatSession = sequelize.define('ChatSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  status: { type: DataTypes.ENUM('WAITING', 'ACTIVE', 'CLOSED'), defaultValue: 'WAITING' }
});

// 7. Bảng ChatMessages (Tin nhắn chi tiết)
const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  sender_type: { type: DataTypes.ENUM('CUSTOMER', 'CONSULTANT', 'SYSTEM') },
  content: { type: DataTypes.TEXT }
});

// ==========================================
// THIẾT LẬP QUAN HỆ CÁC BẢNG (ASSOCIATIONS)
// ==========================================

User.hasOne(Profile, { foreignKey: 'user_id' });
Profile.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(DoctorProfile, { foreignKey: 'user_id', onDelete: 'CASCADE' });
DoctorProfile.belongsTo(User, { foreignKey: 'user_id' });
User.hasOne(EmployeeRecord, { foreignKey: 'user_id', onDelete: 'CASCADE' });
EmployeeRecord.belongsTo(User, { foreignKey: 'user_id' });

// 1 User có thể quản lý nhiều Hồ sơ người bệnh (PatientProfiles)
User.hasMany(PatientProfile, { foreignKey: 'user_id', as: 'PatientProfiles' });
PatientProfile.belongsTo(User, { foreignKey: 'user_id', as: 'Account' });

// Nhân viên có nhiều lượt chấm công
User.hasMany(Attendance, { foreignKey: 'employee_id' });

// Mỗi Hồ sơ khám bệnh giờ sẽ liên kết trực tiếp với 1 PatientProfile (thay vì 1 User như trước)
PatientProfile.hasMany(MedicalRecord, { foreignKey: 'patient_profile_id', as: 'MedicalHistory' });
MedicalRecord.belongsTo(PatientProfile, { foreignKey: 'patient_profile_id', as: 'Patient' });

// Bác sĩ đã thực hiện nhiều Hồ sơ khám
User.hasMany(MedicalRecord, { foreignKey: 'doctor_id', as: 'PerformedExams' });
MedicalRecord.belongsTo(User, { foreignKey: 'doctor_id', as: 'Doctor' });

// Chat Sessions
User.hasMany(ChatSession, { foreignKey: 'customer_id', as: 'MyChats' });
ChatSession.belongsTo(User, { foreignKey: 'customer_id', as: 'Customer' });

User.hasMany(ChatSession, { foreignKey: 'consultant_id', as: 'HandledChats' });
ChatSession.belongsTo(User, { foreignKey: 'consultant_id', as: 'Consultant' });

ChatSession.hasMany(ChatMessage, { foreignKey: 'session_id', as: 'Messages' });
ChatMessage.belongsTo(ChatSession, { foreignKey: 'session_id' });

// Đồng bộ bảng được gọi 1 lần duy nhất trong index.js (trước đây gọi ở cả 2 nơi)

module.exports = { WalkInClaim, sequelize, User, Profile, DoctorProfile, EmployeeRecord, PatientProfile, Attendance, MedicalRecord, ChatSession, ChatMessage };