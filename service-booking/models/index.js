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
    customer_reschedule_count: { type: DataTypes.INTEGER, defaultValue: 0 }, // khách tự đổi lịch (tối đa 1 lần)
    source: { type: DataTypes.STRING(20) },  // WALK_IN: khách đến thẳng phòng khám; null: lịch đặt trước
    arrived_at: { type: DataTypes.DATE },    // giờ khách đến thẳng vào danh sách chờ
    queued_at: { type: DataTypes.DATE },     // giờ CSKH chuyển khách vào hàng chờ của bác sĩ
    exam_started_at: { type: DataTypes.DATE }, // giờ bác sĩ bấm Bắt đầu khám
    status: {
        type: DataTypes.ENUM('PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'CHECK_IN', 'WAITING', 'IN_PROGRESS', 'WAITING_FOR_SALE', 'COMPLETED', 'CANCELLED', 'NEEDS_RESCHEDULE', 'NO_SHOW'),
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
    call_note: { type: DataTypes.TEXT },
    call_type: { type: DataTypes.STRING(20) },        // REMINDER: nhắc lịch hẹn | REVISIT: nhắc tái khám | AFTERCARE: thăm hỏi sau khám
    outcome: { type: DataTypes.STRING(20) },          // CAN_COME | CANNOT_COME | RESCHEDULED | CANCELLED | ANSWERED | NO_ANSWER
    reason: { type: DataTypes.TEXT },                 // lý do khách không đến được
    patient_profile_id: { type: DataTypes.UUID },
    medical_record_id: { type: DataTypes.UUID },      // bệnh án có ngày hẹn tái khám
    scheduled_for: { type: DataTypes.STRING(16) },    // ngày giờ của lịch lúc gọi, lịch đổi sau đó thì biết để gọi lại
    aftercare: { type: DataTypes.JSONB }              // tình trạng da, triệu chứng, dùng thuốc, hài lòng, khiếu nại
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
    // Chi tiết hoá đơn lúc chốt (báo cáo doanh thu theo nguồn): phí khám, dịch vụ lẻ, gói, mỹ phẩm, giảm giá, cọc tư vấn
    breakdown: { type: DataTypes.JSONB },
});

const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoice_id: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, // Số dương là thu, số âm là hoàn
    transaction_type: { type: DataTypes.ENUM('INCOME', 'REFUND'), allowNull: false },
    note: { type: DataTypes.STRING }
});

// ===== TƯ VẤN CHUYÊN GIA (chuyên gia thỉnh giảng, tài khoản EXPERT bên identity) =====
// Bảng riêng, không ghi chung vào Appointments: tư vấn không phải lượt khám (không tính "khách cũ", không tính lượt khám bác sĩ).

// Ca rảnh của chuyên gia do Admin / Quản lý mở. Khách đặt theo khung 1 tiếng trong ca (giống lịch khám).
const ExpertShift = sequelize.define('ExpertShift', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    expert_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    shift_type: { type: DataTypes.ENUM('MORNING', 'AFTERNOON', 'EVENING'), allowNull: false },
    created_by: { type: DataTypes.UUID },
}, {
    indexes: [{ unique: true, fields: ['expert_id', 'date', 'shift_type'] }]
});

