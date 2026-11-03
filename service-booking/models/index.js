const { Sequelize, DataTypes } = require('sequelize');
// Đọc từ .env; giá trị mặc định khớp docker-compose cho môi trường dev
const sequelize = new Sequelize(
    process.env.DB_NAME || 'booking_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'password',
    { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5433), dialect: 'postgres' }
);

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
    // Lịch tạo trước khi khôi phục cột này (bị mất ở commit 27bf31d) không còn giá trị nên tạm cho phép null
    patient_profile_id: { type: DataTypes.UUID, allowNull: true },
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
    pre_exam_images: { type: DataTypes.JSONB, defaultValue: [] },
    diagnosis: { type: DataTypes.STRING },
    doctor_notes: { type: DataTypes.TEXT },
    prescribed_services: { type: DataTypes.JSONB, defaultValue: [] },
    prescribed_packages: { type: DataTypes.JSONB, defaultValue: [] },
    prescribed_medicines: { type: DataTypes.JSONB, defaultValue: [] },
});

// Bằng chứng mỗi lần hủy lịch khám: ai hủy, theo yêu cầu của bên nào, lý do, tiền cọc xử lý ra sao.
// Bảng riêng (không thêm cột vào Appointments) vì sync thường không thêm cột cho bảng đã có.
const AppointmentCancellation = sequelize.define('AppointmentCancellation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    appointment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    cancelled_by: { type: DataTypes.UUID, allowNull: false },          // tài khoản bấm hủy
    cancelled_by_role: { type: DataTypes.STRING, allowNull: false },   // CUSTOMER / CONSULTANT / GEN_MANAGER / ADMIN
    // Bên yêu cầu hủy quyết định tiền cọc: CUSTOMER => mất cọc, CLINIC => hoàn cọc
    initiator: { type: DataTypes.ENUM('CUSTOMER', 'CLINIC'), allowNull: false },
    reason: { type: DataTypes.TEXT },
    previous_status: { type: DataTypes.STRING, allowNull: false },     // trạng thái lịch lúc bị hủy
    deposit_paid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    // NONE: chưa đóng cọc | FORFEITED: khách mất cọc | REFUND_PENDING: chờ CSKH hoàn | REFUNDED: đã hoàn
    deposit_outcome: { type: DataTypes.ENUM('NONE', 'FORFEITED', 'REFUND_PENDING', 'REFUNDED'), allowNull: false },
    forfeit_acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false }, // khách đã xác nhận biết sẽ mất cọc
    refund_ref: { type: DataTypes.STRING },   // mã giao dịch chuyển khoản hoàn cọc
    refund_note: { type: DataTypes.TEXT },
    refunded_by: { type: DataTypes.UUID },
    refunded_at: { type: DataTypes.DATE },
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

// Đánh giá bác sĩ sau buổi khám đã hoàn tất (mỗi lịch hẹn 1 đánh giá).
// customer_name / doctor_name là ảnh chụp tên thật từ service-identity lúc đánh giá.
const AppointmentReview = sequelize.define('AppointmentReview', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    doctor_id: { type: DataTypes.UUID },
    customer_name: { type: DataTypes.STRING },
    doctor_name: { type: DataTypes.STRING },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('VISIBLE', 'HIDDEN'), defaultValue: 'VISIBLE' }
}, {
    indexes: [{ unique: true, fields: ['appointment_id'] }]
});

