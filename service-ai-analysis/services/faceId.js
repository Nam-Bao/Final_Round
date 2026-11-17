// Nhận dạng khuôn mặt cho chấm công: vector 128 chiều (face-api, chạy trong máy chủ, không gửi dữ liệu sinh trắc ra ngoài).
// So 2 khuôn mặt bằng khoảng cách Euclid giữa 2 vector: càng nhỏ càng giống. Ngưỡng chỉnh trong .env sau khi đo trên ảnh thật
// (scripts/face_calibrate.js): FACE_MATCH_THRESHOLD (mặc định 0.45), FACE_REVIEW_THRESHOLD (mặc định 0.6).
const sharp = require('sharp');
const { faceApi } = require('./faceModels');

const MATCH = Number(process.env.FACE_MATCH_THRESHOLD || 0.45);
const REVIEW = Number(process.env.FACE_REVIEW_THRESHOLD || 0.6);
const MIN_SCORE = 0.5;          // độ tin cậy phát hiện khuôn mặt
const MIN_FACE_RATIO = 0.12;    // khuôn mặt phải rộng >= 12% chiều ngang ảnh (ảnh selfie)
const MODEL = 'face-api/faceRecognitionNet-128';

// Mọi khuôn mặt trong ảnh: [{ score, box, descriptor: number[128] }]; ảnh lớn thu về 1024px cho nhanh
const facesOf = async (buffer) => {
  const faceapi = await faceApi();
  const { data, info } = await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const input = faceapi.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
  try {
    const found = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE })).withFaceLandmarks().withFaceDescriptors();
    return found.map((f) => ({
      score: f.detection.score,
      box: { left: f.detection.box.x, top: f.detection.box.y, width: f.detection.box.width, height: f.detection.box.height },
      ratio: f.detection.box.width / info.width,
      descriptor: Array.from(f.descriptor),
    }));
  } finally {
    input.dispose();
  }
};

const distance = (a, b) => Math.sqrt(a.reduce((n, v, i) => n + (v - b[i]) ** 2, 0));
const round = (x) => Math.round(x * 1000) / 1000;

// Đúng 1 khuôn mặt đủ lớn => { descriptor } hoặc { error: NO_FACE | MULTI_FACE | TOO_SMALL }
const singleFace = async (buffer) => {
  const faces = (await facesOf(buffer)).filter((f) => f.score >= MIN_SCORE);
  if (!faces.length) return { error: 'NO_FACE' };
  if (faces.length > 1) return { error: 'MULTI_FACE', count: faces.length };
  if (faces[0].ratio < MIN_FACE_RATIO) return { error: 'TOO_SMALL' };
  return { descriptor: faces[0].descriptor, score: faces[0].score };
};

// So 1 ảnh chấm công với các vector ảnh gốc: lấy khoảng cách nhỏ nhất
const compare = async (buffer, references) => {
  const f = await singleFace(buffer);
  if (f.error) return { status: f.error === 'TOO_SMALL' ? 'NO_FACE' : f.error, faces: f.count || (f.error === 'NO_FACE' ? 0 : 1), model: MODEL };
  const d = Math.min(...references.map((r) => distance(f.descriptor, r)));
  return { status: d < MATCH ? 'MATCH' : d < REVIEW ? 'REVIEW' : 'NO_MATCH', distance: round(d), faces: 1, model: MODEL, thresholds: { match: MATCH, review: REVIEW } };
};

// Các ảnh đăng ký phải cùng 1 người: khoảng cách lớn nhất giữa các cặp < ngưỡng "cần xem lại"
const consistency = (descriptors) => {
  let worst = 0;
  for (let i = 0; i < descriptors.length; i++) for (let j = i + 1; j < descriptors.length; j++) worst = Math.max(worst, distance(descriptors[i], descriptors[j]));
  return { ok: worst < REVIEW, worst: round(worst) };
};

module.exports = { facesOf, singleFace, compare, consistency, distance, MATCH, REVIEW, MODEL };
