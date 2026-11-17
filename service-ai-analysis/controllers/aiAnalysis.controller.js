const axios = require('axios');
const { AiAnalysis } = require('../models');
const pp = require('../services/postprocess'); // dùng chung với scripts/evaluate.js
const { concernsOf, pickCandidates, ruleAdvice } = require('../services/productMatch');
const imageQuality = require('../services/imageQuality');
const { profileBelongs } = require('./analysisReview.controller');
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

// Danh mục sản phẩm đang bán trên web (để Gemini gợi ý), lưu tạm 10 phút
let catalogCache = { at: 0, data: [] };
const getAdviceCatalog = async () => {
  if (Date.now() - catalogCache.at < 10 * 60 * 1000) return catalogCache.data;
  try {
    const res = await axios.get(`${process.env.GATEWAY_URL || 'http://localhost:4000'}/api/commerce/products/advice-catalog`, { timeout: 8000 });
    catalogCache = { at: Date.now(), data: res.data.data || [] };
  } catch (e) {
    console.error('[Vision] Không lấy được danh mục sản phẩm:', e.message);
  }
  return catalogCache.data;
};

// Nhận xét cho khách bằng Gemini (đọc ảnh + kết quả Roboflow): mô tả, lời khuyên chăm sóc / sinh hoạt / ăn uống,
// chọn sản phẩm trong danh sách ứng viên đã lọc theo quy tắc. Thiếu GEMINI_API_KEY, Gemini lỗi hoặc hết hạn mức ngày
// => trả null, controller dùng kết quả theo quy tắc (productMatch.ruleAdvice).
let visionCalls = 0;
let visionDay = new Date().toDateString();
const tryDescribeSkin = async (images, findings, candidates) => {
  if (!process.env.GEMINI_API_KEY) return null;
  if (visionDay !== new Date().toDateString()) { visionDay = new Date().toDateString(); visionCalls = 0; }
  if (visionCalls >= VISION_DAILY_CAP) return null;
  visionCalls++;
  try {
    const { describeSkin } = require('../services/skinVision');
    return await describeSkin(images, findings, candidates);
  } catch (e) {
    console.error('[Vision fallback]', e.message);
    return null;
  }
};


/* ------------------------------------------------------------------ */
/* Phân tích 1 lượt soi (1 - 3 ảnh)                                    */
/* ------------------------------------------------------------------ */
const ANGLES = { front: 'Chính diện', left: 'Má trái', right: 'Má phải' };
const MAX_IMAGES = 3;

// Gọi model khoanh vùng cho 1 ảnh => khung đã xử lý theo luồng app (dùng chung với scripts/evaluate.js)
const detectImage = async (sentUrl, imageIndex) => {
  const { ROBOFLOW_PROJECT, ROBOFLOW_VERSION, ROBOFLOW_API_KEY } = process.env;
  const response = await axios.post(`${RF_BASE}/${ROBOFLOW_PROJECT}/${ROBOFLOW_VERSION}`, null, {
    params: { api_key: ROBOFLOW_API_KEY, image: sentUrl, confidence: FETCH_CONF, overlap: 30 },
    timeout: 30000,
  });
  const { predictions = [], image: imgSize } = response.data;
  console.log(`[Roboflow] ảnh ${imageIndex + 1}:`, predictions.map((p) => `${p.class}:${Math.round(p.confidence * 100)}%`).join(', ') || '(không có)');

  // Bỏ class không dùng, bỏ box quá lớn, gộp theo nhóm, khử trùng lặp
  const dropped = [];
  const items = pp.postprocess(predictions.map(pp.fromRoboflow), imgSize?.width || 1, imgSize?.height || 1, 'g2', {
    minConf: FETCH_CONF, useMaxArea: true, dropDisabled: true, dropped,
  });
  // Khung hiển thị theo ngưỡng "show" của từng nhóm; "confirm" quyết định nét liền / nét đứt
  const issues = items
    .filter((i) => cfg.groups[i.cls] && i.conf >= cfg.groups[i.cls].show)
    .map((i) => ({
      image_index: imageIndex,
      raw_class: i.raw,
      group: i.cls,
      issue_name: cfg.classes[i.raw]?.vi || i.raw,
      weight: cfg.classes[i.raw]?.weight ?? 1,
      confidence: i.conf,
      certainty: i.conf >= cfg.groups[i.cls].confirm ? 'confirmed' : 'possible',
      bounding_box: i.box,
      // Nhóm khung hay sai chỗ (thâm sau mụn, mụn đầu đen/trắng: F1 mức khung ~5-13%) thì không vẽ, chỉ kết luận có / không
      draw: cfg.groups[i.cls].drawBoxes !== false,
    }));
  const maxConf = Object.fromEntries(Object.keys(cfg.groups).map((g) => [g, items.filter((i) => i.cls === g).reduce((m, i) => Math.max(m, i.conf), 0)]));
  return { imgSize, raw: predictions, dropped, issues, maxConf };
};

