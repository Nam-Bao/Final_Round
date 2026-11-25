const mongoose = require('mongoose');

const aiAnalysisSchema = new mongoose.Schema(
  {
    customer_id: { type: String, required: true, index: true },
    // web: khách tự soi trên website; clinic: CSKH chụp tại quầy, bác sĩ / hệ thống quét (ảnh thuộc hồ sơ khám, không xoá theo lượt soi)
    source: { type: String, enum: ['web', 'clinic'], default: 'web', index: true },
    appointment_id: { type: String, index: true }, // lượt soi tại phòng khám: lịch hẹn của buổi khám (1 lịch = 1 lượt)
    captured_by: String,                           // CSKH chụp ảnh
    client_ip: { type: String, index: true }, // Đếm hạn mức phân tích của khách vãng lai (chưa đăng nhập)
    image_url: { type: String }, // bắt buộc khi tạo (controller kiểm tra); lượt soi đã xoá thì không còn
    // 1 lượt soi = tối đa 3 ảnh (chính diện / má trái / má phải); image_url là ảnh đầu tiên (bản ghi cũ chỉ có image_url)
    images: [{
      url: String,
      angle: { type: String, enum: ['front', 'left', 'right'] },
      image_size: { width: Number, height: Number },
      inflammatory_count: Number,
      quality: mongoose.Schema.Types.Mixed,
    }],
    provider: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed', 'deleted'], default: 'success' },
    deleted_at: Date,      // khách xoá / hết hạn lưu 2 năm (services/scanDeletion.js): chỉ còn bản ghi tối thiểu để tính hạn mức
    delete_reason: String, // customer | retention
    error_message: String,

    // Bằng chứng khách đã đồng ý chính sách sử dụng hình ảnh (modal ở frontend)
    consent: {
      version: String,
      accepted_at: Date,
      allow_training: { type: Boolean, default: false }, // đồng ý tùy chọn: dùng ảnh (đã bỏ thông tin định danh) để cải thiện mô hình
      withdrawn_at: Date, // khách rút lại đồng ý dùng ảnh để huấn luyện
      source: String,      // web: khách tự tick; counter: CSKH ghi nhận khách đồng ý phân tích AI tại quầy
      recorded_by: String, // CSKH ghi nhận đồng ý phân tích AI
      training_answer: { type: String, enum: ['YES', 'NO'] }, // lượt tại phòng khám: bác sĩ hỏi khách có cho dùng ảnh cải thiện AI
      training_recorded_by: String,
      training_recorded_at: Date,
    },

    parsed_metrics: {
      skin_age: { type: Number, default: null }, // Đảm bảo nhận null, không lỗi Cast
      skin_type: String,
      overall_score: { type: Number, default: null }, // null khi AI chưa chắc chắn
      severity: String,
      severity_scale: String,          // cách tính mức độ (thang Hayashi theo số mụn viêm)
      inflammatory_count: Number,      // số mụn viêm app vẽ được
      image_quality: mongoose.Schema.Types.Mixed, // { brightness, sharpness, problems, ignored }
      level: { type: String, enum: ['detected', 'uncertain', 'none'] },
      summary: mongoose.Schema.Types.Mixed, // { 'Mụn mủ': 2, ... }
      groups: mongoose.Schema.Types.Mixed, // kết luận theo nhóm: [{ group, name, present, confirmed, possible, max_confidence }]
      image_size: { width: Number, height: Number },
      raw_count: Number,
      issues: [
        {
          image_index: { type: Number, default: 0 }, // ảnh nào trong lượt soi
          raw_class: String,
          group: String,
          issue_name: String,
          weight: Number,
          confidence: Number,
          certainty: { type: String, enum: ['confirmed', 'possible'] },
          bounding_box: mongoose.Schema.Types.Mixed, // { top, left, width, height }
          draw: { type: Boolean, default: true }, // false: nhóm không khoanh vùng (thâm sau mụn, mụn đầu đen/trắng)
        },
      ],
      ai_summary: mongoose.Schema.Types.Mixed, // mô tả từ model thị giác (tùy chọn)
    },

    // Hồ sơ người khám được soi (Bản thân / người thân) - để bác sĩ xem lịch sử soi da của đúng người
    patient_profile_id: { type: String, index: true },

    // Bác sĩ xác nhận / hiệu chỉnh kết quả AI (bắt buộc với lượt soi mới nhất khi khách đến khám)
    review: {
      // SUPERSEDED: lượt web chưa xác nhận, đã có lượt soi tại phòng khám của buổi khám => rút khỏi danh sách chờ của bác sĩ
      // (khách vẫn thấy lượt web với kết quả AI như cũ)
      status: { type: String, enum: ['PENDING', 'CONFIRMED', 'SUPERSEDED'], default: 'PENDING' },
      superseded_by: String,
      reviewed_by: String,            // bác sĩ xác nhận đầu tiên
      last_edited_by: String,         // người sửa gần nhất (bác sĩ / quản lý)
      reviewed_at: Date,              // lần lưu gần nhất
      appointment_id: String,
      duration_ms: Number,            // thời gian bác sĩ xem trước khi lưu
      low_effort: Boolean,            // xác nhận quá nhanh "tất cả đúng" => không dùng làm dữ liệu huấn luyện
      boxes: [{ index: Number, verdict: { type: String, enum: ['CORRECT', 'WRONG_CLASS', 'NOT_LESION'] }, corrected_class: String }],
      added_boxes: [{ image_index: { type: Number, default: 0 }, raw_class: String, bounding_box: mongoose.Schema.Types.Mixed }], // vùng AI bỏ sót, bác sĩ khoanh thêm
      missed: mongoose.Schema.Types.Mixed, // { inflammatory: 3, ... } tổng số nốt AI bỏ sót cả lượt (nhập nhanh, không khoanh)
      missed_images: mongoose.Schema.Types.Mixed, // [{ inflammatory: 2 }, { inflammatory: 3 }] số nốt bỏ sót theo từng ảnh
      groups: mongoose.Schema.Types.Mixed, // { inflammatory: true, comedone: false, ... } bác sĩ kết luận có / không
      severity: String,               // mức độ bác sĩ chốt
      note: String,                   // ghi chú của bác sĩ cho khách
    },
    // Giao lượt soi cho bác sĩ xác nhận sau (khi bác sĩ hoàn tất khám mà chưa xác nhận); hạn xác nhận due_at
    assignment: {
      doctor_id: { type: String, index: true },
      appointment_id: String,
      assigned_at: Date,
      due_at: Date,
      assigned_by: String,
    },
    // Thông tin người được soi (lưu kèm lúc giao việc) để tìm kiếm theo tên / số điện thoại
    subject: { name: String, phone: String, relationship: String },
    // Lịch sử chỉnh sửa kết quả đã xác nhận (đối chiếu khi có khiếu nại)
    review_history: [{ at: Date, by: String, review: mongoose.Schema.Types.Mixed, corrected_metrics: mongoose.Schema.Types.Mixed }],
    // Khách đã xem kết quả bác sĩ xác nhận chưa (để nhắc khách)
    customer_seen_at: Date,
    // Dữ liệu huấn luyện lại model (giai đoạn 1: xếp loại + xuất bộ dữ liệu COCO bằng scripts/export_training.js)
    training: {
      status: { type: String, enum: ['NOT_ELIGIBLE', 'QUEUED', 'EXPORTED', 'REMOVED'] },
      reason: String,          // lý do không dùng được (khách không đồng ý, thiếu nhãn, xác nhận quá nhanh...)
      updated_at: Date,
      export_file: String,     // tên file ngẫu nhiên trong bộ dữ liệu đã xuất (không chứa thông tin khách)
      export_batch: String,
      exported_at: Date,
    },

    // Kết quả sau khi bác sĩ hiệu chỉnh (khách xem bản này); parsed_metrics vẫn giữ nguyên kết quả gốc của AI để đo độ chính xác
    corrected_metrics: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

// Ảnh gốc khuôn mặt nhân viên để xác thực ảnh chấm công (dữ liệu sinh trắc học: chỉ lưu id ảnh riêng tư + vector, xoá khi nghỉ việc / rút đồng ý)
const faceSetSchema = new mongoose.Schema({
  photos: [String],                   // public_id ảnh riêng tư trên Cloudinary (thư mục O2O_Faces, không có URL công khai)
  descriptors: [[Number]],            // vector khuôn mặt 128 chiều của từng ảnh
  consistency: Number,                // khoảng cách lớn nhất giữa các ảnh đăng ký (cùng 1 người thì nhỏ)
  submitted_at: Date,
  consent_at: Date,                   // thời điểm nhân viên đồng ý cho xử lý dữ liệu khuôn mặt
  reviewed_by: String,
  reviewed_at: Date,
}, { _id: false });
const staffFaceSchema = new mongoose.Schema({
  user_id: { type: String, required: true, unique: true },
  active: faceSetSchema,              // bộ ảnh gốc đang dùng để so (quản lý đã duyệt)
  pending: faceSetSchema,             // bộ ảnh mới chờ quản lý duyệt (đăng ký lần đầu / đăng ký lại)
  rejected_note: String,              // lý do quản lý yêu cầu chụp lại
  rejected_at: Date,
}, { timestamps: true });

// Kho kiến thức cho RAG: mỗi dòng là 1 đoạn văn bản + vector embedding.
// ns CHAT: chatbot trên web khách (dịch vụ, gói, sản phẩm, bài viết, bác sĩ, chính sách, thông tin phòng khám)
// ns SAFETY: AI rà soát đơn kê (quy tắc an toàn đang áp dụng kèm nguồn y khoa)
// ns HANDBOOK: sổ tay quy trình nội bộ cho nhân viên (knowledge/so-tay, lọc theo vai trò) + chính sách khách hàng
const knowledgeChunkSchema = new mongoose.Schema({
  ns: { type: String, enum: ['CHAT', 'SAFETY', 'HANDBOOK'], required: true, index: true },
  key: { type: String, required: true, unique: true },   // ns:loại:mã:số thứ tự đoạn
  source_type: { type: String, required: true },          // SERVICE | PACKAGE | PRODUCT | ARTICLE | DOCTOR | EXPERT | POLICY | CLINIC | RULE
  source_id: String,
  title: { type: String, required: true },
  url: String,                                            // đường dẫn trên web khách (chatbot) hoặc link tài liệu nguồn (quy tắc)
  text: { type: String, required: true },
  meta: mongoose.Schema.Types.Mixed,                      // quy tắc: nguồn y khoa [{ label, url }], mức độ...
  hash: { type: String, required: true },                 // đổi nội dung => tạo lại embedding
  model: String,
  embedding: { type: [Number], required: true },
}, { timestamps: true });

// Khách cho chatbot xem dữ liệu riêng: hỏi trước, khách bấm đồng ý mới được xem. Đồng ý theo từng loại dữ liệu,
// chỉ trong 1 phiên chat (session_id do trình duyệt tạo mỗi lần mở chat) và hết hạn sau CHAT_CONSENT_MINUTES.
const chatConsentSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  session_id: { type: String, required: true },
  scope: { type: String, enum: ['APPOINTMENTS', 'POINTS', 'ORDERS'], required: true },
  granted_at: { type: Date, required: true },
  expires_at: { type: Date, required: true },
  revoked_at: Date,
  accesses: [{ at: Date, _id: false }],                   // mỗi lần chatbot đọc dữ liệu (để đối chiếu khi khách hỏi lại)
}, { timestamps: true });
chatConsentSchema.index({ user_id: 1, session_id: 1, scope: 1 });

module.exports = {
  AiAnalysis: mongoose.model('AiAnalysis', aiAnalysisSchema),
  StaffFace: mongoose.model('StaffFace', staffFaceSchema),
  KnowledgeChunk: mongoose.model('KnowledgeChunk', knowledgeChunkSchema),
  ChatConsent: mongoose.model('ChatConsent', chatConsentSchema),
};