// Chatbot tư vấn (Gemini) chạy ở server để GEMINI_API_KEY không lộ ra frontend.
// Biến môi trường: GEMINI_API_KEY (bắt buộc), GEMINI_MODEL, GEMINI_FALLBACK_MODEL (tùy chọn)
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = `Bạn là nhân viên tư vấn nhiệt tình của phòng khám da liễu GlowSkin O2O...`;

const getModelNames = () => [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite',
].filter((name, index, arr) => name && arr.indexOf(name) === index);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Thử lần lượt các model, mỗi model 2 lần nếu Gemini quá tải
exports.startConsultStream = async (contents) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  let lastError;
  for (const name of getModelNames()) {
    const model = genAI.getGenerativeModel({
      model: name,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await model.generateContentStream({ contents });
      } catch (err) {
        lastError = err;
        const canRetry = err.status === 503 || err.status === 429 || /overload|high demand|unavailable/i.test(err.message || '');
        if (!canRetry) throw err;
        await sleep(1000);
      }
    }
  }
  throw lastError;
};
