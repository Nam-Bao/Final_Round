const axios = require('axios');
const { AiAnalysis } = require('../models');

/* ------------------------------------------------------------------ */
/* Cấu hình                                                            */
/* ------------------------------------------------------------------ */
const RF_BASE = process.env.ROBOFLOW_BASE_URL || 'https://detect.roboflow.com';
const FETCH_CONF = Number(process.env.ROBOFLOW_FETCH_CONF || 10); // % - lấy về thấp, tự lọc phía server
const MIN_SHOW_CONF = Number(process.env.MIN_SHOW_CONF || 20);     // dưới mức này bỏ hẳn
const CONFIRM_CONF = Number(process.env.CONFIRM_CONF || 40);       // >= mức này: "phát hiện chắc"
const ALLOWED_IMAGE_HOST = process.env.ALLOWED_IMAGE_HOST || 'res.cloudinary.com';

// 12 class của model skin-problems-detection-jp4jv/4 (key viết thường)
// maxArea: diện tích box tối đa so với diện tích ảnh (0-1). Box lớn hơn mức này coi là nhiễu.
// Giá trị lấy từ phân vị 99% kích thước box thật trong dataset x 1.3 (xem scripts/dataset_stats.js).
// Lưu ý: dataset gán nhãn freckles/melasma/wrinkle theo VÙNG (nhiều box dạng thanh dài), nên ngưỡng của chúng rộng.
const CLASS_MAP = {
  pustule: { vi: 'Mụn mủ', weight: 3, maxArea: 0.03 },
  nodule: { vi: 'Mụn viêm/nang', weight: 4, maxArea: 0.08 },
  papule: { vi: 'Mụn sẩn đỏ', weight: 2, maxArea: 0.08 },
  blackhead: { vi: 'Mụn đầu đen', weight: 1, maxArea: 0.06 },
  whitehead: { vi: 'Mụn ẩn/đầu trắng', weight: 1, maxArea: 0.02 },
  cyst: { vi: 'Mụn bọc', weight: 5, maxArea: 0.11 },
  pih: { vi: 'Thâm sau mụn (PIH)', weight: 2, maxArea: 0.03 },
  melasma: { vi: 'Nám da', weight: 3, maxArea: 1 },
  freckles: { vi: 'Tàn nhang', weight: 1, maxArea: 0.36 },
  'dark circle': { vi: 'Quầng thâm', weight: 2, maxArea: 0.2 },
  wrinkle: { vi: 'Nếp nhăn', weight: 2, maxArea: 0.06 },
  'skin-pore': { vi: 'Lỗ chân lông to', weight: 1, maxArea: 0.02 },
};

/* ------------------------------------------------------------------ */
/* Hàm hỗ trợ                                                          */
/* ------------------------------------------------------------------ */

// Chuẩn hóa ảnh Cloudinary trước khi gửi model: xoay theo EXIF, giới hạn 1280px, ép JPG
const optimizeUrl = (url) =>
  url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/a_exif,c_limit,w_1280,f_jpg,q_auto/')
    : url;

const isAllowedUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === ALLOWED_IMAGE_HOST;
  } catch {
    return false;
  }
};

const iou = (a, b) => {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union ? inter / union : 0;
};

// Cùng class trùng > 50% hoặc khác class trùng > 80% => giữ box có độ tin cậy cao hơn
const dedupe = (issues) => {
  const sorted = [...issues].sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const it of sorted) {
    const dup = kept.some(
      (k) => iou(k.bounding_box, it.bounding_box) > (k.raw_class === it.raw_class ? 0.5 : 0.8)
    );
    if (!dup) kept.push(it);
  }
  return kept;
};