// Đánh giá buổi dịch vụ lẻ (ServiceSession) hoặc buổi liệu trình (TreatmentSession) đã hoàn thành.
// Mỗi buổi 1 đánh giá; service_name / customer_name là ảnh chụp tên thật lúc đánh giá.
const ServiceReview = sequelize.define('ServiceReview', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    session_type: { type: DataTypes.ENUM('SINGLE', 'PACKAGE'), allowNull: false },
    session_id: { type: DataTypes.UUID, allowNull: false },
    service_id: { type: DataTypes.UUID, allowNull: false }, // spa_service_id hoặc package_id
    service_name: { type: DataTypes.STRING },
    customer_name: { type: DataTypes.STRING },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('VISIBLE', 'HIDDEN'), defaultValue: 'VISIBLE' }
}, {
    indexes: [{ unique: true, fields: ['session_id'] }]
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
  patient_profile_id: { type: DataTypes.UUID, allowNull: false }, // THÊM: Bắt buộc có ID hồ sơ
  technician_id: { type: DataTypes.UUID }, 
  session_number: { type: DataTypes.INTEGER, allowNull: false }, 
  session_date: { type: DataTypes.DATEONLY, allowNull: false }, 
  technician_note: { type: DataTypes.TEXT },
  post_treatment_images: { type: DataTypes.JSONB, defaultValue: [] }, // THÊM: Chứa mảng link ảnh
  status: { type: DataTypes.ENUM('SCHEDULED', 'WAITING', 'IN_PROGRESS', 'COMPLETED'), defaultValue: 'SCHEDULED' }
});

const SpaService = sequelize.define('SpaService', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING, defaultValue: 'basic' }, // acne | pigment | rejuvenation | recovery | basic | online
    includes: { type: DataTypes.JSONB, defaultValue: [] }, // Danh sách "Dịch vụ bao gồm" hiển thị ở trang chi tiết
    procedure_steps: { type: DataTypes.JSONB, defaultValue: [] }, // Các bước thực hiện (trang chi tiết)
    suitable_for: { type: DataTypes.JSONB, defaultValue: [] }, // Tình trạng da / đối tượng phù hợp
    aftercare: { type: DataTypes.JSONB, defaultValue: [] }, // Lưu ý chăm sóc sau điều trị
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    image_url: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('ACTIVE', 'HIDDEN'), defaultValue: 'ACTIVE' }
});

const ServiceSession = sequelize.define('ServiceSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.UUID, allowNull: false },
  patient_profile_id: { type: DataTypes.UUID, allowNull: false }, // THÊM: Bắt buộc có ID hồ sơ
  spa_service_id: { type: DataTypes.UUID, allowNull: false },
  technician_id: { type: DataTypes.UUID }, 
  session_date: { type: DataTypes.DATEONLY, allowNull: false }, 
  technician_note: { type: DataTypes.TEXT }, 
  post_treatment_images: { type: DataTypes.JSONB, defaultValue: [] }, // THÊM: Chứa mảng link ảnh
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

TreatmentPackage.hasMany(Appointment, { foreignKey: 'package_id' });
Appointment.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });
WorkShift.hasMany(ShiftRequest, { foreignKey: 'from_shift_id' });
Appointment.hasOne(AppointmentReview, { foreignKey: 'appointment_id' });
AppointmentReview.belongsTo(Appointment, { foreignKey: 'appointment_id' });

CustomerPackage.hasMany(TreatmentSession, { foreignKey: 'customer_package_id' });
TreatmentSession.belongsTo(CustomerPackage, { foreignKey: 'customer_package_id' });
TreatmentPackage.hasMany(CustomerPackage, { foreignKey: 'package_id' });
CustomerPackage.belongsTo(TreatmentPackage, { foreignKey: 'package_id' });

SpaService.hasMany(ServiceSession, { foreignKey: 'spa_service_id' });
ServiceSession.belongsTo(SpaService, { foreignKey: 'spa_service_id' });

Invoice.hasMany(Transaction, { foreignKey: 'invoice_id' });
Transaction.belongsTo(Invoice, { foreignKey: 'invoice_id' });
Appointment.hasOne(Invoice, { foreignKey: 'appointment_id' });
Appointment.hasOne(AppointmentCancellation, { foreignKey: 'appointment_id' });
AppointmentCancellation.belongsTo(Appointment, { foreignKey: 'appointment_id' });

