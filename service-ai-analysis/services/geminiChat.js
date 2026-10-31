// Chatbot tư vấn chạy ở SERVER: key Gemini nằm trong .env của service này, không còn nhúng vào code trình duyệt.
// Biến môi trường: GEMINI_API_KEY (bắt buộc), GEMINI_MODEL, GEMINI_FALLBACK_MODEL (tùy chọn)
const axios = require('axios');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const SYSTEM_PROMPT = `Bạn là nhân viên tư vấn nhiệt tình của phòng khám da liễu GlowSkin O2O...`;

const modelNames = () =>
  [process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite']
    .filter((name, index, arr) => name && arr.indexOf(name) === index);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// contents: [{ role: 'user' | 'model', parts: [{ text }] }] (định dạng của Gemini)
exports.chat = async (contents) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Chưa cấu hình GEMINI_API_KEY');

  let lastError;
  for (const name of modelNames()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await axios.post(
          `${GEMINI_URL}/${name}:generateContent`,
          {
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
          },
          { headers: { 'x-goog-api-key': apiKey }, timeout: 30000 }
        );
        const text = (res.data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (!text) throw new Error('Gemini không trả về nội dung');
        return text;
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        const canRetry = status === 503 || status === 429 || /overload|high demand|unavailable/i.test(err.message || '');
        if (!canRetry) throw err;
        await sleep(1000);
      }
    }
  }
  throw lastError;
};
