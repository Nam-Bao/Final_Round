import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { MessageCircle, X, Send, User, Clock, PhoneCall, LogIn } from 'lucide-react';
import { io } from 'socket.io-client'; 
import dayjs from 'dayjs';

import ClientNavbar from './components/ClientNavbar';
import ClientFooter from './components/ClientFooter';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AiTriagePage from './pages/AiTriagePage';
import HomePage from './pages/HomePage';
import DoctorBookingPage from './pages/DoctorBookingPage';
import AppointmentHistoryPage from './pages/AppointmentHistoryPage';
import TreatmentPackagesPage from './pages/TreatmentPackagesPage';
import PharmacyOrdersPage from './pages/PharmacyOrdersPage';
import ProfilePage from './pages/ProfilePage';
import PaymentPage from './pages/PaymentPage';
import ServicesPage from './pages/ServicesPage';
import ServiceDetailPage from './pages/ServiceDetailPage';
import NewsPage from './pages/NewsPage';
import NewsDetailPage from './pages/NewsDetailPage';
import PromotionsPage from './pages/PromotionsPage'; 
import ReviewsPage from './pages/ReviewsPage';
import CustomerShopPage from './pages/CustomerShopPage';

// ====== CHATBOT AI ======
// Gemini chạy ở service-ai-analysis, frontend không giữ API key; bắt buộc đăng nhập
async function streamConsultReply(messages, token, onText) {
  const res = await fetch('http://localhost:4000/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
  });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  if (!res.ok || !res.body) throw new Error(`Chatbot lỗi ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
    onText(fullText);
  }
  return fullText;
}

// Chưa đăng nhập -> sang trang đăng nhập, đăng nhập xong quay lại đúng trang đang mở
function ProtectedRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();
  if (token) return children;
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

const isWorkingHour = () => {
  const hour = dayjs().hour();
  return hour >= 8 && hour < 20;
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

  const [messages, setMessages] = useState([
    { id: 1, sender: 'cs', text: 'Chào bạn! Kỹ thuật viên GlowSkin có thể giúp gì cho bạn hôm nay?' }
  ]);

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
    if (!token) return; // khung chat sẽ hiện nút đăng nhập

    if (!isWorkingHour()) {
      setOutOfOffice(true);
      setMessages(prev => [...prev, { 
        id: Date.now(), sender: 'cs', isSystem: true,
        text: 'Hiện tại đã hết giờ làm việc của Tư vấn viên (08:00 - 20:00). Bạn có thể chat với tôi (Chat Box AI) hoặc liên hệ qua Hotline nếu cần hỗ trợ khẩn cấp.'
      }]);
      return;
    }

    setChatMode('WAITING'); 
    // Gửi token để server biết khách là ai (server từ chối kết nối nếu chưa đăng nhập)
    const newSocket = io('http://localhost:4001', { auth: { token } });
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
      setMessages(prev => [...prev, { id: Date.now(), sender: 'cs', text: data.content }]);
    });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    const newMessages = [...messages, { id: Date.now(), sender: 'user', text: userText }];
    setMessages(newMessages);
    setInputValue('');

    if (outOfOffice) setOutOfOffice(false);

    if (chatMode === 'HUMAN' && socket && currentSessionId) {
      socket.emit('send_message', { 
        sessionId: currentSessionId, content: userText 
      });
    } else {
      setIsLoading(true);
      try {
        const history = newMessages.filter((m) => m.id !== 1 && !m.isError && !m.isSystem).slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text,
        }));

        const aiId = Date.now() + 1;
        let started = false;
        await streamConsultReply(history, token, (fullText) => {
          if (!started) {
            started = true;
            setIsLoading(false);
            setMessages((prev) => [...prev, { id: aiId, sender: 'cs', text: fullText }]);
          } else {
            setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: fullText } : m)));
          }
        });
      } catch (error) {
        setMessages((prev) => [...prev, {
          id: Date.now() + 2, sender: 'cs', isError: true,
          text: 'Hệ thống AI đang bận quá tải, vui lòng thử lại sau giây lát!',
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <ClientNavbar />
        
        <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/sang-loc-da" element={<ProtectedRoute><AiTriagePage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/booking" element={<ProtectedRoute><DoctorBookingPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><AppointmentHistoryPage /></ProtectedRoute>} />
            <Route path="/treatments" element={<ProtectedRoute><TreatmentPackagesPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><PharmacyOrdersPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/payment/:id" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
            <Route path="/contact" element={<div className="text-center p-20 text-xl font-bold">Trang Liên hệ Hotline: 1900 xxxx</div>} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/:id" element={<ServiceDetailPage />} />  
            <Route path="/news" element={<NewsPage />} />
            <Route path="/news/:slug" element={<NewsDetailPage />} />
            <Route path="/promotions" element={<PromotionsPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/shops" element={<CustomerShopPage />} />
          </Routes>
        </main>

        {/* FOOTER HIỂN THỊ CỐ ĐỊNH Ở CHÂN TRANG CHO TOÀN BỘ WEBSITE */}
        <ClientFooter />

        {/* NÚT BẤM VÀ KHUNG CHAT AI / CSKH */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
          {isChatOpen && (
            <div className="card w-80 bg-base-100 shadow-2xl border border-base-200 mb-4 overflow-hidden animate-fade-in-up">
              <div className="bg-primary text-white p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="avatar online"><div className="w-8 rounded-full bg-white text-primary flex items-center justify-center font-bold">CS</div></div>
                  <span className="font-bold text-sm">GlowSkin O2O</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:text-gray-200"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-4 h-64 overflow-y-auto bg-base-200 flex flex-col gap-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat ${msg.sender === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className={`chat-bubble text-sm shadow-sm break-words ${msg.sender === 'user' ? 'bg-base-100 text-base-content' : 'chat-bubble-primary text-white'}`}>
                      {msg.text}
                    </div>
                  </div>
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

              {!user ? (
                <div className="p-3 bg-base-100 border-t text-center space-y-2">
                  <p className="text-xs text-base-content/70">Vui lòng đăng nhập để chat với AI hoặc nhân viên CSKH.</p>
                  <Link to="/login?next=/" onClick={() => setIsChatOpen(false)} className="btn btn-primary btn-sm gap-1">
                    <LogIn className="w-4 h-4" /> Đăng nhập
                  </Link>
                </div>
              ) : (
              <div className="p-2 bg-base-100 border-t flex flex-col gap-2">
                {chatMode === 'AI' && !outOfOffice && (
                  <button onClick={handleSwitchToHuman} className="btn btn-xs btn-outline btn-primary self-start">
                    <User className="w-3 h-3 mr-1"/> Gặp bộ phận CSKH
                  </button>
                )}
                {chatMode === 'WAITING' && (
                  <div className="badge badge-warning gap-1 self-start mb-2 text-xs"><Clock className="w-3 h-3"/> Đang chờ CSKH... (Bạn vẫn có thể hỏi AI)</div>
                )}
                
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={chatMode === 'AI' || chatMode === 'WAITING' ? "Hỏi AI..." : "Nhắn CSKH..."}
                    className="input input-bordered input-sm flex-1"
                    disabled={isLoading && chatMode === 'AI'} 
                  />
                  <button className="btn btn-primary btn-sm btn-circle" onClick={handleSendMessage} disabled={isLoading && chatMode === 'AI'}>
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              )}
            </div>
          )}

          <button 
            className={`btn btn-primary btn-circle btn-lg shadow-2xl transition-transform hover:scale-110 ${!isChatOpen ? 'animate-bounce' : ''}`} 
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