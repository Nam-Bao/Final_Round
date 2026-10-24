const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('booking_db', 'postgres', 'password', { host: 'localhost', port: 5433, dialect: 'postgres' });

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
    customer_id: { type: DataTypes.UUID, allowNull: false },
    doctor_id: { type: DataTypes.UUID, allowNull: true },
    consultant_id: { type: DataTypes.UUID, allowNull: true },
    appointment_date: { type: DataTypes.DATEONLY, allowNull: false },
    appointment_time: { type: DataTypes.TIME, allowNull: false },
    budget: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH') },
    pre_notes: { type: DataTypes.TEXT },
    status: {
        type: DataTypes.ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS', 'WAITING_FOR_SALE', 'COMPLETED', 'CANCELLED', 'NEEDS_RESCHEDULE'),
        defaultValue: 'PENDING_PAYMENT'
    },
    type: {
        type: DataTypes.ENUM('NEW_EXAM', 'FOLLOW_UP', 'TREATMENT'),
        defaultValue: 'NEW_EXAM'
    },
    symptoms: { type: DataTypes.TEXT },
});

// --- THÊM MỚI: BẢNG NHẬT KÝ CHĂM SÓC KHÁCH HÀNG (FOLLOW-UP) ---
const FollowUpLog = sequelize.define('FollowUpLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    appointment_id: { type: DataTypes.UUID, allowNull: false },
    consultant_id: { type: DataTypes.UUID, allowNull: false },
    call_status: { type: DataTypes.ENUM('SUCCESS', 'COMPLAINT', 'NO_ANSWER') },
    call_note: { type: DataTypes.TEXT }
});

const AppointmentReview = sequelize.define('AppointmentReview', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    rating: { type: DataTypes.INTEGER },
    comment: { type: DataTypes.TEXT }
});

const CustomerPackage = sequelize.define('CustomerPackage', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    package_id: { type: DataTypes.UUID, allowNull: false },
    total_sessions: { type: DataTypes.INTEGER, allowNull: false },
    remaining_sessions: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'CANCELLED'), defaultValue: 'ACTIVE' }
});

const TreatmentSession = sequelize.define('TreatmentSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_package_id: { type: DataTypes.UUID, allowNull: false },
    technician_id: { type: DataTypes.UUID },
    session_number: { type: DataTypes.INTEGER, allowNull: false },
    session_date: { type: DataTypes.DATEONLY, allowNull: false },
    technician_note: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'SCHEDULED' }
});

const SpaService = sequelize.define('SpaService', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING, defaultValue: 'basic' }, // acne | pigment | rejuvenation | recovery | basic | online
    includes: { type: DataTypes.JSONB, defaultValue: [] }, // Danh sách "Dịch vụ bao gồm" hiển thị ở trang chi tiết
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    image_url: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('ACTIVE', 'HIDDEN'), defaultValue: 'ACTIVE' }
});

// THÊM MỚI: BẢNG DỊCH VỤ LẺ (Dành cho khách không mua Gói)
const ServiceSession = sequelize.define('ServiceSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    spa_service_id: { type: DataTypes.UUID, allowNull: false },
    technician_id: { type: DataTypes.UUID },
    session_date: { type: DataTypes.DATEONLY, allowNull: false },
    technician_note: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'WAITING' }
});

const Invoice = sequelize.define('Invoice', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    appointment_id: { type: DataTypes.UUID, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payment_status: { type: DataTypes.ENUM('PENDING', 'PAID', 'REFUNDED'), defaultValue: 'PENDING' },
    payment_method: { type: DataTypes.ENUM('VIETQR', 'CASH', 'UNKNOWN'), defaultValue: 'UNKNOWN' },
});

const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, // Số dương là thu, số âm là hoàn
    transaction_type: { type: DataTypes.ENUM('INCOME', 'REFUND'), allowNull: false },
    note: { type: DataTypes.STRING }
});


// Quan hệ Database
TreatmentPackage.hasMany(Appointment, { foreignKey: 'package_id' });
Appointment.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });
WorkShift.hasMany(ShiftRequest, { foreignKey: 'from_shift_id' });
Appointment.hasOne(AppointmentReview, { foreignKey: 'appointment_id' });
AppointmentReview.belongsTo(Appointment, { foreignKey: 'appointment_id' });

CustomerPackage.hasMany(TreatmentSession, { foreignKey: 'customer_package_id' });
TreatmentSession.belongsTo(CustomerPackage, { foreignKey: 'customer_package_id' });
TreatmentPackage.hasMany(CustomerPackage, { foreignKey: 'package_id' });
CustomerPackage.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });

// Quan hệ cho Dịch vụ lẻ
SpaService.hasMany(ServiceSession, { foreignKey: 'spa_service_id' });
ServiceSession.belongsTo(SpaService, { foreignKey: 'spa_service_id' });

Invoice.hasMany(Transaction, { foreignKey: 'invoice_id' });
Transaction.belongsTo(Invoice, { foreignKey: 'invoice_id' });
Appointment.hasOne(Invoice, { foreignKey: 'appointment_id' });

sequelize.sync().then(() => console.log("✅ Đã đồng bộ Database cho service-booking!"));

module.exports = {
    sequelize,
    TreatmentPackage,
    WorkShift,
    ShiftRequest,
    Appointment,
    AppointmentReview,
    FollowUpLog,
    CustomerPackage,
    TreatmentSession,
    SpaService,
    Invoice,
    Transaction // Export bảng mới
};