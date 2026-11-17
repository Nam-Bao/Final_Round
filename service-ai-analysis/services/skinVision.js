// Nhận xét tình trạng da cho KHÁCH bằng Gemini (đọc ảnh + kết quả khoanh vùng của Roboflow):
// mô tả theo vùng, lời khuyên chăm sóc da / sinh hoạt / ăn uống, gợi ý sản phẩm đang bán trên web.
// Biến môi trường: GEMINI_API_KEY (bắt buộc, dùng chung với chatbot), VISION_MODEL (mặc định gemini-3.6-flash),
// VISION_FALLBACK_MODEL (mặc định gemini-3.5-flash-lite)
// Chỉ mang tính tham khảo, không phải chẩn đoán.
const axios = require('axios');
const { toCard, ruleReason } = require('./productMatch');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const getModelNames = () => [
  process.env.VISION_MODEL || 'gemini-3.6-flash',
  process.env.VISION_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
].filter((name, index, arr) => name && arr.indexOf(name) === index);

const MAX_PRODUCTS = 3;

const SYSTEM = `Bạn là trợ lý chăm sóc da của phòng khám da liễu GlowSkin, viết nhận xét cho CHÍNH KHÁCH HÀNG đọc sau khi họ tự chụp ảnh da mặt.
Bạn KHÔNG phải bác sĩ và KHÔNG chẩn đoán bệnh. Bạn nhận: ảnh, kết quả khoanh vùng tự động (có thể sai hoặc bỏ sót) và danh sách sản phẩm ỨNG VIÊN đã được hệ thống lọc theo vấn đề da.

Nguyên tắc chính xác (đo trên 199 ảnh có nhãn: tự nhận định thường báo THỪA vấn đề, nhất là thâm, mụn đầu đen, nám):
- Bám theo "concerns" trong kết quả khoanh vùng: đó là các nhóm vấn đề hệ thống đã phát hiện.
- Vấn đề KHÔNG có trong concerns chỉ được nêu khi nhìn thấy RẤT RÕ trên ảnh; nếu nêu thì ghi rõ là "có thể có, nên để chuyên viên kiểm tra".
- Không suy diễn từ màu da đỏ / sạm chung, bóng sáng, lỗ chân lông, bóng đổ, lông mày, chất lượng ảnh.
- concerns rỗng: không khẳng định da có vấn đề; nói AI chưa thấy vấn đề rõ ràng và gợi ý chăm sóc cơ bản.

Yêu cầu:
- observations: mô tả những gì thấy được trên ảnh theo từng vùng (má trái, trán, cằm...), dùng từ dễ hiểu. Không chắc thì nói là chưa rõ.
- customer_summary: 1 - 2 câu nói trực tiếp với khách (xưng "bạn"), nhẹ nhàng, không gây lo lắng, không dùng từ chuyên môn khó.
  Không viết lời dặn cho nhân viên hay bác sĩ (như "có thể tư vấn khách...", "hướng dẫn khách...").
- care_tips: 4 - 7 lời khuyên cụ thể, làm được ngay, đúng với tình trạng đang thấy. category là:
  "skincare" (cách chăm sóc da: làm sạch, chống nắng, không nặn mụn...), "lifestyle" (ngủ, stress, vệ sinh vỏ gối / điện thoại, trang điểm...),
  "diet" (ăn uống: uống đủ nước, hạn chế đồ ngọt / sữa / dầu mỡ nếu liên quan mụn...). Mỗi nhóm ít nhất 1 lời khuyên.
  Không khuyên dùng thuốc kê đơn, không hứa chữa khỏi.
- products: chọn tối đa ${MAX_PRODUCTS} sản phẩm trong danh sách ỨNG VIÊN hợp nhất với những gì bạn thấy trên ảnh (ưu tiên vấn đề rõ nhất,
  rồi đến bước cơ bản như làm sạch / chống nắng), ghi đúng product_id. reason: 1 câu ngắn cho khách vì sao hợp. Không chọn sản phẩm chỉ vì đắt.
- Nếu ảnh không phải khuôn mặt người: is_face = false, observations / care_tips / products để trống, customer_summary nhắc chụp lại.
- Nếu thấy dấu hiệu nặng (sưng lớn, đau, mủ nhiều, lan rộng): needs_professional_review = true.
Viết tiếng Việt.`;

