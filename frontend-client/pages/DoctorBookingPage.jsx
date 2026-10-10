import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Video, MapPin, CheckCircle, ScanLine, MessageSquare, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SHIFT_SLOTS = {
  MORNING: ['08:00', '09:00', '10:00', '11:00'],
  AFTERNOON: ['13:00', '14:00', '15:00', '16:00'],
  EVENING: ['18:00', '19:00', '20:00']
};

export default function DoctorBookingPage() {
  const [doctors, setDoctors] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slot, setSlot] = useState('');
  
  const [appointmentType, setAppointmentType] = useState('OFFLINE'); 
  const [symptoms, setSymptoms] = useState('');
  const [isOldCustomer, setIsOldCustomer] = useState(false);
  const [fee, setFee] = useState(100000); // Mặc định khách mới 100k
  
  const [status, setStatus] = useState('IDLE');
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const navigate = useNavigate();

  // 1. LẤY DỮ LIỆU BAN ĐẦU (Danh sách bác sĩ & Lịch sử khách hàng)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const token = localStorage.getItem('token'); // Lấy từ authStore
        
        // A. Lấy danh sách Bác sĩ từ service-identity
        const docRes = await fetch('http://localhost:4000/api/identity/users/doctors', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const docData = await docRes.json();
        
        if (docRes.ok) {
          // Gán thẳng vào State vì Backend đã lọc sẵn toàn bộ Bác sĩ rồi
          setDoctors(docData.data || []); 
        }

        // B. Kiểm tra khách cũ hay mới (Giả lập gọi API lấy lịch sử)
        // Nếu API trả về mảng appointments.length > 0 => Khách cũ => Fee = 0
        const histRes = await fetch('http://localhost:4000/api/booking/appointments/my-history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const histData = await histRes.json();
        if (histRes.ok && histData.data && histData.data.length > 0) {
          setIsOldCustomer(true);
          setFee(0);
        }
      } catch (error) {
        console.error('Lỗi lấy dữ liệu ban đầu', error);
      }
    };
    fetchInitialData();
  }, []);

  // 2. KIỂM TRA LỊCH TRỐNG KHI ĐỔI BÁC SĨ HOẶC ĐỔI NGÀY
  useEffect(() => {
    if (!selectedDoc || !date) return;
    
    const fetchAvailability = async () => {
      try {
        setSlot(''); // Reset giờ đã chọn
        
        // Lấy token từ localStorage
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // A. Lấy ca làm việc của Bác sĩ (ĐÃ BỔ SUNG HEADERS CHỨA TOKEN)
        const shiftRes = await fetch(`http://localhost:4000/api/booking/shifts/doctor-shifts?doctorId=${selectedDoc.id}&startDate=${date}&endDate=${date}`, {
          headers: headers
        });
        
        if (!shiftRes.ok) throw new Error('Lỗi truy cập API ca làm việc');

        const shiftData = await shiftRes.json();
        // Không cần filter theo ID hay status nữa vì Backend đã lọc sạch sẽ và an toàn
        const doctorShifts = shiftData.data || [];
        
        // B. Lấy các giờ đã bị đặt (ĐÃ BỔ SUNG HEADERS CHỨA TOKEN)
        const takenRes = await fetch(`http://localhost:4000/api/booking/appointments/taken-slots?doctorId=${selectedDoc.id}&date=${date}`, {
          headers: headers
        });
        const takenData = await takenRes.json();
        const takenTimes = takenData.data || []; 

        // C. Tính toán các khung giờ còn trống
        let slots = [];
        doctorShifts.forEach(shift => {
          if (SHIFT_SLOTS[shift.shift_type]) {
            slots = [...slots, ...SHIFT_SLOTS[shift.shift_type]];
          }
        });

        const freeSlots = slots.filter(time => !takenTimes.includes(`${time}:00`));
        setAvailableSlots(freeSlots);
        
      } catch (error) {
        console.error('Lỗi lấy giờ trống', error);
      }
    };
    
    fetchAvailability();
  }, [selectedDoc, date]);

  // 3. XỬ LÝ ĐẶT LỊCH
  const handleSaveAppointment = async () => {
    // Validate Khám Online bắt buộc có hồ sơ
    if (appointmentType === 'ONLINE' && !symptoms.trim()) {
      alert('Vui lòng điền tình trạng da hoặc nhờ CSKH hỗ trợ điền hồ sơ!');
      return;
    }

    setStatus('PAYMENT_PROCESSING');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        doctor_id: selectedDoc.id,
        appointment_date: date,
        appointment_time: `${slot}:00`,
        symptoms: symptoms,
        pre_notes: `[Khám ${appointmentType}] ${isOldCustomer ? 'Khách cũ (Miễn phí)' : 'Khách mới (100k)'}`
      };

      const res = await fetch('http://localhost:4000/api/booking/appointments', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Không thể tạo lịch hẹn');
      
      setStatus('APPOINTMENT_CONFIRMED');
    } catch (error) {
      console.error(error);
      alert('Đã có lỗi xảy ra khi đặt lịch!');
      setStatus('IDLE');
    }
  };

  // Giả lập CSKH điền hộ hồ sơ
  const handleCskhSimulate = () => {
    setSymptoms('Khách hàng báo da đổ nhiều dầu vùng chữ T, có mụn viêm sưng đỏ. (Đã được CSKH khai thác)');
    setIsChatOpen(false);
    alert('CSKH đã cập nhật hồ sơ thành công! Bạn có thể đặt lịch.');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative">
      <h1 className="text-2xl font-bold">Đặt Lịch Khám & Tư Vấn</h1>
      
      {status === 'APPOINTMENT_CONFIRMED' ? (
        <div className="card bg-base-100 shadow-xl border border-success p-8 text-center space-y-6">
          <h2 className="text-2xl font-bold text-success flex justify-center items-center gap-2">
            <CheckCircle className="w-8 h-8"/> Đặt Lịch Thành Công!
          </h2>
          <p>Lịch <b>{appointmentType === 'OFFLINE' ? 'Khám trực tiếp' : 'Tư vấn Online'}</b> với Bác sĩ lúc <b>{slot}</b> ngày <b>{date}</b> đã được lưu vào hệ thống.</p>
          
          {appointmentType === 'OFFLINE' ? (
             <div className="bg-base-200 p-6 rounded-xl inline-block mx-auto border-2 border-dashed border-base-300">
               <p className="text-sm font-bold mb-3 uppercase">Mã QR Check-in tại phòng khám</p>
               <ScanLine className="w-24 h-24 mx-auto text-primary"/>
               <p className="text-xs mt-3 opacity-60">Vui lòng đưa mã này cho Lễ tân khi đến phòng khám.</p>
             </div>
          ) : (
            <div className="bg-info/10 p-6 rounded-xl border border-info mx-auto max-w-sm">
               <Video className="w-10 h-10 text-info mx-auto mb-2"/>
               <p className="font-bold text-info">Link phòng Khám Video sẽ hiển thị trong sổ khám bệnh trước 10 phút.</p>
            </div>
          )}

          <button onClick={() => navigate('/appointments')} className="btn btn-primary mt-4">Xem sổ khám bệnh</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            {/* HÌNH THỨC KHÁM */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
               <h2 className="font-bold text-lg mb-4">Hình thức khám</h2>
               <div className="flex gap-4">
                 <button onClick={() => setAppointmentType('OFFLINE')} className={`btn flex-1 gap-2 ${appointmentType === 'OFFLINE' ? 'btn-primary' : 'btn-outline'}`}>
                   <MapPin className="w-4 h-4"/> Khám trực tiếp
                 </button>
                 <button onClick={() => setAppointmentType('ONLINE')} className={`btn flex-1 gap-2 ${appointmentType === 'ONLINE' ? 'btn-primary' : 'btn-outline'}`}>
                   <Video className="w-4 h-4"/> Tư vấn Online
                 </button>
               </div>
            </div>

            {/* BẮT BUỘC ĐIỀN HỒ SƠ NẾU ONLINE */}
            {appointmentType === 'ONLINE' && (
              <div className="card bg-info/5 p-6 shadow-xl border border-info">
                <h3 className="font-bold text-info flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5"/> Hồ sơ y tế (Bắt buộc cho Tư vấn Online)
                </h3>
                <p className="text-sm opacity-80 mb-4">Để bác sĩ có thể chuẩn bị phác đồ chuẩn xác qua video, vui lòng mô tả tình trạng da hiện tại của bạn.</p>
                <textarea 
                  className="textarea textarea-bordered w-full h-24" 
                  placeholder="Ví dụ: Da tôi dạo này nổi nhiều mụn sưng đỏ ở cằm..." 
                  value={symptoms} 
                  onChange={(e) => setSymptoms(e.target.value)}
                ></textarea>
                
                <div className="mt-4 p-4 bg-white rounded-lg flex justify-between items-center shadow-sm">
                  <span className="text-sm font-medium text-gray-600">Bạn gặp khó khăn khi diễn tả tình trạng?</span>
                  <button onClick={() => setIsChatOpen(true)} className="btn btn-sm btn-info text-white gap-2">
                    <MessageSquare className="w-4 h-4"/> Chat nhờ CSKH hỗ trợ
                  </button>
                </div>
              </div>
            )}

            {/* CHỌN BÁC SĨ */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><User/> Chọn Bác sĩ</h2>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {doctors.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`p-4 rounded-xl border cursor-pointer flex items-center gap-4 ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}>
                    <div className="avatar placeholder">
                      <div className="bg-neutral text-neutral-content rounded-full w-12">
                        <span className="text-xl">{doc.Profile?.full_name?.charAt(0) || 'BS'}</span>
                      </div>
                    </div>
                    <div>
                      <p className="font-bold">{doc.Profile?.full_name || 'Bác sĩ'}</p>
                      <p className="text-sm opacity-70">{doc.email}</p>
                    </div>
                  </div>
                ))}
                {doctors.length === 0 && <p className="text-gray-400 italic">Đang tải danh sách bác sĩ...</p>}
              </div>
            </div>
            
            {/* CHỌN NGÀY VÀ GIỜ (Logic Giờ trống) */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Calendar/> Chọn Ngày & Giờ trống</h2>
              <input type="date" value={date} min={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} className="input input-bordered w-full mb-4" />
              
              {!selectedDoc ? (
                <p className="text-sm text-warning italic">Vui lòng chọn Bác sĩ để xem giờ trống.</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-error italic">Bác sĩ không có lịch làm việc hoặc đã kín lịch vào ngày này.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(s => (
                    <button key={s} onClick={() => setSlot(s)} className={`btn btn-sm ${slot === s ? 'btn-primary' : 'btn-outline'}`}>
                      <Clock className="w-3 h-3"/> {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* CỘT TÓM TẮT & THANH TOÁN */}
          <div className="card bg-base-100 p-6 shadow-xl border border-primary/20 h-fit space-y-4 sticky top-24">
            <h2 className="font-bold border-b pb-2">Tóm tắt lịch hẹn</h2>
            <div className="text-sm space-y-2 opacity-80">
              <p>Loại: <b>{appointmentType === 'OFFLINE' ? 'Trực tiếp' : 'Online'}</b></p>
              <p>Bác sĩ: <b>{selectedDoc?.Profile?.full_name || 'Chưa chọn'}</b></p>
              <p>Ngày: <b>{date}</b></p>
              <p>Giờ: <b>{slot || 'Chưa chọn'}</b></p>
            </div>
            
            <div className="bg-base-200 p-3 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span>Phí thăm khám:</span>
                <span className={isOldCustomer ? 'line-through opacity-50' : ''}>100.000 đ</span>
              </div>
              {isOldCustomer && (
                <div className="flex justify-between text-sm text-success font-medium">
                  <span>Ưu đãi khách cũ:</span>
                  <span>-100.000 đ</span>
                </div>
              )}
            </div>

            <div className="flex justify-between font-bold text-xl text-primary pt-2 border-t">
              <span>Tổng:</span><span>{fee.toLocaleString()} đ</span>
            </div>
            
            <button 
              onClick={handleSaveAppointment} 
              disabled={!selectedDoc || !slot || status === 'PAYMENT_PROCESSING'} 
              className="btn btn-primary w-full mt-2"
            >
              {status === 'PAYMENT_PROCESSING' ? <span className="loading loading-spinner"></span> : 'Xác nhận Đặt lịch'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL CHAT CSKH */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-2xl w-[400px] shadow-2xl">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-info"><MessageSquare/> Trợ lý CSKH O2O</h3>
            <div className="h-48 bg-base-200 rounded-lg p-4 mb-4 flex flex-col gap-2 overflow-y-auto text-sm">
              <div className="bg-white p-2 rounded-lg max-w-[80%] border">Xin chào! Em có thể giúp gì cho tình trạng da của chị ạ?</div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleCskhSimulate} className="btn btn-primary w-full gap-2">
                <CheckCircle className="w-4 h-4"/> Mô phỏng: CSKH đã cập nhật hồ sơ
              </button>
              <button onClick={() => setIsChatOpen(false)} className="btn btn-ghost w-full">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}