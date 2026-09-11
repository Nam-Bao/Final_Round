const { Sequelize, DataTypes } = require('sequelize');
// Kết nối PostgreSQL (Cổng 5433)
const sequelize = new Sequelize('booking_db', 'postgres', 'password', { host: 'localhost', port: 5433, dialect: 'postgres' });

// 1. BẢNG GÓI LỘ TRÌNH (Đã được nâng cấp các trường mới)
const TreatmentPackage = sequelize.define('TreatmentPackage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  thumbnail_url: { type: DataTypes.STRING }, // Link ảnh đại diện
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  promotional_price: { type: DataTypes.DECIMAL(10, 2) }, // Giá khuyến mãi
  total_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, // Tổng số buổi
  interval_days: { type: DataTypes.INTEGER, defaultValue: 7 }, // Khoảng cách giữa các buổi (ngày)
  validity_days: { type: DataTypes.INTEGER, defaultValue: 90 }, // Hạn sử dụng gói (ngày) thay cho duration_days cũ
  included_products: { type: DataTypes.JSONB, defaultValue: [] }, // Mảng chứa ID Dược mỹ phẩm đi kèm
  status: { type: DataTypes.ENUM('ACTIVE', 'HIDDEN'), defaultValue: 'ACTIVE' } // Trạng thái bán
});

// 2. CÁC BẢNG KHÁC (Được giữ nguyên vẹn để dùng sau này)
const WorkShift = sequelize.define('WorkShift', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_id: { type: DataTypes.UUID, allowNull: false }, // Soft link to Identity
  date: { type: DataTypes.DATEONLY, allowNull: false },
  shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING') },
  status: { type: DataTypes.ENUM('SCHEDULED', 'ATTENDED', 'ABSENT') }
});

const ShiftRequest = sequelize.define('ShiftRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  employee_id: { type: DataTypes.UUID, allowNull: false },
  reason: { type: DataTypes.STRING },
  status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), defaultValue: 'PENDING' },
  approved_by: { type: DataTypes.UUID } // Soft link to GEN_MANAGER
});

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false }, //[cite: 3]
  doctor_id: { type: DataTypes.UUID, allowNull: true },    // Sửa thành true vì lúc khách mới đến chưa chắc đã gán ngay Bác sĩ
  consultant_id: { type: DataTypes.UUID, allowNull: true }, // THÊM MỚI: Tư vấn viên phụ trách
  appointment_date: { type: DataTypes.DATEONLY, allowNull: false }, //[cite: 3]
  appointment_time: { type: DataTypes.TIME, allowNull: false }, //[cite: 3]
  budget: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH') }, // THÊM MỚI: Ngân sách khách hàng
  pre_notes: { type: DataTypes.TEXT }, // THÊM MỚI: Ghi chú khai thác sơ bộ
  status: { 
    // THÊM MỚI: CHECK_IN (Mới đến) và WAITING_FOR_SALE (Bác sĩ khám xong, chờ chốt sale)
    type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS', 'WAITING_FOR_SALE', 'COMPLETED', 'CANCELLED'), 
    defaultValue: 'PENDING' 
  },
  symptoms: { type: DataTypes.TEXT }, //[cite: 3]
});

// --- THÊM MỚI: BẢNG NHẬT KÝ CHĂM SÓC KHÁCH HÀNG (FOLLOW-UP) ---
const FollowUpLog = sequelize.define('FollowUpLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  appointment_id: { type: DataTypes.UUID, allowNull: false }, // Thuộc về lần khám nào
  consultant_id: { type: DataTypes.UUID, allowNull: false },  // Ai gọi điện
  call_status: { type: DataTypes.ENUM('SUCCESS', 'COMPLAINT', 'NO_ANSWER') },
  call_note: { type: DataTypes.TEXT }
});

const AppointmentReview = sequelize.define('AppointmentReview', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  rating: { type: DataTypes.INTEGER },
  comment: { type: DataTypes.TEXT }
});

// --- BẢNG: KHÁCH HÀNG SỞ HỮU GÓI (Customer Package) ---
const CustomerPackage = sequelize.define('CustomerPackage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  package_id: { type: DataTypes.UUID, allowNull: false },
  total_sessions: { type: DataTypes.INTEGER, allowNull: false }, // Tổng buổi lúc mua
  remaining_sessions: { type: DataTypes.INTEGER, allowNull: false }, // Buổi còn lại
  status: { type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'CANCELLED'), defaultValue: 'ACTIVE' }
});

// --- BẢNG: NHẬT KÝ LẦN LÀM DỊCH VỤ (Treatment Session) ---
const TreatmentSession = sequelize.define('TreatmentSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_package_id: { type: DataTypes.UUID, allowNull: false }, // Trỏ về gói mà khách đang sở hữu
  technician_id: { type: DataTypes.UUID }, // ID của KTV thực hiện (Có thể chưa gán ngay)
  session_number: { type: DataTypes.INTEGER, allowNull: false }, // Đang làm buổi thứ mấy
  session_date: { type: DataTypes.DATEONLY, allowNull: false }, // Ngày làm
  technician_note: { type: DataTypes.TEXT }, // KTV ghi chú (VD: Khách chịu đau tốt)
  status: { type: DataTypes.ENUM('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'SCHEDULED' }
});

// 3. THIẾT LẬP QUAN HỆ (Relations)
TreatmentPackage.hasMany(Appointment, { foreignKey: 'package_id' });
Appointment.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });

WorkShift.hasMany(ShiftRequest, { foreignKey: 'from_shift_id' });
Appointment.hasOne(AppointmentReview, { foreignKey: 'appointment_id' });

CustomerPackage.hasMany(TreatmentSession, { foreignKey: 'customer_package_id' });
TreatmentSession.belongsTo(CustomerPackage, { foreignKey: 'customer_package_id' });

TreatmentPackage.hasMany(CustomerPackage, { foreignKey: 'package_id' });
CustomerPackage.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });

// ĐOẠN CODE TẠM THỜI ĐỂ DỌN DẸP LỖI ENUM CỦA POSTGRESQL
// sequelize.query('DROP TABLE IF EXISTS "TreatmentPackages" CASCADE;')
//   .then(() => sequelize.query('DROP TYPE IF EXISTS "public"."enum_TreatmentPackages_status" CASCADE;'))
//   .then(() => sequelize.sync({ alter: true }))
//   .then(() => console.log("✅ Đã dọn dẹp lỗi ENUM và đồng bộ Database thành công!"))
//   .catch((err) => console.error("Lỗi:", err));

sequelize.sync({ alter: true }).then(() => console.log("✅ Đã đồng bộ Database cho service-booking!"));

module.exports = { sequelize, TreatmentPackage, WorkShift, ShiftRequest, Appointment, AppointmentReview, FollowUpLog, CustomerPackage, TreatmentSession };