const Consultation = sequelize.define('Consultation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    customer_id: { type: DataTypes.UUID, allowNull: false },
    customer_name: { type: DataTypes.STRING },          // ảnh chụp tên lúc đặt (chuyên gia không được đọc danh sách khách)
    expert_id: { type: DataTypes.UUID, allowNull: false },
    expert_name: { type: DataTypes.STRING },
    consult_field: { type: DataTypes.STRING(20), allowNull: false }, // DERMATOLOGY | NUTRITION | COSMETICS
    appointment_date: { type: DataTypes.DATEONLY, allowNull: false },
    appointment_time: { type: DataTypes.TIME, allowNull: false },
    question: { type: DataTypes.TEXT, allowNull: false },
    // PENDING_PAYMENT: giữ chỗ chờ cọc | CONFIRMED: đã cọc | COMPLETED: cả 2 bên đã vào phòng
    // NO_SHOW: khách không vào (mất cọc) | EXPERT_ABSENT: chuyên gia không vào (hoàn cọc) | CANCELLED
    status: {
        type: DataTypes.ENUM('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'EXPERT_ABSENT', 'CANCELLED'),
        defaultValue: 'PENDING_PAYMENT'
    },
    deposit_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payment_method: { type: DataTypes.ENUM('VIETQR', 'CASH', 'UNKNOWN'), defaultValue: 'UNKNOWN' },
    paid_at: { type: DataTypes.DATE },
    // Hủy lịch: cùng quy định với lịch khám (khách hủy => mất cọc, phòng khám hủy => hoàn cọc)
    cancel_initiator: { type: DataTypes.ENUM('CUSTOMER', 'CLINIC') },
    cancel_reason: { type: DataTypes.TEXT },
    cancelled_by: { type: DataTypes.UUID },
    cancelled_at: { type: DataTypes.DATE },
    // NONE | FORFEITED: phòng khám giữ cọc | REFUND_PENDING: chờ hoàn | REFUNDED: đã hoàn
    deposit_outcome: { type: DataTypes.ENUM('NONE', 'FORFEITED', 'REFUND_PENDING', 'REFUNDED'), defaultValue: 'NONE' },
    refund_ref: { type: DataTypes.STRING },
    refunded_by: { type: DataTypes.UUID },
    refunded_at: { type: DataTypes.DATE },
    // Bằng chứng buổi tư vấn diễn ra (căn cứ trả thù lao chuyên gia)
    customer_joined_at: { type: DataTypes.DATE },
    expert_joined_at: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    // Kết quả tư vấn do chuyên gia ghi
    expert_note: { type: DataTypes.TEXT },
    recommend_exam: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Đánh giá của khách (1 lần, sau khi hoàn thành)
    rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
    review_comment: { type: DataTypes.TEXT },
    reviewed_at: { type: DataTypes.DATE },
    // Tiền cọc tư vấn được trừ vào phí khám của lịch khám này (mỗi buổi tư vấn chỉ trừ 1 lần)
    credit_appointment_id: { type: DataTypes.UUID },
    // ---- Cột thêm sau (tự thêm vào bảng cũ khi khởi động) ----
    // Kết quả tư vấn chuyên gia nhập: { assessment, advice, lifestyle, follow_up, products: [{ product_id, name, slug, image_url, price, quantity, usage }] }
    result: { type: DataTypes.JSONB },
    reschedule_count: { type: DataTypes.INTEGER, defaultValue: 0 }, // khách tự đổi lịch (tối đa 1 lần)
    review_hidden: { type: DataTypes.BOOLEAN, defaultValue: false }, // quản lý ẩn đánh giá vi phạm
    payment_ref: { type: DataTypes.STRING(50) },                    // mã giao dịch khi nhân viên xác nhận cọc thủ công
});

// Thù lao chuyên gia đã chốt theo tháng (chụp lại mức thù lao lúc chốt: đổi mức về sau không ảnh hưởng tháng cũ)
const ExpertPayout = sequelize.define('ExpertPayout', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    month: { type: DataTypes.STRING(7), allowNull: false },
    expert_id: { type: DataTypes.UUID, allowNull: false },
    expert_name: { type: DataTypes.STRING },
    completed: { type: DataTypes.INTEGER, defaultValue: 0 },
    no_show: { type: DataTypes.INTEGER, defaultValue: 0 },
    session_fee: { type: DataTypes.INTEGER, defaultValue: 0 },
    amount: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'CLOSED' }, // CLOSED: đã chốt | PAID: đã trả
    closed_by: { type: DataTypes.UUID },
    paid_ref: { type: DataTypes.STRING(50) },
    paid_at: { type: DataTypes.DATE },
    paid_by: { type: DataTypes.UUID },
}, { indexes: [{ unique: true, fields: ['month', 'expert_id'] }] });

