// Ô chat "Hỏi quy trình" nổi ở mọi trang nội bộ: nhân viên hỏi cách làm một việc, AI trả lời theo sổ tay quy trình
// đúng vai trò (RAG, service-ai-analysis/knowledge/so-tay) + chính sách khách hàng, có nguồn.
// Mở ra: chọn chủ đề (theo vai trò, knowledge/so-tay/chu-de.json) → câu hỏi thường gặp của chủ đề → AI trả lời,
// kèm câu hỏi tiếp theo AI đề xuất. Bấm nút = gửi y như tự gõ; ô nhập luôn dùng được, không bắt buộc chọn chủ đề.
import React, { useEffect, useRef, useState } from 'react';
import { Button, Collapse, Input, Spin, message } from 'antd';
import { BookOutlined, CloseOutlined, SendOutlined, DeleteOutlined, LeftOutlined } from '@ant-design/icons';
import axios from 'axios';

const API = 'http://localhost:4000/api/ai/assist/handbook';
const auth = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('admin_token')}` } });
const chip = 'handbook-quick text-xs px-2.5 py-1 rounded-full border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50 text-left';

// side="left": CSKH đã có Trung tâm CSKH chiếm góc phải dưới => ô hỏi quy trình nằm góc trái để không đè lên
export default function HandbookChat({ side = 'right' }) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(null);   // [{ id, label, questions }]
  const [topic, setTopic] = useState(null);     // chủ đề đang chọn
  const [messages, setMessages] = useState([]); // { role: 'user' | 'model', text, sources, quickReplies }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // Nút đang hiện cuối khung chat: topics = danh sách chủ đề, faq = câu hỏi thường gặp của chủ đề,
  // answer = câu hỏi tiếp theo AI đề xuất, typing = nhân viên tự gõ (ẩn nút cho tới khi có câu trả lời)
  const [view, setView] = useState('topics');
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading, open, topic, view]);
  useEffect(() => {
    if (!open || topics) return;
    axios.get(`${API}/topics`, auth()).then((r) => setTopics(r.data.data || [])).catch(() => setTopics([]));
  }, [open]);

  const ask = async (text) => {
    const question = String(text ?? input).trim();
    if (!question || loading) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    if (text === undefined) setInput('');
    setView('typing');
    setLoading(true);
    try {
      const res = await axios.post(API, { question, history, topic: topic?.id }, { ...auth(), timeout: 60000 });
      const d = res.data.data;
      setMessages((prev) => [...prev, { role: 'model', text: d.text, sources: d.sources, quickReplies: d.quick_replies || [] }]);
      setView('answer');
    } catch (error) {
      message.error(error.response?.data?.message || 'Trợ lý đang bận, vui lòng thử lại');
      setMessages((prev) => prev.slice(0, -1));
      if (text === undefined) setInput(question);
      setView(messages.length ? 'answer' : topic ? 'faq' : 'topics');
    } finally { setLoading(false); }
  };
  const reset = () => { setMessages([]); setTopic(null); setView('topics'); };

  const last = messages[messages.length - 1];
  const left = side === 'left';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Hỏi quy trình (sổ tay)"
        className={`fixed bottom-6 ${left ? 'left-6' : 'right-6'} z-[55] bg-indigo-600 hover:bg-indigo-700 text-white h-12 px-4 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium`}>
        <BookOutlined className="text-lg" /> Hỏi quy trình
      </button>
    );
  }
  return (
    <div className={`fixed bottom-6 right-2 left-2 ${left ? 'sm:right-auto sm:left-6' : 'sm:left-auto sm:right-6'} sm:w-[400px] z-[60] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col`} style={{ height: 'min(560px, 75vh)' }}>
      <div className="bg-indigo-600 text-white px-3 py-2 rounded-t-xl flex items-center justify-between">
        <span className="font-semibold text-sm truncate"><BookOutlined /> Hỏi quy trình{topic && view !== 'topics' ? ` · ${topic.label}` : ''}</span>
        <span className="flex items-center gap-1 shrink-0">
          {(messages.length > 0 || topic) && <Button size="small" type="text" className="!text-white" icon={<DeleteOutlined />} title="Hỏi lại từ đầu" onClick={reset} />}
          <Button size="small" type="text" className="!text-white" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-gray-50">
        <div className="self-start max-w-[90%] p-2.5 rounded-xl bg-white text-sm text-gray-700 shadow-sm">
          Bạn cần làm việc gì? Chọn chủ đề để xem các câu hỏi thường gặp, hoặc gõ câu hỏi ở ô bên dưới.
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[90%] p-2.5 rounded-xl text-sm shadow-sm whitespace-pre-line ${m.role === 'user' ? 'self-end bg-indigo-600 text-white' : 'self-start bg-white text-gray-800'}`}>
            {m.text}
            {m.sources?.length > 0 && (
              <Collapse ghost size="small" className="mt-1 -mx-3" items={[{
                key: 's', label: <span className="text-xs text-gray-500">Nguồn: {m.sources.map((s) => `[${s.n}] ${s.title.replace(/^Sổ tay:\s*/, '')}`).join('; ')}</span>,
                children: m.sources.map((s) => <div key={s.n} className="text-xs text-gray-600 mb-2 whitespace-pre-line"><b>[{s.n}] {s.title}</b>{'\n'}{s.text}</div>),
              }]} />
            )}
          </div>
        ))}
        {loading && <div className="self-start text-xs text-gray-500"><Spin size="small" /> Đang tra sổ tay...</div>}

        {!loading && view === 'topics' && (
          topics === null ? <Spin size="small" /> : (
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => <button key={t.id} type="button" className={`${chip} font-medium`} onClick={() => { setTopic(t); setView('faq'); }}>{t.label}</button>)}
              {topics.length === 0 && <span className="text-xs text-gray-400">Chưa tải được chủ đề, bạn vẫn gõ câu hỏi được.</span>}
            </div>
          )
        )}
        {!loading && view === 'faq' && topic && (
          <div className="flex flex-col items-start gap-1.5">
            <span className="text-xs text-gray-500">Câu hỏi thường gặp · {topic.label}</span>
            {topic.questions.map((q) => <button key={q} type="button" className={chip} onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        {!loading && view === 'answer' && last?.role === 'model' && last.quickReplies?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {last.quickReplies.map((q) => <button key={q} type="button" className={chip} onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        {!loading && view !== 'topics' && view !== 'typing' && (
          <div className="flex gap-3">
            {view === 'answer' && topic && <button type="button" className="handbook-back text-xs text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer" onClick={() => setView('faq')}>Câu hỏi khác trong chủ đề</button>}
            <button type="button" className="handbook-back text-xs text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer" onClick={() => setView('topics')}><LeftOutlined /> {topic ? 'Chủ đề khác' : 'Chọn chủ đề'}</button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t flex gap-2">
        <Input placeholder="Nhập câu hỏi về quy trình..." value={input} onChange={(e) => setInput(e.target.value)} onPressEnter={() => ask()} maxLength={1000} />
        <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={() => ask()} />
      </div>
    </div>
  );
}
