const mongoose = require('mongoose');
// Cấu hình kết nối (Để mẫu)
// mongoose.connect('mongodb://localhost:27017/medical_db');

// 1. Hồ sơ da liễu tổng quát
const dermatologyProfileSchema = new mongoose.Schema({
  customer_id: { type: String, required: true, index: true }, // UUID dạng String
  skin_type: String,
  allergies: [String],
  current_routine: String,
}, { timestamps: true });

// 2. Nhật ký theo dõi da (Khách hàng tự chụp)
const skinDiarySchema = new mongoose.Schema({
  customer_id: { type: String, required: true },
  date: { type: Date, default: Date.now },
  images: [String], // URLs ảnh
  notes: String,
  condition_rating: Number
});

// 3. Hồ sơ bệnh án & Kê đơn (Bác sĩ ghi)
const medicalRecordSchema = new mongoose.Schema({
  appointment_id: { type: String, required: true }, // Liên kết Postgres
  doctor_id: String,
  customer_id: String,
  diagnosis: String,
  doctor_notes: String,
  e_prescription: [{
    product_id: String, // Liên kết Postgres Commerce
    dosage: String,
    instructions: String
  }]
}, { timestamps: true });

// 4. Kết quả phân tích AI
const aiAnalysisSchema = new mongoose.Schema({
  customer_id: String,
  scan_date: { type: Date, default: Date.now },
  image_url: String,
  metrics: mongoose.Schema.Types.Mixed, // Cho phép object linh hoạt
  recommendations: mongoose.Schema.Types.Mixed
});

module.exports = {
  DermatologyProfile: mongoose.model('DermatologyProfile', dermatologyProfileSchema),
  SkinDiary: mongoose.model('SkinDiary', skinDiarySchema),
  MedicalRecord: mongoose.model('MedicalRecord', medicalRecordSchema),
  AiAnalysis: mongoose.model('AiAnalysis', aiAnalysisSchema)
};