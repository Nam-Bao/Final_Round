const mongoose = require('mongoose');

const aiAnalysisSchema = new mongoose.Schema(
  {
    customer_id: { type: String, required: true, index: true },
    client_ip: { type: String, index: true }, // Đếm hạn mức phân tích của khách vãng lai (chưa đăng nhập)
    image_url: { type: String, required: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    error_message: String,

    // Bằng chứng khách đã đồng ý chính sách sử dụng hình ảnh (modal ở frontend)
    consent: {
      version: String,
      accepted_at: Date,
      allow_training: { type: Boolean, default: false }, // đồng ý tùy chọn: dùng ảnh ẩn danh để cải thiện mô hình
    },

    parsed_metrics: {
      skin_age: { type: Number, default: null }, // Đảm bảo nhận null, không lỗi Cast
      skin_type: String,
      overall_score: { type: Number, default: null }, // null khi AI chưa chắc chắn
      severity: String,
      level: { type: String, enum: ['detected', 'uncertain', 'none'] },
      summary: mongoose.Schema.Types.Mixed, // { 'Mụn mủ': 2, ... }
      groups: mongoose.Schema.Types.Mixed, // kết luận theo nhóm: [{ group, name, present, confirmed, possible, max_confidence }]
      image_size: { width: Number, height: Number },
      raw_count: Number,
      issues: [
        {
          raw_class: String,
          group: String,
          issue_name: String,
          weight: Number,
          confidence: Number,
          certainty: { type: String, enum: ['confirmed', 'possible'] },
          bounding_box: mongoose.Schema.Types.Mixed, // { top, left, width, height }
        },
      ],
      ai_summary: mongoose.Schema.Types.Mixed, // mô tả từ model thị giác (tùy chọn)
    },
  },
  { timestamps: true }
);

module.exports = {
  AiAnalysis: mongoose.model('AiAnalysis', aiAnalysisSchema),
};