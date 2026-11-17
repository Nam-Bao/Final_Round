// Nạp các model khuôn mặt của @vladmandic/face-api một lần, dùng chung:
// - services/eyeBlur.js: phát hiện khuôn mặt + 68 điểm mốc (làm mờ mắt ảnh huấn luyện)
// - services/faceId.js: + vector nhận dạng 128 chiều (xác thực ảnh chấm công với ảnh gốc của nhân viên)
// Chạy TensorFlow.js trên WebAssembly (không cần biên dịch native); wasm lỗi thì chạy CPU thuần JS (chậm hơn).
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
let ready = null;

const loadNet = (faceapi, net, name) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, `${name}-weights_manifest.json`), 'utf8'));
  const buf = fs.readFileSync(path.join(MODEL_DIR, `${name}.bin`));
  return net.loadFromWeightMap(faceapi.tf.io.decodeWeights(new Uint8Array(buf).buffer, manifest[0].weights));
};

const faceApi = () => {
  ready ||= (async () => {
    const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    try { await faceapi.tf.setBackend('wasm'); } catch { await faceapi.tf.setBackend('cpu'); }
    await faceapi.tf.ready();
    await loadNet(faceapi, faceapi.nets.ssdMobilenetv1, 'ssd_mobilenetv1_model');
    await loadNet(faceapi, faceapi.nets.faceLandmark68Net, 'face_landmark_68_model');
    await loadNet(faceapi, faceapi.nets.faceRecognitionNet, 'face_recognition_model');
    return faceapi;
  })().catch((e) => { ready = null; throw e; });
  return ready;
};

module.exports = { faceApi };
