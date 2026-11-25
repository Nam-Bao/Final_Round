// Gọi Gemini qua REST (dùng chung cho chatbot RAG và embedding kho kiến thức).
// Biến môi trường: GEMINI_API_KEY (bắt buộc), GEMINI_MODEL, GEMINI_FALLBACK_MODEL (chatbot),
// EMBED_MODEL (mặc định gemini-embedding-001), EMBED_DIM (mặc định 768)
const axios = require('axios');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('Chưa cấu hình GEMINI_API_KEY');
  return k;
};
const retryable = (err) => {
  const status = err.response?.status;
  return status === 503 || status === 429 || status === 500 || /overload|high demand|unavailable|ECONNRESET|timeout/i.test(err.message || '');
};

const chatModels = () => [process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite']
  .filter((name, i, arr) => name && arr.indexOf(name) === i);

// Trả về { content, text, functionCalls, model }: content là nguyên phần trả lời của model (giữ chữ ký suy luận
// khi gọi hàm, phải gửi lại đúng như vậy ở lượt sau)
const generate = async ({ system, contents, tools, models = chatModels(), maxOutputTokens = 1024, temperature = 0.3, timeout = 45000, json = false }) => {
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await axios.post(`${BASE}/${model}:generateContent`, {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
          generationConfig: { maxOutputTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }, { headers: { 'x-goog-api-key': key() }, timeout });
        const content = res.data?.candidates?.[0]?.content || { role: 'model', parts: [] };
        const parts = content.parts || [];
        const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
        const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        if (!text && !functionCalls.length) throw Object.assign(new Error('Gemini không trả về nội dung'), { response: { status: 503 } });
        return { content: { role: 'model', parts }, text, functionCalls, model };
      } catch (err) {
        lastError = err;
        if (!retryable(err)) throw err;
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastError;
};

const embedModel = () => process.env.EMBED_MODEL || 'gemini-embedding-001';
const embedDim = () => Number(process.env.EMBED_DIM) || 768;

// texts: string[] => number[][] (đã chuẩn hóa độ dài 1 để tính cosine bằng tích vô hướng)
// taskType: RETRIEVAL_DOCUMENT khi nạp kho, RETRIEVAL_QUERY khi tìm theo câu hỏi
const embed = async (texts, taskType = 'RETRIEVAL_DOCUMENT') => {
  const out = [];
  const model = embedModel();
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await axios.post(`${BASE}/${model}:batchEmbedContents`, {
          requests: batch.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] }, taskType, outputDimensionality: embedDim() })),
        }, { headers: { 'x-goog-api-key': key() }, timeout: 60000 });
        break;
      } catch (err) {
        if (attempt >= 4 || !retryable(err)) throw err;
        // 429: chờ đúng thời gian Gemini báo (RetryInfo.retryDelay, vd "34s"), mặc định 20 giây
        const hint = (err.response?.data?.error?.details || []).find((d) => d.retryDelay)?.retryDelay;
        await sleep(err.response?.status === 429 ? (parseFloat(hint) || 20) * 1000 + 1000 : 2000 * (attempt + 1));
      }
    }
    for (const e of res.data.embeddings || []) {
      const v = e.values || [];
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      out.push(v.map((x) => x / norm));
    }
  }
  if (out.length !== texts.length) throw new Error('Embedding trả về thiếu kết quả');
  return out;
};

module.exports = { generate, embed, embedModel, chatModels };
