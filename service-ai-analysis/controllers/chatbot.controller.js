const chatbot = require('../services/chatbot');
const knowledge = require('../services/knowledge');

const MAX_HISTORY = 8;
const MAX_TEXT_LENGTH = 1000;
const SESSION_RE = /^[\w-]{8,64}$/;

// POST /chat — body: { messages: [{ role: 'user' | 'model', text }], session_id }
// Trả JSON { text, sources: [{ n, title, url }], consent_request?, personal_used }
exports.chat = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ message: 'Chatbot chưa được cấu hình GEMINI_API_KEY' });
  const messages = (Array.isArray(req.body?.messages) ? req.body.messages.slice(-MAX_HISTORY) : [])
    .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TEXT_LENGTH) }));
  // Gemini yêu cầu lượt đầu là của khách
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ message: 'Thiếu câu hỏi của khách' });
  const sessionId = SESSION_RE.test(String(req.body?.session_id || '')) ? req.body.session_id : null;
  try {
    const data = await chatbot.answer({ messages, user: req.user, authorization: req.header('Authorization'), sessionId });
    res.status(200).json({ data });
  } catch (error) {
    console.error('[Chatbot RAG]', error.response?.data?.error?.message || error.message);
    res.status(503).json({ message: 'Hệ thống AI đang bận, vui lòng thử lại sau' });
  }
};

// Khách đồng ý / thu hồi cho chatbot xem dữ liệu riêng trong phiên chat
const sessionOf = (req, res) => {
  const id = req.body?.session_id || req.query.session_id;
  if (!SESSION_RE.test(String(id || ''))) { res.status(400).json({ message: 'Phiên chat không hợp lệ' }); return null; }
  return id;
};
exports.grantConsent = async (req, res) => {
  const sessionId = sessionOf(req, res); if (!sessionId) return;
  const scopes = [...new Set((Array.isArray(req.body?.scopes) ? req.body.scopes : []).filter((s) => chatbot.SCOPES[s]))];
  if (!scopes.length) return res.status(400).json({ message: 'Chưa chọn loại dữ liệu' });
  res.status(200).json({ data: await chatbot.grantConsent(req.user.id, sessionId, scopes) });
};
exports.listConsent = async (req, res) => {
  const sessionId = sessionOf(req, res); if (!sessionId) return;
  res.status(200).json({ data: await chatbot.listConsent(req.user.id, sessionId) });
};
exports.revokeConsent = async (req, res) => {
  const sessionId = sessionOf(req, res); if (!sessionId) return;
  res.status(200).json({ data: await chatbot.revokeConsent(req.user.id, sessionId), message: 'Đã thu hồi quyền xem dữ liệu' });
};

// Quản lý: xem tình trạng kho kiến thức, nạp lại ngay (sau khi sửa giá, sản phẩm, bài viết, quy tắc)
exports.knowledgeStatus = (req, res) => res.status(200).json({ data: knowledge.status() });
exports.reindex = async (req, res) => {
  try { res.status(200).json({ data: await knowledge.reindexAll(), message: 'Đã nạp lại kho kiến thức' }); }
  catch (error) { res.status(503).json({ message: `Không nạp được kho kiến thức: ${error.message}` }); }
};

