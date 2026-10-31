import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Video, MapPin, CheckCircle, ScanLine, MessageSquare, AlertCircle, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '../store/authStore';

const SHIFT_SLOTS = {
  MORNING: ['08:00', '09:00', '10:00', '11:00'],
  AFTERNOON: ['13:00', '14:00', '15:00', '16:00'],
  EVENING: ['18:00', '19:00', '20:00']
};

export default function DoctorBookingPage() {
  const storeToken = useAuthStore((state) => state.token);
  const getToken = () => storeToken || sessionStorage.getItem('token') || '';

  const [doctors, setDoctors] = useState([]);
  const [doctorStats, setDoctorStats] = useState({}); // Điểm đánh giá thật { [doctor_id]: { avg_rating, review_count } }
  const [patientProfiles, setPatientProfiles] = useState([]); 
  const [selectedProfileId, setSelectedProfileId] = useState(''); 

  const [selectedDoc, setSelectedDoc] = useState(null);
  // Ngày theo giờ máy khách (VN). Không dùng toISOString(): đó là ngày UTC, trước 7h sáng sẽ ra ngày hôm qua
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slot, setSlot] = useState('');
  
  // State lưu trữ các giờ đã bị đặt và giờ đã trôi qua
  const [disabledSlots, setDisabledSlots] = useState([]);
  const [appointmentType, setAppointmentType] = useState('OFFLINE'); 
  const [skinCondition, setSkinCondition] = useState('');
  const [currentProducts, setCurrentProducts] = useState('');
  const [allergies, setAllergies] = useState('');
  
  const [uploadedImages, setUploadedImages] = useState([]);

  // Lịch sử khám & Phí
  const [isOldCustomer, setIsOldCustomer] = useState(false);
  const [fee, setFee] = useState(100000); 
  const [status, setStatus] = useState('IDLE');
  
  const navigate = useNavigate();

  // 1. LẤY DANH SÁCH BÁC SĨ, HỒ SƠ KHÁCH HÀNG & LỊCH SỬ KHÁCH HÀNG
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const token = getToken(); 
        const headers = { 'Authorization': `Bearer ${token}` };

        // Lấy danh sách Hồ sơ người khám thật (server tự tạo hồ sơ "Bản thân" từ thông tin tài khoản nếu chưa có)
        let profiles = [];
        try {
          const profileRes = await fetch('http://localhost:4000/api/identity/profile/patients', { headers });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            profiles = profileData.data || [];
          }
        } catch (e) {
          console.warn('Không thể tải hồ sơ người khám', e);
        }

        setPatientProfiles(profiles);
        setSelectedProfileId(profiles[0]?.id || '');

        // Lấy danh sách Bác sĩ
        const docRes = await fetch('http://localhost:4000/api/identity/users/doctors', { headers }).catch(() => null);
        if (docRes && docRes.ok) {
          const docData = await docRes.json();
          setDoctors(docData.data || []); 
        }
        const statsRes = await fetch('http://localhost:4000/api/booking/reviews/doctor-stats').catch(() => null);
        if (statsRes && statsRes.ok) setDoctorStats((await statsRes.json()).data || {});

        // Kiểm tra Khách cũ / Khách mới để áp dụng miễn phí khám
        const histRes = await fetch('http://localhost:4000/api/booking/appointments/my-history', { headers }).catch(() => null);
        if (histRes && histRes.ok) {
          const histData = await histRes.json();
          // Chỉ để hiển thị — số tiền thật do server tính (khách cũ = đã từng hoàn tất 1 buổi khám)
          if ((histData.data || []).some(a => a.status === 'COMPLETED')) {
            setIsOldCustomer(true);
            setFee(0);
          }
        }
      } catch (error) { 
        console.error('Lỗi lấy dữ liệu ban đầu:', error); 
      }
    };

    fetchInitialData();
  }, []);

  // 2. LẤY GIỜ TRỐNG THEO BÁC SĨ VÀ NGÀY
  useEffect(() => {
    if (!selectedDoc || !date) return;

    const fetchAvailability = async () => {
      try {
        setSlot(''); 
        const token = getToken();
        const headers = { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        const shiftRes = await fetch(`http://localhost:4000/api/booking/shifts/doctor-shifts?doctorId=${selectedDoc.id}&startDate=${date}&endDate=${date}`, { headers }).catch(() => null);
        
        let doctorShifts = [];
        if (shiftRes && shiftRes.ok) {
          const shiftData = await shiftRes.json();
          doctorShifts = shiftData.data || [];
        } else {
          // Ca làm việc mặc định nếu chưa cấu hình ca trong Database
          doctorShifts = [
            { shift_type: 'MORNING' },
            { shift_type: 'AFTERNOON' },
            { shift_type: 'EVENING' }
          ];
        }
        
        const takenRes = await fetch(`http://localhost:4000/api/booking/appointments/taken-slots?doctorId=${selectedDoc.id}&date=${date}`, { headers }).catch(() => null);
        let takenTimes = [];
        if (takenRes && takenRes.ok) {
          const takenData = await takenRes.json();
          takenTimes = takenData.data || [];
        }

        let slots = [];
        doctorShifts.forEach(shift => {
          if (SHIFT_SLOTS[shift.shift_type]) {
            slots = [...slots, ...SHIFT_SLOTS[shift.shift_type]];
          }
        });

        const now = dayjs();
        const selectedDate = dayjs(date);
        const isToday = selectedDate.isSame(now, 'day');
        const isPastDay = selectedDate.isBefore(now, 'day'); // gõ tay ngày cũ vẫn bị khóa hết

        let freeSlotsArr = [];
        let disabledSlotsArr = [];

        slots.forEach(time => {
           let isDisabled = false;

           // Khóa nếu đã có người đặt
           if (takenTimes.includes(`${time}:00`)) {
               isDisabled = true;
           }
           
           // Khóa giờ đã qua trong ngày và mọi giờ của ngày đã qua
           if (isPastDay) isDisabled = true;
           if (isToday) {
               const slotTime = dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
               if (slotTime.isBefore(now)) {
                   isDisabled = true;
               }
           }

           if (isDisabled) {
               disabledSlotsArr.push(time);
           } else {
               freeSlotsArr.push(time);
           }
        });

        setAvailableSlots(freeSlotsArr);
        setDisabledSlots(disabledSlotsArr);

      } catch (error) { 
        console.error('Lỗi lấy giờ trống:', error); 
      }
    };

    fetchAvailability();
  }, [selectedDoc, date]);

  // 3. XỬ LÝ LƯU LỊCH HẸN
  const handleSaveAppointment = async () => {
    if (!selectedProfileId) return alert('Vui lòng chọn Hồ sơ người khám!');
    if (!selectedDoc) return alert('Vui lòng chọn Bác sĩ!');
    if (!slot) return alert('Vui lòng chọn Giờ khám!');
    if (!dayjs(`${date} ${slot}`).isAfter(dayjs())) return alert('Giờ khám đã qua, vui lòng chọn ngày giờ khác!');
    if (appointmentType === 'ONLINE' && !skinCondition.trim()) return alert('Vui lòng điền tình trạng da hiện tại!');

    let finalSymptoms = '';
    if (appointmentType === 'ONLINE') {
      finalSymptoms = `[TÌNH TRẠNG DA]: ${skinCondition}\n[SẢN PHẨM ĐANG DÙNG]: ${currentProducts || 'Không rõ'}\n[DỊ ỨNG/THUỐC]: ${allergies || 'Không rõ'}`;
    }

    setStatus('PAYMENT_PROCESSING');
    try {
      const token = getToken();
      const payload = {
        patient_profile_id: selectedProfileId,
        doctor_id: selectedDoc.id,
        appointment_date: date,
        appointment_time: `${slot}:00`,
        symptoms: finalSymptoms, 
        pre_exam_images: uploadedImages,
        pre_notes: `[ONLINE] ${isOldCustomer ? 'Khách cũ' : 'Khách mới'}`
      };

      if (appointmentType === 'OFFLINE') {
        payload.pre_notes = `[OFFLINE] ${isOldCustomer ? 'Khách cũ' : 'Khách mới'}`;
      }

      const res = await fetch('http://localhost:4000/api/booking/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Không thể tạo lịch hẹn');
      }

      const resData = await res.json(); 
      navigate(`/payment/${resData.data.id}`);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Đã có lỗi xảy ra khi đặt lịch!');
      setStatus('IDLE');
    }
  };

  const triggerGlobalChat = () => {
     const event = new CustomEvent('open_cskh_chat');
     window.dispatchEvent(event);
  };

  const renderSlotButton = (s, isDisabled = false) => {
    let btnClass = 'btn btn-sm ';
    
    if (isDisabled) {
        btnClass += 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed opacity-70';
    } else if (slot === s) {
        btnClass += 'btn-success text-white border-success';
    } else {
        btnClass += 'btn-outline border-gray-300 text-gray-700 hover:bg-gray-100';
    }

    return (
        <button 
            key={s} 
            onClick={() => !isDisabled && setSlot(s)} 
            disabled={isDisabled}
            className={btnClass}
            title={isDisabled ? "Giờ này đã được đặt hoặc đã trôi qua" : "Bấm để chọn giờ này"}
        >
          <Clock className="w-3 h-3"/> {s}
        </button>
    );
  };

  const allDisplaySlots = [...availableSlots, ...disabledSlots].sort((a, b) => a.localeCompare(b));

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative pb-10">
      <h1 className="text-2xl font-bold text-slate-800">Đặt Lịch Khám & Tư Vấn</h1>
      
      {status === 'APPOINTMENT_CONFIRMED' ? (
        <div className="card bg-base-100 shadow-xl border border-success p-8 text-center space-y-6">
          <h2 className="text-2xl font-bold text-success flex justify-center items-center gap-2">
            <CheckCircle className="w-8 h-8"/> Đặt Lịch Thành Công!
          </h2>
          <p>Lịch <b>{appointmentType === 'OFFLINE' ? 'Khám trực tiếp' : 'Tư vấn Online'}</b> với Bác sĩ lúc <b>{slot}</b> ngày <b>{dayjs(date).format('DD/MM/YYYY')}</b> đã được lưu vào hệ thống.</p>
          
          {appointmentType === 'OFFLINE' ? (
             <div className="bg-base-200 p-6 rounded-xl inline-block mx-auto border-2 border-dashed border-base-300">
               <p className="text-sm font-bold mb-3 uppercase">Mã QR Check-in tại phòng khám</p>
               <ScanLine className="w-24 h-24 mx-auto text-primary"/>
               <p className="text-xs mt-3 opacity-60">Vui lòng đưa mã này cho Lễ tân khi đến phòng khám.</p>
             </div>
          ) : (
            <div className="bg-info/10 p-6 rounded-xl border border-info mx-auto max-w-sm">
               <Video className="w-10 h-10 text-info mx-auto mb-2"/>
               <p className="font-bold text-info">Vào mục "Sổ Lịch Khám & Y Bạ" bấm nút "Gặp bác sĩ" khi đến giờ hẹn.</p>
            </div>
          )}

          <button onClick={() => navigate('/appointments')} className="btn btn-primary mt-4">Xem sổ khám bệnh</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            {/* 1. CHỌN HỒ SƠ KHÁM BỆNH */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
               <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><User className="w-5 h-5"/> Đặt lịch cho ai?</h2>
               {patientProfiles.length === 0 ? (
                 <div className="alert alert-warning text-sm">
                   <span>
                     Bạn chưa có hồ sơ người khám. Vui lòng cập nhật họ tên trong{' '}
                     <button type="button" className="link link-primary font-semibold" onClick={() => navigate('/profile')}>Hồ sơ cá nhân</button>
                     {' '}hoặc thêm hồ sơ người thân trước khi đặt lịch.
                   </span>
                 </div>
               ) : (
                 <select className="select select-bordered w-full" value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}>
                   {patientProfiles.map(p => (<option key={p.id} value={p.id}>{p.full_name} ({p.relationship})</option>))}
                 </select>
               )}
            </div>

            {/* 2. HÌNH THỨC KHÁM */}
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

            {/* FORM KHAI THÁC THÔNG TIN (ONLINE) */}
            {appointmentType === 'ONLINE' && (
              <div className="card bg-info/5 p-6 shadow-xl border border-info space-y-4">
                <div className="flex items-center justify-between border-b border-info/20 pb-3">
                  <h3 className="font-bold text-info flex items-center gap-2">
                    <AlertCircle className="w-5 h-5"/> Khai thác thông tin sơ bộ
                  </h3>
                </div>

                <p className="text-sm opacity-80">Dữ liệu này sẽ được chuyển thẳng cho Bác sĩ. Bạn cũng có thể nhờ CSKH hỗ trợ trực tiếp nếu cần.</p>
                
                <div className="space-y-4">
                  <div>
                     <label className="label text-sm font-medium pb-1 text-blue-900">Tình trạng da hiện tại của bạn? *</label>
                     <textarea 
                        className="textarea textarea-bordered w-full h-16" 
                        placeholder="Ví dụ: Da đỏ, có mụn viêm sưng, nhiều dầu nhờn..." 
                        value={skinCondition} 
                        onChange={(e) => setSkinCondition(e.target.value)}
                     ></textarea>
                  </div>
                  <div>
                     <label className="label text-sm font-medium pb-1 text-blue-900">Các sản phẩm bạn đang dùng (nếu có)?</label>
                     <input 
                        type="text" 
                        className="input input-bordered w-full" 
                        placeholder="Ví dụ: Sữa rửa mặt Cerave, Nước tẩy trang Bioderma..."
                        value={currentProducts}
                        onChange={(e) => setCurrentProducts(e.target.value)}
                     />
                  </div>
                  <div>
                     <label className="label text-sm font-medium pb-1 text-blue-900">Bạn có đang bị dị ứng hay dùng thuốc gì không?</label>
                     <input 
                        type="text" 
                        className="input input-bordered w-full" 
                        placeholder="Không có / Có dùng thuốc..."
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                     />
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-info/20 flex flex-col md:flex-row justify-between items-center gap-3">
                  <span className="text-sm font-medium text-blue-800">
                    Cần nhân viên hỗ trợ phân tích và ghi nhận hồ sơ?
                  </span>
                  <button onClick={triggerGlobalChat} className="btn btn-sm btn-info text-white gap-2">
                    <MessageSquare className="w-4 h-4"/> Nhờ CSKH Ghi Nhận
                  </button>
                </div>
              </div>
            )}

            {/* 3. CHỌN BÁC SĨ */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
                <User/> Chọn Bác sĩ
              </h2>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {doctors.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`p-4 rounded-xl border cursor-pointer flex items-center gap-4 ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}>
                    <div className="avatar placeholder">
                      <div className="bg-neutral text-neutral-content rounded-full w-12">
                        <span className="text-xl">{doc.Profile?.full_name?.charAt(0) || 'BS'}</span>
                      </div>
                    </div>
                    <div>
                      <p className="font-bold">{doc.Profile?.full_name || 'Bác sĩ Da Liễu'}</p>
                      <p className="text-sm opacity-70 flex items-center gap-1">
                        {doctorStats[doc.id] ? (
                          <><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> {doctorStats[doc.id].avg_rating} · {doctorStats[doc.id].review_count} đánh giá</>
                        ) : 'Chưa có đánh giá'}
                      </p>
                    </div>
                  </div>
                ))}
                {doctors.length === 0 && <p className="text-gray-400 italic">Đang tải danh sách bác sĩ...</p>}
              </div>
            </div>
            
            {/* 4. CHỌN NGÀY & GIỜ */}
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
                <Calendar/> Chọn Ngày & Giờ
              </h2>
              <input 
                type="date" 
                value={date} 
                min={today} 
                onChange={e => setDate(e.target.value)} 
                className="input input-bordered w-full mb-4" 
              />
              
              {!selectedDoc ? (
                <p className="text-sm text-warning italic">Vui lòng chọn Bác sĩ để xem lịch làm việc.</p>
              ) : allDisplaySlots.length === 0 ? (
                <p className="text-sm text-error italic">Bác sĩ không có lịch làm việc vào ngày này.</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-xs font-medium text-gray-500">
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm"></div> Trống
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-success rounded-sm"></div> Đang chọn
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-gray-200 rounded-sm"></div> Đã đặt / Đã qua
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {allDisplaySlots.map(s => renderSlotButton(s, disabledSlots.includes(s)))}
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* TÓM TẮT LỊCH HẸN */}
          <div className="card bg-base-100 p-6 shadow-xl border border-primary/20 h-fit space-y-4 sticky top-24">
            <h2 className="font-bold border-b pb-2">Tóm tắt lịch hẹn</h2>
            <div className="text-sm space-y-2 opacity-80">
              <p>Loại: <b>{appointmentType === 'OFFLINE' ? 'Trực tiếp' : 'Online'}</b></p>
              <p>Hồ sơ: <b>{patientProfiles.find(p => p.id === selectedProfileId)?.full_name || ''}</b></p>
              <p>Bác sĩ: <b>{selectedDoc?.Profile?.full_name || 'Chưa chọn'}</b></p>
              <p>Ngày: <b>{dayjs(date).format('DD/MM/YYYY')}</b></p>
              <p>Giờ: <b>{slot || 'Chưa chọn'}</b></p>
            </div>
            
            <div className="bg-base-200 p-3 rounded-lg space-y-1">
              <div className="flex justify-between text-sm"><span>Phí thăm khám:</span><span className={isOldCustomer ? 'line-through opacity-50' : ''}>100.000 đ</span></div>
              {isOldCustomer && <div className="flex justify-between text-sm text-success font-medium"><span>Ưu đãi khách cũ:</span><span>-100.000 đ</span></div>}
            </div>
            <div className="flex justify-between font-bold text-xl text-primary pt-2 border-t"><span>Tổng:</span><span>{fee.toLocaleString()} đ</span></div>
            
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
    </div>
  );
}