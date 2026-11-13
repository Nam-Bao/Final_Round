// AI rà soát đơn kê: bổ sung cho bảng quy tắc cứng ở service-booking (utils/safetyRules.js), KHÔNG thay thế nó.
// - Bảng quy tắc: có nguồn y khoa, chạy chắc chắn, chặn kê đơn khi chưa ghi lý do.
// - AI: đọc thêm chẩn đoán, tình trạng khách, thành phần và lưu ý của nhà sản xuất để nhắc những điểm bảng quy tắc chưa có,
//   và gợi ý câu hỏi thêm. Chỉ để bác sĩ tham khảo; service-booking kiểm tra lại kết quả.
// - Sản phẩm thay thế KHÔNG do AI chọn: service-booking chọn theo quy tắc + lịch sử kê đơn (utils/alternatives.js).
// Biến môi trường: GEMINI_API_KEY (bắt buộc, dùng chung với chatbot), SAFETY_MODEL (mặc định gemini-3.6-flash),
// SAFETY_FALLBACK_MODEL (mặc định gemini-3.5-flash-lite)
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// Thử lần lượt: model chính rồi model dự phòng (VD model chính quá tải / hết lượt gói free)
const getModelNames = () => [
  process.env.SAFETY_MODEL || 'gemini-3.6-flash',
  process.env.SAFETY_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
].filter((name, index, arr) => name && arr.indexOf(name) === index);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM = `Bạn là dược sĩ lâm sàng hỗ trợ bác sĩ da liễu của phòng khám GlowSkin rà soát đơn kê trước khi giao cho khách.
Bạn nhận: tình trạng khách (câu trả lời sàng lọc, dị ứng, chẩn đoán, triệu chứng), các mục bác sĩ đang kê (dịch vụ, gói, sản phẩm kèm thành phần và lưu ý của nhà sản xuất) và các cảnh báo hệ thống đã hiện theo bảng quy tắc.

Nhiệm vụ:
1. warnings: chỉ nêu những điểm cần lưu ý MÀ CẢNH BÁO HỆ THỐNG CHƯA NÊU. Không lặp lại cảnh báo đã có. Mỗi cảnh báo phải dựa trên dữ liệu được cung cấp (thành phần, lưu ý nhà sản xuất, tình trạng khách) hoặc kiến thức da liễu phổ biến; ghi rõ căn cứ ở "basis". Ví dụ: hoạt chất trùng lặp gây kích ứng, nồng độ cao với da nhạy cảm, tương tác giữa các sản phẩm trong cùng đơn, sản phẩm không hợp với chẩn đoán.
   - CONTRAINDICATED chỉ dùng khi chắc chắn có chống chỉ định rõ ràng; còn lại dùng CAUTION hoặc INFO.
   - Không bịa thành phần không có trong dữ liệu. Không chắc thì nói là cần bác sĩ đánh giá.
2. questions: tối đa 3 câu bác sĩ nên hỏi thêm khách nếu thiếu thông tin quan trọng.
3. summary: 1 - 2 câu tóm tắt.

Viết tiếng Việt, ngắn gọn, đúng chuyên môn. Bác sĩ là người quyết định cuối cùng.`;

const STR = (description) => ({ type: SchemaType.STRING, ...(description ? { description } : {}) });
const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: STR(),
    warnings: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          item: STR('Tên mục trong đơn bị ảnh hưởng'),
          severity: { type: SchemaType.STRING, format: 'enum', enum: ['CONTRAINDICATED', 'CAUTION', 'INFO'] },
          message: STR(),
          basis: STR('Căn cứ: thành phần / lưu ý nhà sản xuất / tình trạng khách / kiến thức chung'),
        },
        required: ['item', 'severity', 'message', 'basis'],
      },
    },
    questions: { type: SchemaType.ARRAY, items: STR() },
  },
  required: ['summary', 'warnings', 'questions'],
};

class SafetyReviewError extends Error {}

const isRetryable = (err) => err.status === 503 || err.status === 429 || err.status === 500
  || /overload|high demand|unavailable|quota|rate limit/i.test(err.message || '');

// input: { patient, prescription, rule_warnings } (service-booking đã gom sẵn)
exports.reviewPrescription = async (input) => {
  if (!process.env.GEMINI_API_KEY) throw new SafetyReviewError('Chưa cấu hình khóa AI (GEMINI_API_KEY)');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  let lastError;
  for (const name of getModelNames()) {
    const model = genAI.getGenerativeModel({
      model: name,
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 8192, temperature: 0.2 },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      let result;
      try {
        result = await model.generateContent(`Dữ liệu ca khám (JSON):
${JSON.stringify(input)}`);
      } catch (err) {
        lastError = err;
        console.error(`❌ [AI rà soát đơn] Gemini ${name}:`, err.status, err.message);
        if (err.status === 400 && /api key/i.test(err.message || '')) throw new SafetyReviewError('Khóa AI không hợp lệ (GEMINI_API_KEY)');
        if (err.status === 403) throw new SafetyReviewError('Khóa AI không có quyền dùng Gemini (GEMINI_API_KEY)');
        if (err.status === 404) break; // model không tồn tại / bị gỡ -> thử model dự phòng
        if (!isRetryable(err)) throw new SafetyReviewError(`AI lỗi (${err.status || 'không rõ'}), vui lòng thử lại`);
        await sleep(1000);
        continue;
      }
      const candidate = result.response.candidates?.[0];
      const reason = candidate?.finishReason;
      if (result.response.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(reason)) {
        throw new SafetyReviewError('AI từ chối phân tích ca này, bác sĩ đánh giá theo cảnh báo hệ thống');
      }
      if (reason === 'MAX_TOKENS') throw new SafetyReviewError('AI trả kết quả không đầy đủ, vui lòng thử lại');
      let parsed;
      try {
        parsed = JSON.parse(result.response.text());
      } catch {
        lastError = new Error('JSON không hợp lệ');
        continue;
      }
      return {
        summary: String(parsed.summary || ''),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        questions: Array.isArray(parsed.questions) ? parsed.questions.map(String) : [],
        model: name,
      };
    }
  }
  if (lastError && /quota|429/i.test(`${lastError.status} ${lastError.message}`)) {
    throw new SafetyReviewError('AI đã hết lượt gọi (gói miễn phí của Gemini), vui lòng thử lại sau');
  }
  throw new SafetyReviewError('AI đang quá tải hoặc trả kết quả lỗi, vui lòng thử lại sau ít phút');
};

exports.SafetyReviewError = SafetyReviewError;