// Thang Hayashi đếm mụn viêm trên NỬA mặt: ảnh má trái / má phải ~ nửa mặt => lấy số đếm lớn nhất giữa các ảnh
// (không cộng dồn: 1 nốt có thể xuất hiện ở nhiều góc chụp)
const severityOf = (level, count) => {
  const [mildMax, moderateMax] = cfg.severity.inflammatoryCount;
  return level === 'none' ? 'Chưa xác định'
    : count === 0 ? cfg.severity.noLesionLabel
    : count <= mildMax ? 'Nhẹ'
    : count <= moderateMax ? 'Trung bình'
    : 'Nặng';
};
const qualityOf = (q) => (q ? { ...q.metrics, problems: q.problems, ignored: !q.ok } : null);

// Đo chất lượng từng ảnh (tối / mờ / cháy sáng); không đo được thì null
const measureQualities = (sent) => Promise.all(sent.map(async (u) => {
  try {
    const img = await axios.get(u, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 15 * 1024 * 1024 });
    return await imageQuality.check(Buffer.from(img.data), cfg.imageQuality);
  } catch (e) {
    console.error('[Chất lượng ảnh] không đo được:', e.message);
    return null;
  }
}));

// Khoanh vùng cả lượt soi (song song từng ảnh) => kết luận nhóm, mức độ (thang Hayashi, ảnh nhiều mụn viêm nhất), 3 trạng thái
const detectSession = async (sent) => {
  const results = await Promise.all(sent.map((u, i) => detectImage(u, i)));
  const issues = results.flatMap((r) => r.issues);
  // Kết luận theo nhóm cho cả lượt: có ở bất kỳ ảnh nào => có
  const groups = Object.entries(cfg.groups).map(([g, gc]) => {
    const maxConf = Math.max(...results.map((r) => r.maxConf[g]));
    const shown = issues.filter((i) => i.group === g);
    return {
      group: g,
      name: gc.vi,
      present: maxConf >= gc.presence,
      boxes: gc.drawBoxes !== false, // false: app không khoanh vùng nhóm này, chỉ kết luận có / không
      max_confidence: Math.round(maxConf * 10) / 10,
      confirmed: shown.filter((i) => i.certainty === 'confirmed').length,
      possible: shown.filter((i) => i.certainty === 'possible').length,
    };
  });
  // "Không phát hiện" KHÔNG có nghĩa là "da khỏe"
  const perImageCount = results.map((r) => r.issues.filter((i) => i.group === 'inflammatory').length);
  const inflammatoryCount = Math.max(...perImageCount);
  const hasConfirmed = issues.some((i) => i.certainty === 'confirmed');
  const level = hasConfirmed ? 'detected' : issues.length || groups.some((g) => g.present) ? 'uncertain' : 'none';
  const summary = issues.filter((i) => i.draw).reduce((acc, i) => { acc[i.issue_name] = (acc[i.issue_name] || 0) + 1; return acc; }, {});
  return { results, issues, groups, perImageCount, inflammatoryCount, level, severity: severityOf(level, inflammatoryCount), summary };
};

