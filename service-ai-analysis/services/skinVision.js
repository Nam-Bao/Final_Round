// Cài đặt: npm i @anthropic-ai/sdk
// Biến môi trường: ANTHROPIC_API_KEY (bắt buộc), VISION_MODEL (tùy chọn)
// Kết quả chỉ mang tính MÔ TẢ hỗ trợ nhân viên tư vấn, không phải chẩn đoán.
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic(); // tự đọc ANTHROPIC_API_KEY từ env
const MODEL = process.env.VISION_MODEL || 'claude-sonnet-5-5'; // kiểm tra lại tên model trong tài liệu hiện hành

const SYSTEM = `Bạn là trợ lý hỗ trợ nhân viên spa, KHÔNG phải bác sĩ và KHÔNG chẩn đoán bệnh.
Chỉ trả về JSON hợp lệ, không thêm chữ nào khác, theo cấu trúc:
{
  "is_face": boolean,
  "image_quality": { "ok": boolean, "notes": string },
  "observations": [ { "type": string, "region": string, "severity": "nhẹ"|"vừa"|"nặng", "description": string } ],
  "overall_severity": "nhẹ"|"vừa"|"nặng"|"không rõ",
  "needs_professional_review": boolean,
  "staff_note": string
}
"type" mô tả bằng tiếng Việt (ví dụ: mảng đỏ viêm, nốt mủ, thâm sau mụn, lỗ chân lông to...).
"region" là vị trí trên mặt (má trái, trán, cằm...). Nếu không chắc, nói rõ là không chắc.
Nếu thấy dấu hiệu nặng (sưng lớn, đau, mủ nhiều, lan rộng) thì đặt needs_professional_review = true.`;

const extractJson = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Phản hồi không chứa JSON');
  return JSON.parse(text.slice(start, end + 1));
};

exports.describeSkin = async (imageUrl) => {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: 'Hãy mô tả tình trạng da trong ảnh theo đúng định dạng JSON.' },
        ],
      },
    ],
  });

  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extractJson(text);
};