// Sổ giao dịch ngân hàng SePay báo về: lưu MỌI khoản tiền vào để không mất dấu khoản không khớp được lịch nào
// Sàng lọc an toàn theo hồ sơ người khám: tình trạng liên quan chống chỉ định, dị ứng, lần hỏi gần nhất
const PatientSafety = sequelize.define('PatientSafety', {
    patient_profile_id: { type: DataTypes.UUID, primaryKey: true },
    flags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    allergies: { type: DataTypes.TEXT },
    screened_at: { type: DataTypes.DATE },
    screened_by: { type: DataTypes.UUID },
    // Câu trả lời khách khai khi mua tại quầy (NVBH hỏi). KHÔNG tính là sàng lọc của lần khám (không đổi flags / screened_at):
    // CSKH thấy ở khung "Sàng lọc an toàn", bấm điền vào form rồi tự xác nhận lại với khách
    counter_flags: { type: DataTypes.JSONB },
    counter_allergies: { type: DataTypes.TEXT },
    counter_reported_at: { type: DataTypes.DATE },
    counter_reported_by: { type: DataTypes.UUID },
    counter_order_id: { type: DataTypes.UUID },
});

// ===== QUY TẮC CHỐNG CHỈ ĐỊNH (quản lý soạn -> bác sĩ xem xét -> quản lý duyệt), xem utils/safetyRules.js
// Nguồn của quy tắc: link tài liệu, tài liệu tải lên (tờ hướng dẫn thuốc...) hoặc quy định phòng khám
const SafetySource = sequelize.define('SafetySource', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(60), unique: true },           // mã của nguồn khởi tạo (EMA_RETINOID...)
    kind: { type: DataTypes.STRING(20), allowNull: false },       // LINK | DOCUMENT | CLINIC
    label: { type: DataTypes.STRING(500), allowNull: false },
    url: { type: DataTypes.STRING(1000) },                        // link tài liệu hoặc file tải lên
    created_by: { type: DataTypes.UUID },
});
// Đối tượng của quy tắc: hoạt chất (tìm trong bảng thành phần) hoặc thủ thuật (tìm trong tên dịch vụ / gói)
const SafetyTarget = sequelize.define('SafetyTarget', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    kind: { type: DataTypes.STRING(20), allowNull: false },       // INGREDIENT | PROCEDURE
    label: { type: DataTypes.STRING(200), allowNull: false },
    keywords: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    excludes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    all_of: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // ACTIVE: đang dùng | DRAFT: hoạt chất mới trong 1 đề xuất, chỉ dùng khi quy tắc đó được duyệt
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
    created_by: { type: DataTypes.UUID },
});
const SafetyRule = sequelize.define('SafetyRule', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    flag: { type: DataTypes.STRING(40), allowNull: false },       // câu sàng lọc (FLAGS)
    target_id: { type: DataTypes.UUID, allowNull: false },
    severity: { type: DataTypes.STRING(20), allowNull: false },   // CONTRAINDICATED | CAUTION | INFO
    message: { type: DataTypes.TEXT, allowNull: false },
    source_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    // Quản lý soạn: DRAFT -> IN_REVIEW (bác sĩ xem xét) -> REVIEWED -> ACTIVE (quản lý chung duyệt) | REJECTED
    // Bác sĩ đề xuất: DRAFT -> PROPOSED -> (CHANGES_REQUESTED -> PROPOSED) -> ACTIVE | REJECTED (có thể qua IN_REVIEW nếu quản lý gửi thêm bác sĩ)
    // Bản cũ khi bản sửa được duyệt: SUPERSEDED; khi đề xuất ngưng được duyệt: INACTIVE (đề xuất ngưng: APPLIED)
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    change_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NEW' }, // NEW | EDIT | DEACTIVATE
    replaces_rule_id: { type: DataTypes.UUID },                   // bản sửa / đề xuất ngưng của quy tắc đang áp dụng nào
    change_reason: { type: DataTypes.TEXT },                      // lý do sửa / ngưng
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    origin: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANAGER' }, // SYSTEM | MANAGER | DOCTOR
    created_by: { type: DataTypes.UUID },
    review_round: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    submitted_at: { type: DataTypes.DATE },
    decided_by: { type: DataTypes.UUID },                         // quản lý duyệt / từ chối
    decided_at: { type: DataTypes.DATE },
    decision_note: { type: DataTypes.TEXT },
});
// Ý kiến của bác sĩ được chọn xem xét, theo từng vòng gửi (sửa quy tắc => vòng mới, ý kiến cũ hết hiệu lực)
const SafetyRuleReview = sequelize.define('SafetyRuleReview', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rule_id: { type: DataTypes.UUID, allowNull: false },
    round: { type: DataTypes.INTEGER, allowNull: false },
    reviewer_id: { type: DataTypes.UUID, allowNull: false },
    verdict: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' }, // PENDING | AGREE | CHANGES | DISAGREE
    comment: { type: DataTypes.TEXT },
    responded_at: { type: DataTypes.DATE },
    replaced: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // quản lý đã đổi sang bác sĩ khác
});
// Nhật ký mọi thao tác trên quy tắc (kèm nội dung lúc đó)
const SafetyRuleEvent = sequelize.define('SafetyRuleEvent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rule_id: { type: DataTypes.UUID, allowNull: false },
    actor_id: { type: DataTypes.UUID },
    actor_role: { type: DataTypes.STRING(20) },
    action: { type: DataTypes.STRING(30), allowNull: false },
    note: { type: DataTypes.TEXT },
    snapshot: { type: DataTypes.JSONB },
});

