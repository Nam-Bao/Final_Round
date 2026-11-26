import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { MessageCircle, X, Send, User, Clock, PhoneCall, LogIn, Paperclip, FileText, Loader2 } from 'lucide-react';
import { io } from 'socket.io-client'; 
import dayjs from 'dayjs';

import ClientNavbar from './components/ClientNavbar';
import ClientFooter from './components/ClientFooter';
import MobileTabBar from './components/MobileTabBar';
import ScrollManager from './components/ScrollManager';
import BackToTop from './components/BackToTop';
import ReminderBanner from './components/ReminderBanner';
import PromoPopup from './components/PromoPopup';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import AiTriagePage from './pages/AiTriagePage';
import SkinHistoryPage from './pages/SkinHistoryPage';
import HomePage from './pages/HomePage';
import DoctorBookingPage from './pages/DoctorBookingPage';
import AppointmentHistoryPage from './pages/AppointmentHistoryPage';
import TreatmentPackagesPage from './pages/TreatmentPackagesPage';
import PharmacyOrdersPage from './pages/PharmacyOrdersPage';
import ProfilePage from './pages/ProfilePage';
import PaymentPage from './pages/PaymentPage';
import ServicesPage from './pages/ServicesPage';
import PolicyPage from './pages/PolicyPage';
import PackageCatalogPage from './pages/PackageCatalogPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ServiceDetailPage from './pages/ServiceDetailPage';
import NewsPage from './pages/NewsPage';
import NewsDetailPage from './pages/NewsDetailPage';
import PromotionsPage from './pages/PromotionsPage'; 
import ReviewsPage from './pages/ReviewsPage';
import CustomerShopPage from './pages/CustomerShopPage';
import ContactPage from './pages/ContactPage';
import SearchPage from './pages/SearchPage';
import AboutPage from './pages/AboutPage';
import DoctorsPage from './pages/DoctorsPage';
import ConsultationBookingPage from './pages/ConsultationBookingPage';
import ContactButtons from './components/ContactButtons';

// ====== CHATBOT AI ======
// Gemini chạy ở service-ai-analysis, frontend không giữ API key. Chưa đăng nhập vẫn chat với AI được
// (chat với CSKH mới bắt buộc đăng nhập)
// Trả JSON { text, sources, consent_request?, personal_used }. session_id: mỗi lần mở trang một phiên chat,
// khách đồng ý cho chatbot xem dữ liệu riêng chỉ có hiệu lực trong phiên đó
async function askChatbot(messages, sessionId, token) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages, session_id: sessionId }),
  });
  if (token && (res.status === 401 || res.status === 403)) {
    useAuthStore.getState().logout();
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `Chatbot lỗi ${res.status}`);
    err.serverMessage = body.message;
    throw err;
  }
  return body.data;
}

// Khách đồng ý (POST) / thu hồi (DELETE) cho chatbot xem lịch hẹn, điểm, đơn hàng trong phiên chat
async function chatConsent(method, sessionId, token, scopes) {
  const res = await fetch('/api/ai/chat/consent', {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ session_id: sessionId, scopes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Không lưu được lựa chọn');
  return body.data || [];
}

const newChatSession = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Nguồn chatbot trích dẫn [n]: bấm để mở trang tương ứng
const PERSONAL_LABEL = { APPOINTMENTS: 'lịch hẹn', POINTS: 'Điểm GlowSkin', ORDERS: 'đơn hàng' };
function ChatSources({ sources, personal, onNavigate }) {
  if (!sources?.length && !personal?.length) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-white/30 text-xs space-y-0.5">
      {personal?.length > 0 && <div className="opacity-90">Dữ liệu tài khoản đã xem: {personal.map((p) => PERSONAL_LABEL[p] || p).join(', ')}</div>}
      {sources?.length > 0 && <div className="opacity-80">Nguồn:</div>}
      {sources.map((s) => (
        <Link key={s.n} to={s.url || '/'} onClick={onNavigate} className="block underline underline-offset-2 opacity-95 hover:opacity-100">[{s.n}] {s.title}</Link>
      ))}
    </div>
  );
}

// Chưa đăng nhập -> sang trang đăng nhập, đăng nhập xong quay lại đúng trang đang mở
// Tệp gửi trong chat CSKH: ảnh hiện thu nhỏ (bấm để xem), PDF hiện thẻ tên tệp
function ChatAttachments({ files }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {files.map((f) => (f.type === 'pdf' ? (
        <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white/90 text-slate-700 rounded-lg px-2 py-1.5 text-xs max-w-[200px] border border-slate-200">
          <FileText className="w-4 h-4 text-red-500 shrink-0" /><span className="truncate">{f.name}</span>
        </a>
      ) : (
        <a key={f.url} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name || 'Ảnh'} className="w-28 h-28 object-cover rounded-lg border border-white/50" /></a>
      )))}
    </div>
  );
}

function ProtectedRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();
  if (token) return children;
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

const isWorkingHour = () => {
  const hour = dayjs().hour();
  return hour >= 8 && hour < 17; // giờ làm việc của CSKH
};

function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [chatMode, setChatMode] = useState('AI'); 
  const [socket, setSocket] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [outOfOffice, setOutOfOffice] = useState(false); 

  const user = useAuthStore((state) => state.user); 
  const token = useAuthStore((state) => state.token);

  // Phiên chat AI: đổi khi đăng nhập / đăng xuất. consents: loại dữ liệu khách đã cho chatbot xem trong phiên
  const chatSessionRef = useRef(newChatSession());
  const [consents, setConsents] = useState([]);

  const [messages, setMessages] = useState([
    { id: 1, sender: 'cs', text: 'Chào bạn! Kỹ thuật viên GlowSkin có thể giúp gì cho bạn hôm nay?' }
  ]);

  useEffect(() => {
    chatSessionRef.current = newChatSession();
    setConsents([]);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setMessages([{ id: 1, sender: 'cs', text: 'Chào bạn! Kỹ thuật viên GlowSkin có thể giúp gì cho bạn hôm nay?' }]);
      setChatMode('AI');
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      setCurrentSessionId(null);
    }
  }, [user]);

  useEffect(() => {
    const handleOpenChat = () => {
      setIsChatOpen(true); 
      if (chatMode === 'AI') handleSwitchToHuman(); 
    };
    window.addEventListener('open_cskh_chat', handleOpenChat);
    return () => window.removeEventListener('open_cskh_chat', handleOpenChat);
  }, [chatMode]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen, isLoading, outOfOffice]);

  const handleSwitchToHuman = () => {
    setIsLoading(false); 
    if (!token) { // chat với CSKH bắt buộc đăng nhập; chat AI vẫn dùng được
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', isSystem: true, text: 'Vui lòng đăng nhập để chat với nhân viên CSKH. Bạn vẫn có thể hỏi AI ngay tại đây.' }]);
      return;
    }

    if (!isWorkingHour()) {
      setOutOfOffice(true);
      setMessages(prev => [...prev, { 
        id: Date.now(), sender: 'cs', isSystem: true,
        text: 'Hiện tại đã hết giờ làm việc của Tư vấn viên (08:00 - 17:00). Bạn có thể chat với tôi (Chat Box AI) hoặc liên hệ qua Hotline nếu cần hỗ trợ khẩn cấp.'
      }]);
      return;
    }

    setChatMode('WAITING'); 
    // Gửi token để server biết khách là ai (server từ chối kết nối nếu chưa đăng nhập)
    // Dev: cùng địa chỉ trang (Vite chuyển tiếp /socket.io). Máy chủ: VITE_SOCKET_URL = địa chỉ service identity
    const newSocket = import.meta.env.VITE_SOCKET_URL ? io(import.meta.env.VITE_SOCKET_URL, { auth: { token } }) : io({ auth: { token } });
    setSocket(newSocket);
    
    setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', text: 'Đang xếp hàng kết nối với nhân viên CSKH...' }]);
    newSocket.emit('request_human_chat');

    // Token hết hạn / không hợp lệ: server từ chối kết nối -> quay về chat AI và báo khách đăng nhập lại
    newSocket.on('connect_error', () => {
      newSocket.disconnect();
      setSocket(null);
      setChatMode('AI');
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', isSystem: true, text: 'Không kết nối được với CSKH. Phiên đăng nhập có thể đã hết hạn, vui lòng đăng nhập lại.' }]);
    });
  
    newSocket.on('chat_accepted', (data) => {
      setChatMode('HUMAN'); 
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', text: data.message, isSystem: true }]);
      setCurrentSessionId(data.sessionId); 
    });
    
    newSocket.on('system_message', (msg) => {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', text: msg, isSystem: true }]);
    });

    newSocket.on('session_closed', () => {
      setChatMode('AI'); 
      if (newSocket) newSocket.disconnect();
      setSocket(null);
      setCurrentSessionId(null);
    });
  
    newSocket.on('receive_message', (data) => {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', text: data.content, attachments: data.attachments }]);
    });
  };

  const fileInputRef = useRef(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const handleAttachFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = '';
    if (!files.length || !socket || !currentSessionId) return;
    setIsUploadingFile(true);
    const attachments = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/media/upload/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Không gửi được tệp');
        attachments.push(data);
      } catch (err) {
        setMessages((prev) => [...prev, { id: Date.now() + Math.random(), sender: 'cs', isSystem: true, text: `${file.name}: ${err.message}` }]);
      }
    }
    setIsUploadingFile(false);
    if (!attachments.length) return;
    setMessages((prev) => [...prev, { id: Date.now(), sender: 'user', text: '', attachments }]);
    socket.emit('send_message', { sessionId: currentSessionId, content: '', attachments });
  };

  // preset: nội dung nút trả lời nhanh (gửi y như khách tự gõ); không có thì lấy ô nhập
  const handleSendMessage = async (preset) => {
    const userText = (typeof preset === 'string' ? preset : inputValue).trim();
    if (!userText || isLoading) return;

    const newMessages = [...messages, { id: Date.now(), sender: 'user', text: userText }];
    setMessages(newMessages);
    if (typeof preset !== 'string') setInputValue('');

    if (outOfOffice) setOutOfOffice(false);

    if (chatMode === 'HUMAN' && socket && currentSessionId) {
      socket.emit('send_message', { 
        sessionId: currentSessionId, content: userText 
      });
    } else {
      await askAi(newMessages);
    }
  };

  // Gửi hội thoại cho chatbot (bỏ tin hệ thống, tin lỗi và câu xin phép xem dữ liệu)
  const askAi = async (list) => {
    setIsLoading(true);
    try {
      const history = list.filter((m) => m.id !== 1 && !m.isError && !m.isSystem && !m.consentRequest).slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text,
      }));
      const data = await askChatbot(history, chatSessionRef.current, token);
      setMessages((prev) => [...prev, {
        id: Date.now() + 1, sender: 'cs', text: data.text, sources: data.sources, personal: data.personal_used, quickReplies: data.quick_replies || [],
        consentRequest: data.consent_request || null,
      }]);
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: Date.now() + 2, sender: 'cs', isError: true,
        // 429 = vượt giới hạn lượt gọi của server, hiển thị đúng thông báo server trả về
        text: error.serverMessage || 'Hệ thống AI đang bận quá tải, vui lòng thử lại sau giây lát!',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Khách trả lời câu xin phép: đồng ý => lưu đồng ý rồi hỏi lại đúng câu đó; không đồng ý => chỉ chỗ tự xem
  const answerConsent = async (msg, agree) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, consentAnswered: agree ? 'yes' : 'no' } : m)));
    const scopes = msg.consentRequest.scopes;
    if (!agree) {
      setMessages((prev) => [...prev, {
        id: Date.now(), sender: 'cs', isSystem: true,
        text: `Mình sẽ không xem dữ liệu của bạn. Bạn có thể tự xem ${scopes.map((s) => s.label).join(', ')} trên website.`,
        links: scopes.map((s) => ({ to: s.link, label: s.label })),
      }]);
      return;
    }
    try {
      setConsents(await chatConsent('POST', chatSessionRef.current, token, scopes.map((s) => s.scope)));
      const upTo = messages.slice(0, messages.findIndex((m) => m.id === msg.id));
      await askAi(upTo);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now(), sender: 'cs', isError: true, text: err.message }]);
    }
  };

  const revokeConsents = async () => {
    try {
      await chatConsent('DELETE', chatSessionRef.current, token, []);
      setConsents([]);
      setMessages((prev) => [...prev, { id: Date.now(), sender: 'cs', isSystem: true, text: 'Đã thu hồi quyền xem dữ liệu. Chatbot sẽ hỏi lại nếu cần.' }]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now(), sender: 'cs', isError: true, text: err.message }]);
    }
  };

  return (
    <BrowserRouter>
      <ScrollManager onNavigate={() => setIsChatOpen(false)} />
      <div className="min-h-screen flex flex-col bg-[#F7FAF9] relative pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <ClientNavbar />
        
        <main className="flex-1 w-full mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-7xl">
          <ReminderBanner />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sang-loc-da" element={<AiTriagePage />} />
            <Route path="/lich-su-soi-da" element={<ProtectedRoute><SkinHistoryPage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
            <Route path="/booking" element={<ProtectedRoute><DoctorBookingPage /></ProtectedRoute>} />
            <Route path="/tu-van" element={<ProtectedRoute><ConsultationBookingPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><AppointmentHistoryPage /></ProtectedRoute>} />
            <Route path="/treatments" element={<ProtectedRoute><TreatmentPackagesPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><PharmacyOrdersPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/payment/:id" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
            <Route path="/payment/tu-van/:id" element={<ProtectedRoute><PaymentPage key="consultation" kind="consultation" /></ProtectedRoute>} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/tim-kiem" element={<SearchPage />} />
            <Route path="/gioi-thieu" element={<AboutPage />} />
            <Route path="/doi-ngu-bac-si" element={<DoctorsPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/:id" element={<ServiceDetailPage />} />  
            <Route path="/news" element={<NewsPage />} />
            <Route path="/news/:slug" element={<NewsDetailPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/shops" element={<CustomerShopPage />} />
            <Route path="/shops/:slug" element={<ProductDetailPage />} />
            <Route path="/goi-lieu-trinh" element={<PackageCatalogPage />} />
            <Route path="/chinh-sach" element={<PolicyPage />} />
            <Route path="/chinh-sach-bao-mat" element={<PolicyPage />} />
          </Routes>
        </main>

        {/* FOOTER HIỂN THỊ CỐ ĐỊNH Ở CHÂN TRANG CHO TOÀN BỘ WEBSITE */}
        <ClientFooter />

        {/* POPUP QUẢNG CÁO DO QUẢN LÝ CẤU HÌNH */}
        <PromoPopup />

        {/* NÚT BẤM VÀ KHUNG CHAT AI / CSKH */}
        <MobileTabBar />
        <div className={`fixed right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6 flex flex-col items-end ${isChatOpen ? 'z-[70]' : 'z-40'}`}>
          {!isChatOpen && <BackToTop />}
          {/* Hotline + Zalo: ẩn khi đang mở khung chat cho gọn */}
          {!isChatOpen && <ContactButtons />}
          {isChatOpen && (
            <div className="fixed inset-0 z-[70] flex flex-col bg-base-100 sm:static sm:z-auto sm:w-96 sm:mb-4 sm:rounded-2xl sm:shadow-2xl sm:border sm:border-base-200 overflow-hidden animate-fade-in-up">
              <div className="bg-primary text-white p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div className="avatar online"><div className="w-8 rounded-full bg-white text-primary flex items-center justify-center font-bold">CS</div></div>
                  <span className="font-bold text-sm">GlowSkin O2O</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="btn btn-ghost btn-sm btn-circle text-white" aria-label="Đóng khung chat"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-4 flex-1 min-h-0 sm:flex-none sm:h-80 overflow-y-auto bg-base-200 flex flex-col gap-3">
                {messages.map((msg, idx) => (
                  <React.Fragment key={msg.id}>
                  <div className={`chat ${msg.sender === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className={`chat-bubble text-sm shadow-sm break-words whitespace-pre-line ${msg.sender === 'user' ? 'bg-base-100 text-base-content' : 'chat-bubble-primary text-white'}`}>
                      {msg.text}
                      <ChatAttachments files={msg.attachments} />
                      <ChatSources sources={msg.sources} personal={msg.personal} onNavigate={() => setIsChatOpen(false)} />
                      {msg.links?.map((l) => <Link key={l.to} to={l.to} onClick={() => setIsChatOpen(false)} className="block underline text-xs mt-1">Mở trang {l.label}</Link>)}
                      {msg.consentRequest && !msg.consentAnswered && (
                        <div className="flex gap-2 mt-2">
                          <button className="btn btn-xs bg-white text-primary border-0" onClick={() => answerConsent(msg, true)}>Đồng ý cho xem</button>
                          <button className="btn btn-xs btn-ghost text-white border border-white/50" onClick={() => answerConsent(msg, false)}>Không đồng ý</button>
                        </div>
                      )}
                      {msg.consentAnswered && <div className="text-xs opacity-80 mt-1">{msg.consentAnswered === 'yes' ? 'Bạn đã đồng ý.' : 'Bạn đã từ chối.'}</div>}
                    </div>
                  </div>
                  {/* Nút trả lời nhanh: chỉ dưới câu trả lời AI mới nhất; khách gõ câu khác thì nút tự ẩn */}
                  {idx === messages.length - 1 && msg.sender === 'cs' && msg.quickReplies?.length > 0 && !isLoading && chatMode !== 'HUMAN' && (
                    <div className="flex flex-wrap gap-1.5 -mt-1 ml-1">
                      {msg.quickReplies.map((q) => (q.type === 'link' ? (
                        <Link key={q.label} to={q.url} onClick={() => setIsChatOpen(false)} className="quick-reply btn btn-xs btn-outline btn-primary rounded-full normal-case font-medium">{q.label}</Link>
                      ) : (
                        <button key={q.label} className="quick-reply btn btn-xs btn-outline btn-primary rounded-full normal-case font-medium"
                          onClick={() => (q.type === 'human' ? handleSwitchToHuman() : handleSendMessage(q.text))}>{q.label}</button>
                      )))}
                    </div>
                  )}
                  </React.Fragment>
                ))}
                
                {outOfOffice && (
                  <div className="flex justify-center mt-2">
                    <a href="/contact" className="btn btn-sm btn-error text-white gap-1 shadow-md">
                      <PhoneCall className="w-3 h-3"/> Liên hệ Hotline
                    </a>
                  </div>
                )}

                {isLoading && (
                  <div className="chat chat-start">
                    <div className="chat-bubble chat-bubble-primary text-white text-sm opacity-70 flex items-center gap-2">
                      <span className="loading loading-dots loading-sm"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-2 bg-base-100 border-t flex flex-col gap-2 shrink-0">
                {!user && (
                  <Link to="/login?next=/" onClick={() => setIsChatOpen(false)} className="btn btn-xs btn-outline btn-primary self-start gap-1">
                    <LogIn className="w-3 h-3" /> Đăng nhập để chat với CSKH
                  </Link>
                )}
                {user && chatMode === 'AI' && !outOfOffice && (
                  <button onClick={handleSwitchToHuman} className="btn btn-xs btn-outline btn-primary self-start">
                    <User className="w-3 h-3 mr-1"/> Gặp bộ phận CSKH
                  </button>
                )}
                {consents.length > 0 && chatMode !== 'HUMAN' && (
                  <div className="text-xs text-slate-500 self-start flex flex-wrap items-center gap-1">
                    Chatbot đang được xem: {consents.map((c) => c.label).join(', ')}.
                    <button className="link link-primary" onClick={revokeConsents}>Thu hồi</button>
                  </div>
                )}
                {chatMode === 'WAITING' && (
                  <div className="badge badge-warning gap-1 self-start mb-2 text-xs"><Clock className="w-3 h-3"/> Đang chờ CSKH... (Bạn vẫn có thể hỏi AI)</div>
                )}
                
                <div className="flex gap-2 items-center">
                  {chatMode === 'HUMAN' && currentSessionId && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={handleAttachFiles} />
                      <button type="button" className="btn btn-ghost btn-circle" aria-label="Gửi ảnh hoặc PDF" title="Gửi ảnh (tối đa 5MB) hoặc PDF (tối đa 10MB), tối đa 5 tệp"
                        onClick={() => fileInputRef.current?.click()} disabled={isUploadingFile}>
                        {isUploadingFile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                      </button>
                    </>
                  )}
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={chatMode === 'AI' || chatMode === 'WAITING' ? "Hỏi AI..." : "Nhắn CSKH..."}
                    className="input input-bordered flex-1 min-w-0 h-11"
                    disabled={isLoading && chatMode === 'AI'} 
                  />
                  <button className="btn btn-primary btn-circle" aria-label="Gửi" onClick={handleSendMessage} disabled={isLoading && chatMode === 'AI'}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <button 
            aria-label={isChatOpen ? 'Đóng khung chat' : 'Mở khung chat tư vấn'}
            className={`btn btn-primary btn-circle w-12 h-12 min-h-12 lg:w-14 lg:h-14 lg:min-h-14 shadow-xl transition-transform hover:scale-105 ${isChatOpen ? 'hidden sm:inline-flex' : ''}`} 
            onClick={() => setIsChatOpen(!isChatOpen)}
          >
            {isChatOpen ? <X className="w-8 h-8 text-white" /> : <MessageCircle className="w-8 h-8 text-white" />}
          </button>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;