const { startConsultStream } = require('../services/consultChat');

const MAX_HISTORY = 6;
const MAX_TEXT_LENGTH = 1000;

// POST /chat — body: { messages: [{ role: 'user' | 'model', text }] }
// Trả về chữ dạng stream (text/plain) để frontend hiện dần câu trả lời
exports.consultChat = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ message: 'Chatbot chưa được cấu hình GEMINI_API_KEY' });
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-MAX_HISTORY) : [];
  const contents = messages
    .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, MAX_TEXT_LENGTH) }] }));
  if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
    return res.status(400).json({ message: 'Thiếu câu hỏi của khách' });
  }

  let started = false;
  try {
    const result = await startConsultStream(contents);
    for await (const chunk of result.stream) {
      if (!started) {
        started = true;
        res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      }
      res.write(chunk.text());
    }
    if (!started) res.status(200).type('text/plain');
    res.end();
  } catch (error) {
    console.error('[Chatbot Gemini]', error.message);
    if (!started) return res.status(503).json({ message: 'Hệ thống AI đang bận, vui lòng thử lại sau' });
    res.end();
  }
};