// Kết quả AI rà soát đơn của 1 lịch khám (lần mới nhất được dùng khi hoàn tất khám):
// cảnh báo AI mức Thận trọng / Chống chỉ định về mục còn trong đơn => bác sĩ phải xác nhận + ghi lý do như cảnh báo của bảng quy tắc
const AiReviewLog = sequelize.define('AiReviewLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    appointment_id: { type: DataTypes.UUID, allowNull: false },
    patient_profile_id: { type: DataTypes.UUID },
    doctor_id: { type: DataTypes.UUID },
    item_names: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // các mục trong đơn lúc rà soát
    warnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    model: { type: DataTypes.STRING(80) },
}, { indexes: [{ fields: ['appointment_id'] }] });

// Bác sĩ vẫn kê dù có cảnh báo: lưu lại cảnh báo đã thấy và lý do
const SafetyOverride = sequelize.define('SafetyOverride', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    appointment_id: { type: DataTypes.UUID, allowNull: false },
    patient_profile_id: { type: DataTypes.UUID },
    doctor_id: { type: DataTypes.UUID, allowNull: false },
    warnings: { type: DataTypes.JSONB, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
}, { updatedAt: false });

const BankTransaction = sequelize.define('BankTransaction', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    external_id: { type: DataTypes.STRING(50), unique: true },  // mã giao dịch của SePay (chống xử lý trùng)
    amount: { type: DataTypes.BIGINT, allowNull: false },
    content: { type: DataTypes.STRING(500) },
    code_type: { type: DataTypes.STRING(20) },   // APPOINTMENT | CONSULTATION | ORDER | NONE
    code: { type: DataTypes.STRING(10) },
    matched_id: { type: DataTypes.UUID },
    status: { type: DataTypes.STRING(20), allowNull: false },   // MATCHED | PARTIAL | UNMATCHED | OVERPAID (đã xác nhận, còn phải hoàn phần dư) | RESOLVED
    reason: { type: DataTypes.STRING(300) },
    received_at: { type: DataTypes.DATE },
    resolved_action: { type: DataTypes.STRING(20) },            // REFUNDED | MANUAL | IGNORED
    resolved_ref: { type: DataTypes.STRING(50) },
    resolved_note: { type: DataTypes.STRING(500) },
    resolved_by: { type: DataTypes.UUID },
    resolved_at: { type: DataTypes.DATE },
    customer_id: { type: DataTypes.UUID },                       // khách của lịch / đơn theo mã (để CSKH liên hệ)
    reference_code: { type: DataTypes.STRING(50) },              // mã tham chiếu ngân hàng (đối chiếu sao kê)
});