// Fallback mô tả bằng model thị giác. Tùy chọn: thiếu SDK/API key thì bỏ qua, không làm sập server.
const tryDescribeSkin = async (imageUrl) => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { describeSkin } = require('../services/skinVision');
    return await describeSkin(imageUrl);
  } catch (e) {
    console.error('[Vision fallback]', e.message);
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */
exports.analyzeFace = async (req, res) => {
  console.log('[analyzeFace] HIT', new Date().toISOString()); // không thấy dòng này => request không vào controller này

  const { customer_id, image_url, consent } = req.body;

  if (!customer_id || !image_url) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin hình ảnh' });
  }
  // Bắt buộc có xác nhận chính sách sử dụng hình ảnh (modal ở frontend)
  if (!consent?.version || !consent?.accepted_at) {
    return res.status(400).json({ success: false, message: 'Thiếu xác nhận chính sách sử dụng hình ảnh' });
  }
  if (!isAllowedUrl(image_url)) {
    return res.status(400).json({ success: false, message: 'URL ảnh không hợp lệ' });
  }

  try {
    const { ROBOFLOW_PROJECT, ROBOFLOW_VERSION, ROBOFLOW_API_KEY } = process.env;
    const sentUrl = optimizeUrl(image_url);

    const response = await axios.post(
      `${RF_BASE}/${ROBOFLOW_PROJECT}/${ROBOFLOW_VERSION}`,
      null,
      {
        params: { api_key: ROBOFLOW_API_KEY, image: sentUrl, confidence: FETCH_CONF, overlap: 30 },
        timeout: 30000,
      }
    );

    const { predictions = [], image: imgSize } = response.data;
    console.log(
      '[Roboflow] raw:',
      predictions.map((p) => `${p.class}:${Math.round(p.confidence * 100)}%`).join(', ') || '(không có)',
      JSON.stringify(imgSize)
    );

    const imgArea = (imgSize?.width || 1) * (imgSize?.height || 1);
    const dropped = [];

    // 1) Lọc theo độ tin cậy và kích thước hợp lý, map class, gắn mức chắc chắn
    let issues = predictions
      .filter((p) => p.confidence * 100 >= MIN_SHOW_CONF)
      .filter((p) => {
        const meta = CLASS_MAP[p.class.trim().toLowerCase()];
        const areaRatio = (p.width * p.height) / imgArea;
        if (meta?.maxArea && areaRatio > meta.maxArea) {
          dropped.push(`${p.class}:${Math.round(p.confidence * 100)}% (box chiếm ${(areaRatio * 100).toFixed(1)}% ảnh)`);
          return false;
        }
        return true;
      })
      .map((p) => {
        const meta = CLASS_MAP[p.class.trim().toLowerCase()];
        const confidence = p.confidence * 100;
        return {
          raw_class: p.class,
          issue_name: meta?.vi || p.class,
          weight: meta?.weight ?? 1,
          confidence,
          certainty: confidence >= CONFIRM_CONF ? 'confirmed' : 'possible',
          bounding_box: {
            top: p.y - p.height / 2,
            left: p.x - p.width / 2,
            width: p.width,
            height: p.height,
          },
        };
      });
    if (dropped.length) console.log('[Roboflow] bỏ box quá lớn:', dropped.join('; '));

    // 2) Khử trùng lặp
    issues = dedupe(issues);

    // 3) Chấm điểm: trọng số loại lỗi x độ tin cậy x diện tích tổn thương
    const penalty = issues.reduce((sum, i) => {
      const areaFactor = 1 + Math.min(3, ((i.bounding_box.width * i.bounding_box.height) / imgArea) * 20);
      const certaintyFactor = i.certainty === 'confirmed' ? 1 : 0.5;
      return sum + i.weight * (i.confidence / 100) * 3 * areaFactor * certaintyFactor;
    }, 0);

    // 4) 3 trạng thái - "không phát hiện" KHÔNG có nghĩa là "da khỏe".
    //    Chỉ chấm điểm khi có phát hiện chắc chắn; còn lại để null để giao diện không hiện điểm gây hiểu lầm.
    const hasConfirmed = issues.some((i) => i.certainty === 'confirmed');
    const level = hasConfirmed ? 'detected' : issues.length ? 'uncertain' : 'none';
    const overall_score = level === 'detected' ? Math.round(Math.max(0, 100 - penalty)) : null;
    const severity =
      level === 'none' ? 'Chưa xác định'
      : level === 'uncertain' ? 'Cần xác nhận'
      : penalty >= 25 ? 'Nghiêm trọng'
      : penalty >= 10 ? 'Trung bình'
      : 'Nhẹ';

    const summary = issues.reduce((acc, i) => {
      acc[i.issue_name] = (acc[i.issue_name] || 0) + 1;
      return acc;
    }, {});

    // 5) Detection không chắc => nhờ model thị giác mô tả để nhân viên tham khảo
    const ai_summary = level !== 'detected' ? await tryDescribeSkin(sentUrl) : null;

    const record = await AiAnalysis.create({
      customer_id,
      image_url,
      provider: 'Roboflow',
      status: 'success',
      consent: {
        version: String(consent.version),
        accepted_at: new Date(consent.accepted_at),
        allow_training: consent.allow_training === true,
      },
      parsed_metrics: {
        skin_age: null,
        skin_type: 'Phân tích qua hình ảnh',
        overall_score,
        severity,
        level,
        summary,
        image_size: imgSize,
        raw_count: predictions.length,
        issues,
        ai_summary,
      },
    });

    return res.status(200).json({
      success: true,
      data: record,
      ...(req.query.debug === '1' && process.env.NODE_ENV !== 'production' && {
        debug: {
          sent_url: sentUrl,
          image_size: imgSize,
          raw: predictions.map((p) => ({ class: p.class, confidence: Math.round(p.confidence * 1000) / 10 })),
          dropped_too_large: dropped,
        },
      }),
    });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error('[Roboflow Error]', errorMessage);

    try {
      await AiAnalysis.create({
        customer_id,
        image_url,
        provider: 'Roboflow',
        status: 'failed',
        error_message: errorMessage,
      });
    } catch (dbErr) {
      console.error('[DB Error]', dbErr.message);
    }

    return res.status(500).json({ success: false, message: 'Lỗi phân tích AI', error: errorMessage });
  }
};