// Bản ghi images + parsed_metrics của 1 lượt soi
const sessionRecord = (images, det, qualities, ai_summary) => ({
  image_url: images[0].url, // ảnh đại diện (danh sách, bản ghi cũ chỉ có 1 ảnh)
  images: images.map((im, i) => ({
    url: im.url, angle: im.angle, image_size: det.results[i].imgSize, inflammatory_count: det.perImageCount[i], quality: qualityOf(qualities[i]),
  })),
  parsed_metrics: {
    skin_age: null,
    skin_type: 'Phân tích qua hình ảnh',
    overall_score: null,
    severity: det.severity,
    severity_scale: cfg.severity.scale,
    image_quality: qualityOf(qualities[0]),
    inflammatory_count: det.inflammatoryCount,
    level: det.level,
    summary: det.summary,
    groups: det.groups,
    image_size: det.results[0].imgSize,
    raw_count: det.results.reduce((n, r) => n + r.raw.length, 0),
    issues: det.issues,
    ai_summary,
  },
});
exports.ANGLES = ANGLES;
exports.isAllowedUrl = isAllowedUrl;
exports.optimizeUrl = optimizeUrl;
exports.measureQualities = measureQualities;
exports.detectSession = detectSession;
exports.sessionRecord = sessionRecord;

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */
// POST /analyze { images: [{ url, angle }] (1 - 3 ảnh của CÙNG 1 lượt soi) | image_url (cách cũ), consent, patient_profile_id, ignore_quality }
// 1 lượt soi = 1 lượt hạn mức = 1 bản ghi; kết quả gộp các ảnh, Gemini xem tất cả ảnh trong 1 lần gọi.
exports.analyzeFace = async (req, res) => {
  console.log('[analyzeFace] HIT', new Date().toISOString());

  const { consent } = req.body;
  // Khách hàng: luôn lấy từ token; nhân viên phân tích hộ khách thì được truyền customer_id
  // Chưa đăng nhập: ghi là khách vãng lai, đếm lượt theo IP (analysisQuota)
  const customer_id = !req.user ? 'GUEST_ANALYSIS'
    : req.user.role === 'CUSTOMER' ? req.user.id : (req.body.customer_id || req.user.id);

  const input = Array.isArray(req.body.images) ? req.body.images
    : req.body.image_url ? [{ url: req.body.image_url, angle: 'front' }] : [];
  if (!input.length) return res.status(400).json({ success: false, message: 'Thiếu thông tin hình ảnh' });
  if (input.length > MAX_IMAGES) return res.status(400).json({ success: false, message: `Mỗi lượt soi tối đa ${MAX_IMAGES} ảnh` });
  const images = input.map((im) => ({ url: String(im?.url || ''), angle: ANGLES[im?.angle] ? im.angle : 'front' }));
  if (new Set(images.map((im) => im.url)).size !== images.length) {
    return res.status(400).json({ success: false, message: 'Có ảnh bị trùng trong lượt soi' });
  }
  // Bắt buộc có xác nhận chính sách sử dụng hình ảnh (modal ở frontend)
  if (!consent?.version || !consent?.accepted_at) {
    return res.status(400).json({ success: false, message: 'Thiếu xác nhận chính sách sử dụng hình ảnh' });
  }
  if (images.some((im) => !isAllowedUrl(im.url))) {
    return res.status(400).json({ success: false, message: 'URL ảnh không hợp lệ' });
  }
  // Hồ sơ người khám được soi (Bản thân / người thân): phải thuộc đúng tài khoản khách
  const patient_profile_id = req.user && req.body.patient_profile_id ? String(req.body.patient_profile_id) : null;
  if (patient_profile_id && !(await profileBelongs(patient_profile_id, customer_id, req.headers.authorization, req.user.role === 'CUSTOMER'))) {
    return res.status(400).json({ success: false, message: 'Hồ sơ người được soi không thuộc tài khoản này' });
  }

  try {
    const sent = images.map((im) => optimizeUrl(im.url));

    // 0) Ảnh tối / mờ / cháy sáng: báo khách chụp lại trước khi gọi model (không trừ lượt). Khách vẫn có thể chọn "vẫn phân tích".
    const qualities = await measureQualities(sent);
    const bad = qualities.map((q, i) => (q && !q.ok ? { index: i, angle: images[i].angle, problems: q.problems } : null)).filter(Boolean);
    if (bad.length && req.body.ignore_quality !== true) {
      const describe = (b) => `${images.length > 1 ? `Ảnh ${ANGLES[b.angle].toLowerCase()}: ` : ''}${b.problems.map((p) => imageQuality.MESSAGES[p]).join(', ')}`;
      return res.status(422).json({
        success: false, code: 'IMAGE_QUALITY', images: bad, problems: [...new Set(bad.flatMap((b) => b.problems))],
        message: `${bad.map(describe).join('. ')}. Hãy chụp lại nơi đủ sáng, giữ máy chắc tay và lấy nét vào da mặt.`,
      });
    }

    // 1) Khoanh vùng cả lượt soi, kết luận nhóm, mức độ
    const det = await detectSession(sent);
    const { results, groups, level } = det;

    // 4) Quy tắc lọc sản phẩm ứng viên; Gemini xem TẤT CẢ ảnh trong 1 lần gọi, viết lời khuyên, chọn trong ứng viên.
    //    Gemini không chạy được thì dùng lời khuyên mẫu + sản phẩm theo quy tắc.
    const presentGroups = groups.filter((g) => g.present);
    const concerns = concernsOf(presentGroups);
    const candidates = pickCandidates(await getAdviceCatalog(), concerns);
    const ai_summary = (await tryDescribeSkin(sent.map((u, i) => ({ url: u, angle: ANGLES[images[i].angle] })), {
      level,
      concerns,
      groups: presentGroups.map((g) => ({ name: g.name, confirmed: g.confirmed, possible: g.possible })),
    }, candidates)) || ruleAdvice(concerns, candidates);

    const record = await AiAnalysis.create({
      customer_id,
      patient_profile_id,
      client_ip: req.ip,
      source: 'web',
      ...sessionRecord(images, det, qualities, ai_summary),
      provider: 'Roboflow',
      status: 'success',
      consent: {
        version: String(consent.version),
        accepted_at: new Date(consent.accepted_at),
        allow_training: consent.allow_training === true,
      },
    });

    return res.status(200).json({
      success: true,
      data: record,
      ...(req.query.debug === '1' && process.env.NODE_ENV !== 'production' && {
        debug: results.map((r, i) => ({
          sent_url: sent[i], image_size: r.imgSize, dropped: r.dropped,
          raw: r.raw.map((p) => ({ class: p.class, confidence: Math.round(p.confidence * 1000) / 10 })),
        })),
      }),
    });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error('[Roboflow Error]', errorMessage);
    try {
      await AiAnalysis.create({
        customer_id, client_ip: req.ip, image_url: images[0].url, images: images.map((im) => ({ url: im.url, angle: im.angle })),
        provider: 'Roboflow', status: 'failed', error_message: errorMessage,
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