// Mỗi lần nhân viên ghi "đã chuyển khoản hoàn tiền" (5 nơi: đối soát tiền vào, hoàn cọc khám, hoàn cọc tư vấn, đơn mỹ phẩm hủy,
// hoàn trả hàng). Nhân viên tự nhập mã giao dịch nên chưa đủ tin: khoản hoàn chỉ "đã xác minh" khi ngân hàng báo có tiền ra
// với nội dung "HOAN <mã>" đúng số tiền (SePay, tự động), hoặc quản lý đã đối chiếu sao kê.
const RefundClaim = sequelize.define('RefundClaim', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    source: { type: DataTypes.STRING(20), allowNull: false },     // BANK_TX | APPOINTMENT | CONSULTATION | ORDER | RETURN
    source_id: { type: DataTypes.UUID, allowNull: false },
    transfer_code: { type: DataTypes.STRING(10), allowNull: false }, // 6 ký tự đầu mã nguồn; nội dung chuyển khoản "HOAN <mã>"
    customer_id: { type: DataTypes.UUID },
    amount: { type: DataTypes.BIGINT, allowNull: false },
    bank_ref: { type: DataTypes.STRING(50) },                     // mã giao dịch nhân viên nhập
    account: { type: DataTypes.STRING(200) },                     // tài khoản nhận hoàn: ngân hàng - số TK - chủ TK
    claimed_by: { type: DataTypes.UUID },
    claimed_at: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'WAITING' }, // WAITING | VERIFIED | DISPUTED
    verified_method: { type: DataTypes.STRING(10) },              // BANK | MANAGER
    verified_by: { type: DataTypes.UUID },
    verified_at: { type: DataTypes.DATE },
    bank_tx_id: { type: DataTypes.UUID },                         // giao dịch tiền ra đã khớp
    manager_note: { type: DataTypes.STRING(500) },
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
    paid_at: { type: DataTypes.DATE },        // đã chi trả lương tháng này
    paid_by: { type: DataTypes.UUID },
    paid_ref: { type: DataTypes.STRING(50) }, // mã lệnh chuyển lương
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
    for (const model of [AttendanceRecord, Consultation, Appointment, Payroll, FollowUpLog, BankTransaction, PatientSafety, SafetyRule, SafetyTarget, SafetySource, SafetyRuleReview]) {
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

// Thông báo real-time: dữ liệu đổi => trang quản trị tự cập nhật số việc đang chờ và dữ liệu trang đang mở
const { watch } = require('../utils/notify');
watch(Appointment, 'appointments');
watch(AppointmentCancellation, 'appointments');
watch(Consultation, 'consultations');
watch(ShiftRequest, 'shift-requests');
watch(AttendanceCheckoutRequest, 'attendance');
watch(AttendanceExplanation, 'attendance');
watch(RefundClaim, 'bank');
watch(BankTransaction, 'bank');
watch(TreatmentSession, 'sessions');
watch(ServiceSession, 'sessions');
for (const m of [SafetyRule, SafetyRuleReview, SafetySource, SafetyTarget]) watch(m, 'safety-rules');

module.exports = {
    sequelize,
    SafetySource, SafetyTarget, SafetyRule, SafetyRuleReview, SafetyRuleEvent, AiReviewLog,
    TreatmentPackage,
    WorkShift,
    AttendanceKiosk,
    AttendanceQr,
    AttendanceRecord,
    AttendanceExplanation,
    AttendanceCheckoutRequest,
    ExpertPayout,
    BankTransaction,
    RefundClaim,
    PatientSafety,
    SafetyOverride,
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
    Transaction, // Export bảng mới
    ExpertShift,
    Consultation
};