import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { MessageCircle, X, Send } from 'lucide-react'; 

import ClientNavbar from './components/ClientNavbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AiTriagePage from './pages/AiTriagePage';
import DoctorBookingPage from './pages/DoctorBookingPage';
import AppointmentHistoryPage from './pages/AppointmentHistoryPage';
import TreatmentPackagesPage from './pages/TreatmentPackagesPage';
import PharmacyOrdersPage from './pages/PharmacyOrdersPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" replace />;
}

function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [step, setStep] = useState(0); 
  const chatEndRef = useRef(null);
  
  const [messages, setMessages] = useState([
    { id: 1, sender: 'cs', text: 'Chào bạn! Kỹ thuật viên GlowSkin có thể giúp gì cho bạn hôm nay?' }
  ]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen]);

  // Hàm xử lý chat "thông minh" hơn
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    const userText = inputValue.trim();
    setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: userText }]);
    setInputValue('');

    setTimeout(() => {
      let botReply = '';
      const textLower = userText.toLowerCase();

      // Bắt từ khóa để trả lời theo kịch bản
      if (textLower.includes('có') || textLower.includes('ok') || textLower.includes('đặt')) {
        botReply = 'Tuyệt vời! Bạn hãy nhấn vào mục "Đặt lịch" trên menu để chọn Bác sĩ và thời gian phù hợp nhé.';
      } else if (textLower.includes('không')) {
        botReply = 'Dạ vâng. Nếu cần tư vấn thêm về da, bạn cứ nhắn lại cho GlowSkin nhé. Chúc bạn một ngày vui vẻ!';
      } else if (textLower.includes('giá') || textLower.includes('tiền') || textLower.includes('bao nhiêu')) {
        botReply = 'Dạ chi phí khám chuyên khoa bên mình là 150.000đ ạ. Bạn có muốn đặt lịch khám luôn không?';
      } else if (textLower.includes('trống') || textLower.includes('hôm nay')) {
        botReply = 'Dạ hôm nay phòng khám vẫn còn lịch trống vào buổi chiều ạ. Bạn có cần hỗ trợ đặt lịch luôn không?';
      } else {
        // Trả lời mặc định nếu không khớp từ khóa
        if (step === 0) {
          botReply = 'Dạ vâng, hệ thống đã ghi nhận. Bạn có muốn đặt lịch khám với Bác sĩ Da liễu luôn không ạ?';
          setStep(1);
        } else {
          botReply = 'Cảm ơn bạn! Bạn có thể để lại số điện thoại, nhân viên tư vấn sẽ gọi điện hỗ trợ chi tiết hơn ạ.';
        }
      }

      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        sender: 'cs', 
        text: botReply 
      }]);
    }, 1000);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50 relative">
        <ClientNavbar />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
          <Routes>
            <Route path="/" element={<AiTriagePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/booking" element={<ProtectedRoute><DoctorBookingPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><AppointmentHistoryPage /></ProtectedRoute>} />
            <Route path="/treatments" element={<ProtectedRoute><TreatmentPackagesPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><PharmacyOrdersPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            
            {/* Các trang giả lập */}
            <Route path="/services" element={<div className="text-center p-20 text-xl font-bold opacity-50">Trang Dịch Vụ - Đang cập nhật nội dung</div>} />
            <Route path="/news" element={<div className="text-center p-20 text-xl font-bold opacity-50">Trang Tin Tức - Đang cập nhật nội dung</div>} />
            <Route path="/promotions" element={<div className="text-center p-20 text-xl font-bold opacity-50">Trang Khuyến Mãi - Đang cập nhật nội dung</div>} />
            <Route path="/reviews" element={<div className="text-center p-20 text-xl font-bold opacity-50">Trang Đánh Giá Dịch Vụ - Đang cập nhật nội dung</div>} />
          </Routes>
        </main>

        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
          {isChatOpen && (
            <div className="card w-80 bg-base-100 shadow-2xl border border-base-200 mb-4 overflow-hidden animate-fade-in-up">
              <div className="bg-primary text-white p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="avatar online">
                    <div className="w-8 rounded-full bg-white text-primary flex items-center justify-center font-bold">CS</div>
                  </div>
                  <span className="font-bold text-sm">CSKH GlowSkin O2O</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 h-64 overflow-y-auto bg-base-200 flex flex-col gap-3">
                {messages.map(msg => (
                  <div key={msg.id} className={`chat ${msg.sender === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className={`chat-bubble text-sm shadow-sm ${msg.sender === 'user' ? 'bg-base-100 text-base-content' : 'chat-bubble-primary text-white'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="p-2 bg-base-100 border-t flex gap-2 items-center">
                <input 
                  type="text" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Nhập tin nhắn..." 
                  className="input input-bordered input-sm flex-1" 
                />
                <button className="btn btn-primary btn-sm btn-circle" onClick={handleSendMessage}>
                  <Send className="w-4 h-4" />
                </button>
              </div>
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