// ===================== CHẤM CÔNG =====================
// Máy chấm công đặt tại quầy (tablet / màn hình). Quản lý kích hoạt; token chỉ lưu bản băm.
const AttendanceKiosk = sequelize.define('AttendanceKiosk', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_by: { type: DataTypes.UUID },
    last_seen_at: { type: DataTypes.DATE },
});

// Mã QR động: mỗi lần bấm "Chấm công" tạo 1 mã ngẫu nhiên, không trùng (unique), sống 20 giây, dùng 1 lần
const AttendanceQr = sequelize.define('AttendanceQr', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    kiosk_id: { type: DataTypes.UUID, allowNull: false },
    shift_date: { type: DataTypes.DATEONLY, allowNull: false },
    shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING'), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_by: { type: DataTypes.UUID },
    used_at: { type: DataTypes.DATE },
}, { updatedAt: false });

// Kết quả chấm công của 1 ca (mỗi ca tối đa 1 bản ghi)
const AttendanceRecord = sequelize.define('AttendanceRecord', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    shift_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    shift_date: { type: DataTypes.DATEONLY, allowNull: false },
    shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING'), allowNull: false },
    // Vào ca: ON_TIME đúng giờ | LATE quét QR trễ trong 10' | EXPLAINED giải trình được duyệt
    //         LATE_REJECTED giải trình trễ bị từ chối (vẫn có lương ca, tính vi phạm nghiêm trọng) | ABSENT vắng
    status: { type: DataTypes.STRING(20), allowNull: false },
    check_in_at: { type: DataTypes.DATE },          // lúc quét QR (hoặc giờ có mặt thực tế khi giải trình)
    minutes_late: { type: DataTypes.INTEGER, defaultValue: 0 },
    method: { type: DataTypes.STRING(20) },         // QR | EXPLANATION | AUTO (hệ thống tự ghi vắng)
    photo_url: { type: DataTypes.STRING(500) },     // ảnh chụp xác nhận khuôn mặt
    face_count: { type: DataTypes.INTEGER },        // số khuôn mặt trình duyệt phát hiện lúc chụp
    qr_id: { type: DataTypes.UUID },
    kiosk_id: { type: DataTypes.UUID },
    explanation_id: { type: DataTypes.UUID },
    note: { type: DataTypes.TEXT },
    // ---- Ra ca (cột thêm sau, tự thêm vào bảng cũ khi khởi động) ----
    check_out_at: { type: DataTypes.DATE },
    // ON_TIME ra đúng giờ | EARLY về sớm (có đơn) | FORGOT_APPROVED quên chấm, giải trình được duyệt | MISSING không chấm, không giải trình
    checkout_status: { type: DataTypes.STRING(20) },
    checkout_method: { type: DataTypes.STRING(20) },  // QR | REQUEST | AUTO
    checkout_photo_url: { type: DataTypes.STRING(500) },
    checkout_face_count: { type: DataTypes.INTEGER },
    minutes_early: { type: DataTypes.INTEGER, defaultValue: 0 },
});

// Đơn ra ca: EARLY_LEAVE xin về sớm (gửi trước khi về, quét QR ra ca được ngay)
//            FORGOT quên chấm ra ca (gửi sau khi hết khung QR ra ca; khai giờ về trước giờ kết thúc => coi là về sớm)
const AttendanceCheckoutRequest = sequelize.define('AttendanceCheckoutRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    shift_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    shift_date: { type: DataTypes.DATEONLY, allowNull: false },
    shift_type: { type: DataTypes.STRING(20), allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    reason_type: { type: DataTypes.STRING(30), allowNull: false },
    leave_time: { type: DataTypes.DATE, allowNull: false },     // giờ về dự kiến (về sớm) / giờ về thực tế khai (quên chấm)
    is_early: { type: DataTypes.BOOLEAN, defaultValue: false }, // giờ về trước giờ kết thúc ca
    description: { type: DataTypes.TEXT, allowNull: false },
    witness_name: { type: DataTypes.STRING(100) },
    evidence_urls: { type: DataTypes.JSONB, defaultValue: [] },
    committed: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' }, // PENDING | APPROVED | REJECTED
    reviewed_by: { type: DataTypes.UUID },
    reviewed_at: { type: DataTypes.DATE },
    review_note: { type: DataTypes.TEXT },
});

