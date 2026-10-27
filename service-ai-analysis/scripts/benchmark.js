// Chạy:  node scripts/benchmark.js
// So sánh nhiều model Roboflow trên cùng bộ ảnh test (xem top 5 dự đoán, confidence thấp 10%).
require('dotenv').config();
const axios = require('axios');

// Thêm các model ứng viên (dạng "workspace-hoac-project/ten-model/version") sau khi chọn trên Roboflow Universe
const MODELS = [
  'skin-problems-detection-jp4jv/4',
  'skin-problems-detection-jp4jv/1',
];

const variants = (url) => ({
  goc: url,
  app: url.replace('/upload/', '/upload/a_exif,c_limit,w_1280,f_jpg,q_auto/'),
  khongNen: url.replace('/upload/', '/upload/a_exif,c_limit,w_1280/'),
});

for (const img of IMAGES) {
  for (const m of MODELS) {
    for (const [name, url] of Object.entries(variants(img))) {
      try {
        const { data } = await axios.post(`https://detect.roboflow.com/${m}`, null, {
          params: { api_key: process.env.ROBOFLOW_API_KEY, image: url, confidence: 10 },
          timeout: 30000,
        });
        const n40 = data.predictions.filter(p => p.confidence >= 0.4).length;
        const top = [...data.predictions].sort((a, b) => b.confidence - a.confidence).slice(0, 5)
          .map(p => `${p.class}:${Math.round(p.confidence * 100)}%`);
        console.log(`${m} | ${name} | >=40%: ${n40} | ${top.join(', ')}`);
      } catch (e) {
        console.log(`${m} | ${name} | LỖI: ${e.response?.data?.message || e.message}`);
      }
    }
  }
}

// Dán URL ảnh test (Cloudinary), nên có 20-30 ảnh đại diện cho khách thật
const IMAGES = [
  'https://res.cloudinary.com/djydumequ/image/upload/v1792941130/O2O_Assets/ddsb1tjdbrrfevupute5.webp'
];

(async () => {
  if (!IMAGES.length) return console.log('Hãy thêm URL ảnh vào mảng IMAGES.');

  for (const img of IMAGES) {
    for (const m of MODELS) {
      try {
        const { data } = await axios.post(`https://detect.roboflow.com/${m}`, null, {
          params: { api_key: process.env.ROBOFLOW_API_KEY, image: img, confidence: 10 },
          timeout: 30000,
        });
        const top = [...data.predictions]
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 5)
          .map((p) => `${p.class}:${Math.round(p.confidence * 100)}%`);
        console.log(`${m} | ...${img.slice(-25)} | ${top.join(', ') || '(không có)'}`);
      } catch (e) {
        console.log(`${m} | LỖI: ${e.response?.data?.message || e.message}`);
      }
    }
  }
})();