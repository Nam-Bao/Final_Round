// Làm mờ vùng mắt trên ảnh đưa vào bộ dữ liệu huấn luyện (chỉ bản huấn luyện; ảnh khách / bác sĩ xem không đổi).
// Dùng @vladmandic/face-api (TensorFlow.js trên WebAssembly, không cần biên dịch native): phát hiện khuôn mặt (SSD MobileNet)
// + 68 điểm mốc => khung bao 2 mắt (điểm 36 - 47) và lông mày (17 - 26), nới rộng rồi làm mờ mạnh.
// Không tìm thấy mắt (ảnh nghiêng nhiều, mặt bị che...) => trả null để script KHÔNG xuất ảnh đó (không xuất ảnh chưa làm mờ).
const sharp = require('sharp');

const MIN_SCORE = 0.3;   // ngưỡng phát hiện thô
const ACCEPT_SCORE = 0.6; // chỉ tin khuôn mặt có độ tin cậy >= 0.6 (thấp hơn thường là nhận nhầm => vùng mờ sai chỗ)
const init = () => require('./faceModels').faceApi(); // model nạp 1 lần, dùng chung với xác thực chấm công

// Điểm mốc có hợp lý không: model 68 điểm học chủ yếu ảnh chính diện, ảnh nghiêng / chụp gần hay đặt dồn các điểm vào giữa má
// (khung mặt đúng nhưng điểm mắt sai => làm mờ sai chỗ). Yêu cầu: đường viền hàm trải >= 50% khuôn mặt, 2 mắt cách nhau >= 20%,
// và theo chiều dọc ảnh (đã xoay) mắt ở trên mũi, mũi ở trên miệng.
const rangeOf = (pts) => {
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const meanY = (pts) => pts.reduce((n, p) => n + p.y, 0) / pts.length;
const plausible = (f) => {
  const p = f.landmarks.positions; const size = Math.max(f.detection.box.width, f.detection.box.height);
  const eyes = p.slice(36, 48); const nose = p.slice(27, 36); const mouth = p.slice(48, 68);
  return rangeOf(p.slice(0, 17)) >= 0.5 * size && rangeOf(eyes) >= 0.2 * size && meanY(eyes) < meanY(nose) && meanY(nose) < meanY(mouth);
};

// Điểm mốc 2 mắt + lông mày của các khuôn mặt tìm được trên 1 ảnh (raw RGB)
const detectEyePoints = async (faceapi, buffer) => {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const input = faceapi.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
  try {
    const faces = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE })).withFaceLandmarks();
    return { info, faces: faces.filter((f) => plausible(f)).map((f) => ({ score: f.detection.score, pts: [...f.landmarks.positions.slice(36, 48), ...f.landmarks.positions.slice(17, 27)] })) };
  } finally {
    input.dispose();
  }
};

// Ảnh selfie nằm nghiêng / xoay: thử nhiều góc xoay, chọn góc nhận ra khuôn mặt chắc chắn nhất, quy toạ độ mắt về ảnh gốc.
// (Dừng ở lần nhận ra đầu tiên dễ lấy nhầm khuôn mặt độ tin cậy thấp => làm mờ sai chỗ.)
const ANGLES = [0, -30, 30, -45, 45, -90, 90, 180];
const findEyeRegions = async (buffer) => {
  const faceapi = await init();
  const meta = await sharp(buffer).metadata();
  const W = meta.width; const H = meta.height;
  let best = null;
  for (const deg of ANGLES) {
    const img = deg ? await sharp(buffer).rotate(deg, { background: '#000' }).toBuffer() : buffer;
    const { info, faces } = await detectEyePoints(faceapi, img);
    const top = Math.max(0, ...faces.map((f) => f.score));
    if (top >= ACCEPT_SCORE && (!best || top > best.top)) best = { deg, info, faces: faces.filter((f) => f.score >= ACCEPT_SCORE), top };
    if (top >= 0.95) break; // đủ chắc, khỏi thử tiếp
  }
  if (best) {
    const { deg, info, faces } = best;
    // Điểm (x, y) trên ảnh đã xoay => ảnh gốc: dời về tâm ảnh xoay, xoay ngược, dời tới tâm ảnh gốc
    const t = (-deg * Math.PI) / 180; const cos = Math.cos(t); const sin = Math.sin(t);
    const back = (p) => {
      const dx = p.x - info.width / 2; const dy = p.y - info.height / 2;
      return { x: dx * cos - dy * sin + W / 2, y: dx * sin + dy * cos + H / 2 };
    };
    return faces.map(({ pts, score }) => {
      const q = pts.map(back);
      const xs = q.map((p) => p.x); const ys = q.map((p) => p.y);
      const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
      const span = Math.max(x1 - x0, y1 - y0); const pad = span * 0.18; // nới đều 2 chiều (mặt xoay thì mắt không còn nằm ngang)
      const left = Math.max(0, Math.floor(x0 - pad)); const top = Math.max(0, Math.floor(y0 - pad));
      return { left, top, width: Math.min(W - left, Math.ceil(x1 + pad) - left), height: Math.min(H - top, Math.ceil(y1 + pad) - top), rotated: deg, score: Math.round(score * 100) / 100 };
    }).filter((r) => r.width > 4 && r.height > 4);
  }
  return [];
};

// Trả { buffer, regions } (JPEG đã làm mờ mắt, không EXIF) hoặc null nếu không tìm thấy mắt
const blurEyes = async (buffer) => {
  const regions = await findEyeRegions(buffer);
  if (!regions.length) return null;
  const meta = await sharp(buffer).metadata();
  const sigma = Math.max(12, Math.round(Math.max(meta.width, meta.height) / 60));
  const patches = await Promise.all(regions.map(async (r) => ({
    input: await sharp(buffer).extract(r).blur(sigma).toBuffer(), left: r.left, top: r.top,
  })));
  const out = await sharp(buffer).composite(patches).jpeg({ quality: 92 }).toBuffer();
  return { buffer: out, regions };
};

module.exports = { blurEyes, findEyeRegions };