// ===== Trợ lý cho nhân viên =====
const assist = require('../services/staffAssist');
// CSKH: gợi ý câu trả lời cho phiên chat đang mở. body: { messages: [{ sender: 'CUSTOMER' | 'CONSULTANT', text }] }
exports.draftReply = async (req, res) => {
  const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
    .filter((m) => ['CUSTOMER', 'CONSULTANT'].includes(m?.sender) && typeof m.text === 'string' && m.text.trim());
  try { res.status(200).json({ data: await assist.draftReply(messages) }); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error('[AI gợi ý trả lời]', error.response?.data?.error?.message || error.message);
    res.status(503).json({ message: 'AI đang bận, vui lòng thử lại sau' });
  }
};
// Quản lý / bác sĩ soạn quy tắc an toàn: quy tắc đang áp dụng gần giống. body: { condition, target_label, target_keywords, severity_label, message, exclude_ids }
exports.similarRules = async (req, res) => {
  const b = req.body || {};
  if (!b.condition || !b.target_label) return res.status(400).json({ message: 'Chọn tình trạng và đối tượng trước khi kiểm tra' });
  try {
    const rule = {
      condition: String(b.condition).slice(0, 200), target_label: String(b.target_label).slice(0, 200),
      target_keywords: (Array.isArray(b.target_keywords) ? b.target_keywords : []).map(String).slice(0, 20),
      severity_label: String(b.severity_label || '').slice(0, 40), message: String(b.message || '').slice(0, 500),
    };
    res.status(200).json({ data: await assist.similarRules(rule, (Array.isArray(b.exclude_ids) ? b.exclude_ids : []).map(String)) });
  } catch (error) {
    console.error('[AI quy tắc tương tự]', error.message);
    res.status(503).json({ message: 'Không kiểm tra được lúc này, vui lòng thử lại sau' });
  }
};
// NVBH bán tại quầy: gợi ý sản phẩm theo nhu cầu + tình trạng khách. body: { need, flags, allergies, budget }
exports.productAdvice = async (req, res) => {
  const b = req.body || {};
  const need = String(b.need || '').trim().slice(0, 500);
  if (need.length < 5) return res.status(400).json({ message: 'Nhập nhu cầu của khách (vd: da dầu, mụn ẩn, cần sữa rửa mặt)' });
  try {
    res.status(200).json({ data: await assist.productAdvice({
      need, flags: (Array.isArray(b.flags) ? b.flags : []).map(String).slice(0, 20), allergies: String(b.allergies || '').slice(0, 500),
      budget: Number(b.budget) > 0 ? Math.round(Number(b.budget)) : null,
    }, req.header('Authorization')) });
  } catch (error) {
    console.error('[AI gợi ý sản phẩm]', error.response?.data?.error?.message || error.response?.data?.message || error.message);
    res.status(503).json({ message: 'Không gợi ý được lúc này, vui lòng thử lại sau' });
  }
};
// Mọi nhân viên: hỏi đáp sổ tay quy trình nội bộ (theo vai trò). body: { question, history: [{ role: 'user' | 'model', text }] }
exports.handbookAsk = async (req, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 1000);
  if (question.length < 3) return res.status(400).json({ message: 'Nhập câu hỏi' });
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).filter((m) => typeof m?.text === 'string' && m.text.trim());
  const topicId = /^[\w-]{1,40}$/.test(String(req.body?.topic || '')) ? req.body.topic : null;
  try { res.status(200).json({ data: await assist.handbookAnswer({ question, history, role: req.user.role, topicId }) }); }
  catch (error) {
    console.error('[Sổ tay AI]', error.response?.data?.error?.message || error.message);
    res.status(503).json({ message: 'Trợ lý đang bận, vui lòng thử lại sau' });
  }
};
// Chủ đề + câu hỏi thường gặp của ô chat Hỏi quy trình theo vai trò
exports.handbookTopics = (req, res) => {
  try { res.status(200).json({ data: assist.handbookTopics(req.user.role) }); }
  catch (error) { res.status(500).json({ message: 'Không tải được chủ đề' }); }
};
// Bác sĩ / quản lý: AI tóm tắt hồ sơ khám (chỉ khi khách đã đồng ý, dữ liệu đã bỏ định danh). body: { refresh }
const patientSummary = require('../services/patientSummary');
exports.patientSummary = async (req, res) => {
  try { res.status(200).json({ data: await patientSummary.summarize(req.params.profileId, req.user, req.header('Authorization'), { refresh: req.body?.refresh === true }) }); }
  catch (error) {
    if (error instanceof patientSummary.SummaryError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error('[AI tóm tắt hồ sơ]', error.response?.data?.error?.message || error.message);
    res.status(503).json({ message: 'AI đang bận, vui lòng thử lại sau' });
  }
};
