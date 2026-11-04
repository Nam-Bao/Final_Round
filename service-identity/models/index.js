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

module.exports = { sequelize, User, Profile, DoctorProfile, PatientProfile, Attendance, MedicalRecord, ChatSession, ChatMessage };