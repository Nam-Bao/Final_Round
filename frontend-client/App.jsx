import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { MessageCircle, X, Send } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

import ClientNavbar from './components/ClientNavbar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AiTriagePage from './pages/AiTriagePage';
import DoctorBookingPage from './pages/DoctorBookingPage';
import AppointmentHistoryPage from './pages/AppointmentHistoryPage';
import TreatmentPackagesPage from './pages/TreatmentPackagesPage';
import PharmacyOrdersPage from './pages/PharmacyOrdersPage';
import ProfilePage from './pages/ProfilePage';
// ----------------------------------------

// ====== CẤU HÌNH AI ======
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Model chính + model dự phòng (đổi trong file .env nếu muốn)
const MODEL_NAMES = [
  import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  import.meta.env.VITE_GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite',
].filter((name, index, arr) => name && arr.indexOf(name) === index);

const SYSTEM_PROMPT = `Bạn là nhân viên tư vấn nhiệt tình của phòng khám da liễu GlowSkin O2O.

THÔNG TIN PHÒNG KHÁM (chỉ dùng đúng thông tin này, tuyệt đối không tự bịa thêm giá hay dịch vụ):
- Hình thức khám: Khám trực tiếp tại phòng khám, hoặc Tư vấn Online.
- Bác sĩ và giá khám:
  + BS. CKI Nguyễn Văn An: chuyên khoa Trị mụn, 300.000đ
  + ThS. BS Trần Thị Mai: chuyên khoa Trị nám & tàn nhang, 350.000đ
  + BS. Lê Văn Cường: chuyên khoa Phục hồi da, 250.000đ
- Website có các mục: Sàng lọc AI (phân tích da qua ảnh), Đặt lịch, Dịch vụ, Tin tức, Khuyến mãi, Đánh giá dịch vụ, Hồ sơ của tôi.

QUY TẮC TRẢ LỜI:
- Trả lời bằng tiếng Việt, thân thiện, khoảng 5-6 câu, rõ ý và đầy đủ. Chỉ liệt kê bác sĩ khi khách hỏi về giá hoặc bác sĩ.
- Gợi ý bác sĩ phù hợp với vấn đề của khách (mụn, nám/tàn nhang, phục hồi da) và mời khách vào mục "Đặt lịch" để đặt hẹn.
- Nếu khách hỏi thứ không có trong thông tin trên (giá tư vấn online, giá liệu trình, khuyến mãi...), hãy nói chưa có thông tin chính xác và khuyên khách xem mục "Dịch vụ" hoặc "Khuyến mãi" trên website.
- Không chẩn đoán bệnh; với vấn đề nghiêm trọng, khuyên khách đặt lịch khám với bác sĩ.`;

const genAI = new GoogleGenerativeAI(API_KEY || '');

const getModel = (name) =>
  genAI.getGenerativeModel({
    model: name,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gọi AI dạng streaming. Nếu bị quá tải (503/429) thì tự thử lại,
// hết lượt thử thì chuyển sang model dự phòng.
async function startStream(contents) {
  let lastError;
  for (const name of MODEL_NAMES) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await getModel(name).generateContentStream({ contents });
      } catch (err) {
        lastError = err;
        const canRetry =
          err.status === 503 ||
          err.status === 429 ||
          /overload|high demand|unavailable/i.test(err.message || '');
        if (!canRetry) throw err; // lỗi khác (sai key, sai tên model...) thì báo luôn
        await sleep(1000 * (attempt + 1)); // chờ 1s, 2s, 3s rồi thử lại
      }
    }
  }
  throw lastError;
}
// =========================

function ProtectedRoute({ children }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" replace />;
}

function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [messages, setMessages] = useState([
    { id: 1, sender: 'cs', text: 'Chào bạn! Kỹ thuật viên GlowSkin có thể giúp gì cho bạn hôm nay?' }
  ]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatOpen, isLoading]);

  // Hàm xử lý chat sử dụng AI Gemini (hiện chữ dần dần)
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();

    // 1. Hiển thị tin nhắn của người dùng ngay lập tức
    const newMessages = [...messages, { id: Date.now(), sender: 'user', text: userText }];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      if (!API_KEY) {
        throw new Error('Chưa có VITE_GEMINI_API_KEY trong file .env');
      }

      // 2. Gửi 6 tin gần nhất để AI nhớ ngữ cảnh nhưng vẫn nhanh
      //    (bỏ lời chào mặc định id=1 và các tin báo lỗi)
      const contents = newMessages
        .filter((m) => m.id !== 1 && !m.isError)
        .slice(-6)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));

      // 3. Gọi AI (có tự thử lại + model dự phòng)
      const result = await startStream(contents);

      const aiId = Date.now() + 1;
      let fullText = '';
      let started = false;

      // 4. Nhận chữ về tới đâu hiện tới đó
      for await (const chunk of result.stream) {
        fullText += chunk.text();

        if (!started) {
          started = true;
          setIsLoading(false);
          setMessages((prev) => [...prev, { id: aiId, sender: 'cs', text: fullText }]);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text: fullText } : m))
          );
        }
      }
    } catch (error) {
      console.error('Lỗi kết nối AI:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          sender: 'cs',
          isError: true,
          // Khi dev: hiện lỗi thật để dễ sửa. Khi build: hiện câu xin lỗi thân thiện.
          text: import.meta.env.DEV
            ? `[Lỗi AI] ${error.message}`
            : 'Dạ hệ thống đang hơi bận, bạn đợi một lát rồi nhắn lại giúp GlowSkin nhé!',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
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
                {messages.map((msg) => (
                  <div key={msg.id} className={`chat ${msg.sender === 'user' ? 'chat-end' : 'chat-start'}`}>
                    <div className={`chat-bubble text-sm shadow-sm break-words ${msg.sender === 'user' ? 'bg-base-100 text-base-content' : 'chat-bubble-primary text-white'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Hiển thị trạng thái AI đang gõ */}
                {isLoading && (
                  <div className="chat chat-start">
                    <div className="chat-bubble chat-bubble-primary text-white text-sm opacity-70 flex items-center gap-2">
                      <span className="loading loading-dots loading-sm"></span>
                    </div>
                  </div>
                )}
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
                  disabled={isLoading}
                />
                <button
                  className="btn btn-primary btn-sm btn-circle"
                  onClick={handleSendMessage}
                  disabled={isLoading}
                >
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