const axios = require('axios');
const { AiAnalysis } = require('../models');
const pp = require('../services/postprocess'); // dùng chung với scripts/evaluate.js
const cfg = pp.config;                         // config/aiConfig.json: class, nhóm, ngưỡng

/* ------------------------------------------------------------------ */
/* Cấu hình                                                            */
/* ------------------------------------------------------------------ */
const RF_BASE = process.env.ROBOFLOW_BASE_URL || 'https://detect.roboflow.com';
const FETCH_CONF = Number(process.env.ROBOFLOW_FETCH_CONF || cfg.fetchConf); // % - lấy về thấp, tự lọc theo từng nhóm
const ALLOWED_IMAGE_HOST = process.env.ALLOWED_IMAGE_HOST || 'res.cloudinary.com';
const VISION_DAILY_CAP = Number(process.env.VISION_DAILY_CAP || 50);         // giới hạn số lượt gọi model mô tả mỗi ngày

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

// Fallback mô tả bằng model thị giác. Tùy chọn: thiếu SDK/API key hoặc hết hạn mức ngày thì bỏ qua.
let visionCalls = 0;
let visionDay = new Date().toDateString();
const tryDescribeSkin = async (imageUrl) => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (visionDay !== new Date().toDateString()) { visionDay = new Date().toDateString(); visionCalls = 0; }
  if (visionCalls >= VISION_DAILY_CAP) return null;
  visionCalls++;
  try {
    const { describeSkin } = require('../services/skinVision');
    return await describeSkin(imageUrl);
  } catch (e) {
    console.error('[Vision fallback]', e.message);
    return null;
  }
};

const lesionGroups = new Set(Object.entries(cfg.groups).filter(([, g]) => g.countsForScore).map(([k]) => k));

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */
exports.analyzeFace = async (req, res) => {
  console.log('[analyzeFace] HIT', new Date().toISOString()); // không thấy dòng này => request không vào controller này

  const { image_url, consent } = req.body;
  // Khách hàng: luôn lấy từ token; nhân viên phân tích hộ khách thì được truyền customer_id
  const customer_id = req.user.role === 'CUSTOMER' ? req.user.id : (req.body.customer_id || req.user.id);

  if (!image_url) {
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

    const imgW = imgSize?.width || 1;
    const imgH = imgSize?.height || 1;
    const imgArea = imgW * imgH;

    // 1) Xử lý chung với evaluate.js: bỏ class không dùng, bỏ box quá lớn, gộp theo nhóm, khử trùng lặp
    const dropped = [];
    const items = pp.postprocess(predictions.map(pp.fromRoboflow), imgW, imgH, 'g2', {
      minConf: FETCH_CONF,
      useMaxArea: true,
      dropDisabled: true,
      dropped,
    });
    if (dropped.length) console.log('[Roboflow] bỏ:', dropped.join('; '));

    // 2) Khung để hiển thị: theo ngưỡng "show" của từng nhóm; "confirm" quyết định nét liền hay nét đứt
    const issues = items
      .filter((i) => cfg.groups[i.cls] && i.conf >= cfg.groups[i.cls].show)
      .map((i) => ({
        raw_class: i.raw,
        group: i.cls,
        issue_name: cfg.classes[i.raw]?.vi || i.raw,
        weight: cfg.classes[i.raw]?.weight ?? 1,
        confidence: i.conf,
        certainty: i.conf >= cfg.groups[i.cls].confirm ? 'confirmed' : 'possible',
        bounding_box: i.box,
      }));

    // 3) Kết luận theo nhóm cho cả ảnh ("có/không có"), kể cả khi không vẽ khung (ngưỡng "presence")
    const groups = Object.entries(cfg.groups).map(([g, gc]) => {
      const maxConf = items.filter((i) => i.cls === g).reduce((m, i) => Math.max(m, i.conf), 0);
      const shown = issues.filter((i) => i.group === g);
      return {
        group: g,
        name: gc.vi,
        present: maxConf >= gc.presence,
        max_confidence: Math.round(maxConf * 10) / 10,
        confirmed: shown.filter((i) => i.certainty === 'confirmed').length,
        possible: shown.filter((i) => i.certainty === 'possible').length,
      };
    });

    // 4) Điểm và mức độ: chỉ tính các nhóm dạng nốt (mụn viêm, mụn đầu đen/trắng, thâm); nám/tàn nhang chỉ hiển thị
    const lesionIssues = issues.filter((i) => lesionGroups.has(i.group));
    const lesionConfirmed = lesionIssues.filter((i) => i.certainty === 'confirmed').length;
    const penalty = lesionIssues.reduce((sum, i) => {
      const b = i.bounding_box;
      const areaFactor = 1 + Math.min(3, ((b.width * b.height) / imgArea) * 20);
      const certaintyFactor = i.certainty === 'confirmed' ? 1 : 0.5;
      return sum + i.weight * (i.confidence / 100) * 3 * areaFactor * certaintyFactor;
    }, 0);

    // 5) 3 trạng thái - "không phát hiện" KHÔNG có nghĩa là "da khỏe"
    const hasConfirmed = issues.some((i) => i.certainty === 'confirmed');
    const anyPresent = groups.some((g) => g.present);
    const level = hasConfirmed ? 'detected' : issues.length || anyPresent ? 'uncertain' : 'none';
    const overall_score = level === 'detected' && lesionConfirmed > 0 ? Math.round(Math.max(0, 100 - penalty)) : null;
    const severity =
      level === 'none' ? 'Chưa xác định'
      : level === 'uncertain' ? 'Cần xác nhận'
      : lesionConfirmed === 0 ? cfg.severity.noLesionLabel
      : penalty >= cfg.severity.highFrom ? 'Nghiêm trọng'
      : penalty >= cfg.severity.mediumFrom ? 'Trung bình'
      : 'Nhẹ';

    const summary = issues.reduce((acc, i) => {
      acc[i.issue_name] = (acc[i.issue_name] || 0) + 1;
      return acc;
    }, {});

    // 6) Detection không chắc => nhờ model thị giác mô tả để nhân viên tham khảo
    const ai_summary = level !== 'detected' ? await tryDescribeSkin(sentUrl) : null;

    const record = await AiAnalysis.create({
      customer_id,
      client_ip: req.ip,
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
        groups,
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
          dropped,
        },
      }),
    });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error('[Roboflow Error]', errorMessage);

    try {
      await AiAnalysis.create({
        customer_id,
        client_ip: req.ip,
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
/* ------------------------------------------------------------------ */
/* Chatbot tư vấn (Gemini chạy ở server)                               */
/* ------------------------------------------------------------------ */
exports.chat = async (req, res) => {
  const { contents } = req.body;
  // Chỉ nhận tối đa 10 lượt gần nhất, mỗi lượt <= 2000 ký tự, đúng định dạng của Gemini
  if (!Array.isArray(contents) || contents.length === 0 || contents.length > 10) {
    return res.status(400).json({ success: false, message: 'Nội dung hội thoại không hợp lệ' });
  }
  const clean = contents.map((m) => ({
    role: m?.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m?.parts?.[0]?.text || '').slice(0, 2000) }],
  }));

  try {
    const { chat } = require('../services/geminiChat');
    const text = await chat(clean);
    return res.status(200).json({ success: true, data: { text } });
  } catch (error) {
    console.error('[Gemini chat]', error.response?.data?.error?.message || error.message);
    return res.status(503).json({ success: false, message: 'Hệ thống AI đang bận, vui lòng thử lại sau' });
  }
};