// ===================== LƯƠNG =====================
// Mức lương / ca riêng từng nhân viên; mỗi lần đổi là 1 dòng mới (lịch sử), áp dụng từ effective_from
const SalaryRate = sequelize.define('SalaryRate', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(20) },
    rate_per_shift: { type: DataTypes.INTEGER, allowNull: false },
    effective_from: { type: DataTypes.DATEONLY, allowNull: false },
    note: { type: DataTypes.STRING(300) },
    created_by: { type: DataTypes.UUID },
}, { updatedAt: false, indexes: [{ fields: ['employee_id', 'effective_from'] }] });

// Bảng lương 1 tháng: DRAFT nháp (tạo lại được) -> LOCKED đã duyệt & khóa (khóa luôn công của tháng)
const Payroll = sequelize.define('Payroll', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    month: { type: DataTypes.STRING(7), allowNull: false, unique: true }, // YYYY-MM
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    generated_at: { type: DataTypes.DATE },
    generated_by: { type: DataTypes.UUID },
    locked_at: { type: DataTypes.DATE },
    locked_by: { type: DataTypes.UUID },
    history: { type: DataTypes.JSONB, defaultValue: [] }, // tạo / tạo lại / khóa / mở khóa (kèm lý do)
});

// Dòng lương của 1 nhân viên (số liệu chụp lại lúc tạo bảng lương)
const PayrollItem = sequelize.define('PayrollItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    payroll_id: { type: DataTypes.UUID, allowNull: false },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    employee_name: { type: DataTypes.STRING },
    role: { type: DataTypes.STRING(20) },
    scheduled_shifts: { type: DataTypes.INTEGER, defaultValue: 0 },
    worked_shifts: { type: DataTypes.INTEGER, defaultValue: 0 },
    absent_shifts: { type: DataTypes.INTEGER, defaultValue: 0 },
    shift_pay: { type: DataTypes.BIGINT, defaultValue: 0 },
    normal_violations: { type: DataTypes.INTEGER, defaultValue: 0 },
    serious_violations: { type: DataTypes.INTEGER, defaultValue: 0 },
    attendance_bonus: { type: DataTypes.BIGINT, defaultValue: 0 },
    adjustments_plus: { type: DataTypes.BIGINT, defaultValue: 0 },
    adjustments_minus: { type: DataTypes.BIGINT, defaultValue: 0 },
    total: { type: DataTypes.BIGINT, defaultValue: 0 },     // đã làm tròn 1.000đ
    details: { type: DataTypes.JSONB, defaultValue: [] },   // từng ca: mức lương, kết quả, vi phạm
}, { indexes: [{ unique: true, fields: ['payroll_id', 'employee_id'] }] });

// Khoản khác (cộng: thưởng, phụ cấp | trừ: tạm ứng, bồi thường) — bắt buộc lý do; giữ lại khi tạo lại bảng lương
const PayrollAdjustment = sequelize.define('PayrollAdjustment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    payroll_id: { type: DataTypes.UUID, allowNull: false },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(10), allowNull: false },     // PLUS | MINUS
    category: { type: DataTypes.STRING(30), allowNull: false }, // BONUS, ALLOWANCE, ADVANCE, COMPENSATION, OTHER
    amount: { type: DataTypes.BIGINT, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    created_by: { type: DataTypes.UUID },
});