const STR = { type: SchemaType.STRING };
const SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    is_face: { type: SchemaType.BOOLEAN },
    image_quality: {
      type: SchemaType.OBJECT,
      properties: { ok: { type: SchemaType.BOOLEAN }, notes: STR },
      required: ['ok', 'notes'],
    },
    observations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: STR, region: STR,
          severity: { type: SchemaType.STRING, format: 'enum', enum: ['nhẹ', 'vừa', 'nặng'] },
          description: STR,
        },
        required: ['type', 'region', 'severity', 'description'],
      },
    },
    overall_severity: { type: SchemaType.STRING, format: 'enum', enum: ['nhẹ', 'vừa', 'nặng', 'không rõ'] },
    needs_professional_review: { type: SchemaType.BOOLEAN },
    customer_summary: STR,
    care_tips: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { category: { type: SchemaType.STRING, format: 'enum', enum: ['skincare', 'lifestyle', 'diet'] }, tip: STR },
        required: ['category', 'tip'],
      },
    },
    products: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { product_id: STR, reason: STR },
        required: ['product_id', 'reason'],
      },
    },
  },
  required: ['is_face', 'image_quality', 'observations', 'overall_severity', 'needs_professional_review', 'customer_summary', 'care_tips', 'products'],
};

// Chỉ giữ sản phẩm có trong danh sách ứng viên (AI có thể bịa id), gắn tên / link / giá / ảnh để trang khách hiển thị.
// AI không chọn được sản phẩm nào thì lấy 3 ứng viên đầu theo quy tắc.
const attachProducts = (picked, candidates) => {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const seen = new Set();
  const chosen = (Array.isArray(picked) ? picked : [])
    .filter((p) => byId.has(p?.product_id) && !seen.has(p.product_id) && seen.add(p.product_id))
    .slice(0, MAX_PRODUCTS)
    .map((p) => toCard(byId.get(p.product_id), String(p.reason || '')));
  return chosen.length ? chosen : candidates.slice(0, MAX_PRODUCTS).map((p) => toCard(p, ruleReason(p)));
};

// images: [{ url, angle }] (1 - 3 ảnh của cùng lượt soi, URL đã được controller kiểm tra: chỉ ảnh Cloudinary của hệ thống)
// findings: { level, concerns, groups: [{ name, confirmed, possible }] } từ Roboflow (gộp các ảnh); candidates: sản phẩm đã lọc theo quy tắc
exports.describeSkin = async (images, findings = {}, candidates = []) => {
  const list = (Array.isArray(images) ? images : [{ url: images, angle: 'Chính diện' }]).slice(0, 3);
  const files = await Promise.all(list.map((im) => axios.get(im.url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024 })));
  const context = {
    so_anh: list.length,
    goc_chup: list.map((im, i) => `Ảnh ${i + 1}: ${im.angle}`),
    ket_qua_khoanh_vung: findings,
    ung_vien: candidates.map((p) => ({ product_id: p.id, name: p.name, xu_ly: p.concerns, skin_types: p.skin_types, benefits: p.benefits })),
  };
  const parts = [
    ...files.flatMap((img, i) => [
      { text: `Ảnh ${i + 1} (${list[i].angle}):` },
      { inlineData: { mimeType: String(img.headers['content-type'] || 'image/jpeg').split(';')[0], data: Buffer.from(img.data).toString('base64') } },
    ]),
    { text: `Dữ liệu kèm theo (JSON):
${JSON.stringify(context)}

${list.length > 1 ? 'Các ảnh là CÙNG MỘT người chụp ở các góc khác nhau: nhận xét gộp, không lặp lại cùng một vùng. ' : ''}Hãy viết nhận xét cho khách theo đúng cấu trúc.` },
  ];

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  let lastError;
  for (const name of getModelNames()) {
    try {
      const model = genAI.getGenerativeModel({
        model: name,
        systemInstruction: SYSTEM,
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, maxOutputTokens: 4096, temperature: 0.3 },
      });
      const result = await model.generateContent(parts);
      const u = result.response.usageMetadata || {};
      console.log(`[Vision] ${name} token: vào ${u.promptTokenCount ?? '?'}, ra ${u.candidatesTokenCount ?? '?'}, suy nghĩ ${u.thoughtsTokenCount ?? 0}`);
      const data = JSON.parse(result.response.text());
      return {
        ...data,
        care_tips: (data.care_tips || []).filter((t) => ['skincare', 'lifestyle', 'diet'].includes(t?.category) && t.tip),
        products: attachProducts(data.products, candidates),
        source: 'ai',
        model: name,
      };
    } catch (err) {
      lastError = err; // model quá tải / hết lượt / không có => thử model dự phòng
      console.error(`[Vision] Gemini ${name}:`, err.status || '', err.message);
    }
  }
  throw lastError;
};
