// Kiểm tra chất lượng ảnh trước khi gửi model (ảnh tối / mờ cho kết quả sai và tốn lượt của khách).
// Đo trên ảnh thu về rộng 512px, ảnh xám:
// - brightness: độ sáng trung bình (0 - 255)
// - sharpness: độ lệch chuẩn của ảnh sau lọc Laplacian (cạnh / chi tiết càng rõ càng cao)
// Ngưỡng chọn bằng scripts/image_quality_calibrate.js trên ảnh của bộ dữ liệu + bản làm mờ / làm tối (config/aiConfig.json > imageQuality).
const sharp = require('sharp');

// Tự tính trên điểm ảnh thô sau khi xử lý (stats() của sharp đo ảnh đầu vào, không qua các bước xử lý)
const measure = async (input) => {
  const { data, info } = await sharp(input, { failOn: 'none' }).rotate().resize({ width: 512 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  for (let k = 0; k < data.length; k++) sum += data[k];
  // Laplacian 4 lân cận, bỏ viền
  let n = 0; let mean = 0; let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      const v = data[k - w] + data[k + w] + data[k - 1] + data[k + 1] - 4 * data[k];
      n++; const d = v - mean; mean += d / n; m2 += d * (v - mean);
    }
  }
  return { brightness: Math.round((sum / data.length) * 10) / 10, sharpness: Math.round(Math.sqrt(m2 / n) * 100) / 100 };
};

// Trả { ok, problems: ['dark'|'bright'|'blurry'], metrics }
const check = async (input, limits) => {
  const metrics = await measure(input);
  const problems = [];
  if (metrics.brightness < limits.minBrightness) problems.push('dark');
  if (metrics.brightness > limits.maxBrightness) problems.push('bright');
  if (metrics.sharpness < limits.minSharpness) problems.push('blurry');
  return { ok: problems.length === 0, problems, metrics };
};

const MESSAGES = {
  dark: 'Ảnh quá tối',
  bright: 'Ảnh bị chói / quá sáng',
  blurry: 'Ảnh bị mờ hoặc rung',
};

module.exports = { measure, check, MESSAGES };