// Quyết định kỷ luật do quản lý ghi nhận (hệ thống chỉ đề xuất dựa trên số vi phạm nghiêm trọng)
const DisciplinaryAction = sequelize.define('DisciplinaryAction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    month: { type: DataTypes.STRING(7), allowNull: false },
    action: { type: DataTypes.STRING(30), allowNull: false }, // REMINDER nhắc nhở | REPRIMAND khiển trách | SALARY_RAISE_DELAY kéo dài thời hạn nâng lương
    reason: { type: DataTypes.TEXT, allowNull: false },
    decided_at: { type: DataTypes.DATEONLY, allowNull: false },
    delay_months: { type: DataTypes.INTEGER },                // kéo dài thời hạn nâng lương (tối đa 6 tháng)
    created_by: { type: DataTypes.UUID },
});

// Giải trình khi không kịp chấm công trong giờ mở QR. Mỗi ca chỉ được gửi 1 lần; quản lý duyệt hoặc từ chối.
const AttendanceExplanation = sequelize.define('AttendanceExplanation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    shift_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    shift_date: { type: DataTypes.DATEONLY, allowNull: false },
    shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING'), allowNull: false },
    reason_type: { type: DataTypes.STRING(30), allowNull: false },
    arrival_time: { type: DataTypes.DATE, allowNull: false }, // giờ có mặt thực tế nhân viên khai
    description: { type: DataTypes.TEXT, allowNull: false },
    evidence_urls: { type: DataTypes.JSONB, defaultValue: [] },
    witness_name: { type: DataTypes.STRING(100) },            // người xác nhận (đồng nghiệp / người giao việc)
    committed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // cam kết khai đúng sự thật
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' }, // PENDING | APPROVED | REJECTED
    reviewed_by: { type: DataTypes.UUID },
    reviewed_at: { type: DataTypes.DATE },
    review_note: { type: DataTypes.TEXT },
});

WorkShift.hasOne(AttendanceRecord, { foreignKey: 'shift_id' });
AttendanceRecord.belongsTo(WorkShift, { foreignKey: 'shift_id' });
WorkShift.hasOne(AttendanceExplanation, { foreignKey: 'shift_id' });
AttendanceExplanation.belongsTo(WorkShift, { foreignKey: 'shift_id' });
WorkShift.hasOne(AttendanceCheckoutRequest, { foreignKey: 'shift_id' });
AttendanceCheckoutRequest.belongsTo(WorkShift, { foreignKey: 'shift_id' });
Payroll.hasMany(PayrollItem, { foreignKey: 'payroll_id', onDelete: 'CASCADE' });
PayrollItem.belongsTo(Payroll, { foreignKey: 'payroll_id' });
Payroll.hasMany(PayrollAdjustment, { foreignKey: 'payroll_id', onDelete: 'CASCADE' });

// sync() không thêm cột mới vào bảng đã có => tự thêm cột còn thiếu (chỉ thêm, không sửa / xóa cột cũ)
const addMissingColumns = async () => {
    const qi = sequelize.getQueryInterface();
    const added = [];
    for (const model of [AttendanceRecord]) {
        const table = model.getTableName();
        const existing = await qi.describeTable(table);
        for (const [name, attr] of Object.entries(model.getAttributes())) {
            const field = attr.field || name;
            if (existing[field]) continue;
            await qi.addColumn(table, field, { type: attr.type, allowNull: true, defaultValue: attr.defaultValue });
            added.push(`${table}.${field}`);
        }
    }
    return added;
};

// Đồng bộ bảng được gọi 1 lần duy nhất trong index.js (trước đây gọi thêm ở đây với lỗi gõ {after:true})

module.exports = {
    sequelize,
    TreatmentPackage,
    WorkShift,
    AttendanceKiosk,
    AttendanceQr,
    AttendanceRecord,
    AttendanceExplanation,
    AttendanceCheckoutRequest,
    SalaryRate,
    Payroll,
    PayrollItem,
    PayrollAdjustment,
    DisciplinaryAction,
    addMissingColumns,
    ShiftRequest,
    Appointment,
    AppointmentCancellation,
    AppointmentReview,
    ServiceReview,
    FollowUpLog,
    CustomerPackage,
    TreatmentSession,
    SpaService,
    ServiceSession,
    Invoice,
    Transaction // Export bảng mới
};