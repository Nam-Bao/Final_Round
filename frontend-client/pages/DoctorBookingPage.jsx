import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Video, MapPin, CheckCircle, ScanLine, MessageSquare, AlertCircle, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const SHIFT_SLOTS = {
  MORNING: ['08:00', '09:00', '10:00', '11:00'],
  AFTERNOON: ['13:00', '14:00', '15:00', '16:00'],
  EVENING: ['18:00', '19:00', '20:00']
};

export default function DoctorBookingPage() {
  const [doctors, setDoctors] = useState([]);
  const [patientProfiles, setPatientProfiles] = useState([]); 
  const [selectedProfileId, setSelectedProfileId] = useState(''); 

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slot, setSlot] = useState('');
  const [disabledSlots, setDisabledSlots] = useState([]);

  const [appointmentType, setAppointmentType] = useState('OFFLINE'); 
  const [skinCondition, setSkinCondition] = useState('');
  const [currentProducts, setCurrentProducts] = useState('');
  const [allergies, setAllergies] = useState('');
  
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Lưu lịch sử raw thay vì cờ global
  const [appointmentHistory, setAppointmentHistory] = useState([]);
  const [isOldCustomer, setIsOldCustomer] = useState(false);
  const [fee, setFee] = useState(100000); 
  const [status, setStatus] = useState('IDLE');
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const token = localStorage.getItem('token'); 
        if (!token) return navigate('/login');

        const docRes = await fetch('http://localhost:4000/api/identity/users/doctors', { headers: { 'Authorization': `Bearer ${token}` } });
        if (docRes.ok) setDoctors((await docRes.json()).data || []); 

        const profRes = await fetch('http://localhost:4000/api/identity/profile/patients', { headers: { 'Authorization': `Bearer ${token}` } });
        if (profRes.ok) {
           const profData = await profRes.json();
           setPatientProfiles(profData.data || []);
           if (profData.data && profData.data.length > 0) setSelectedProfileId(profData.data[0].id);
        }

        const histRes = await fetch('http://localhost:4000/api/booking/appointments/my-history', { headers: { 'Authorization': `Bearer ${token}` } });
        const histData = await histRes.json();
        if (histRes.ok && histData.data) {
           setAppointmentHistory(histData.data);
        }
      } catch (error) { console.error('Lỗi khởi tạo:', error); }
    };
    fetchInitialData();
  }, [navigate]);

  // Logic xét phí riêng rẽ theo từng Profile ID
  useEffect(() => {
     if (selectedProfileId) {
         const hasHistory = appointmentHistory.some(apt => apt.patient_profile_id === selectedProfileId);
         setIsOldCustomer(hasHistory);
         setFee(hasHistory ? 0 : 100000);
     }
  }, [selectedProfileId, appointmentHistory]);

  useEffect(() => {
    if (!selectedDoc || !date) return;
    const fetchAvailability = async () => {
      try {
        setSlot(''); 
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const shiftRes = await fetch(`http://localhost:4000/api/booking/shifts/doctor-shifts?doctorId=${selectedDoc.id}&startDate=${date}&endDate=${date}`, { headers });
        const doctorShifts = (await shiftRes.json()).data || [];
        
        const takenRes = await fetch(`http://localhost:4000/api/booking/appointments/taken-slots?doctorId=${selectedDoc.id}&date=${date}`, { headers });
        const takenTimes = (await takenRes.json()).data || []; 

        let slots = [];
        doctorShifts.forEach(shift => {
          if (SHIFT_SLOTS[shift.shift_type]) slots = [...slots, ...SHIFT_SLOTS[shift.shift_type]];
        });

        const now = dayjs();
        const selectedDate = dayjs(date);
        const isToday = selectedDate.isSame(now, 'day');

        let freeSlotsArr = [];
        let disabledSlotsArr = [];

        slots.forEach(time => {
           let isDisabled = false;
           if (takenTimes.includes(`${time}:00`)) isDisabled = true;
           if (isToday && dayjs(`${date} ${time}`, 'YYYY-MM-DD HH:mm').isBefore(now)) isDisabled = true;

           if (isDisabled) disabledSlotsArr.push(time);
           else freeSlotsArr.push(time);
        });

        setAvailableSlots(freeSlotsArr);
        setDisabledSlots(disabledSlotsArr);
      } catch (error) { console.error('Lỗi ca làm việc', error); }
    };
    fetchAvailability();
  }, [selectedDoc, date]);

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadLoading(true);
    const token = localStorage.getItem('token');
    
    try {
      const urls = [];
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('image', files[i]);
        const uploadRes = await fetch('http://localhost:4000/api/media/upload', {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
        });
        const uploadData = await uploadRes.json();
        if (uploadRes.ok) urls.push(uploadData.url);
      }
      setUploadedImages(prev => [...prev, ...urls]);
    } catch (err) { alert('Lỗi tải ảnh!'); } finally { setUploadLoading(false); }
  };

  const handleRemoveImage = (indexToRemove) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveAppointment = async () => {
    if (!selectedProfileId) return alert('Vui lòng chọn Hồ sơ người khám!');
    if (appointmentType === 'ONLINE' && !skinCondition.trim()) return alert('Vui lòng điền tình trạng da!');

    let finalSymptoms = '';
    if (appointmentType === 'ONLINE') {
       finalSymptoms = `[TÌNH TRẠNG DA]: ${skinCondition}\n[SẢN PHẨM ĐANG DÙNG]: ${currentProducts || 'Không rõ'}\n[DỊ ỨNG/THUỐC]: ${allergies || 'Không rõ'}`;
    }

    setStatus('PAYMENT_PROCESSING');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        patient_profile_id: selectedProfileId,
        doctor_id: selectedDoc.id,
        appointment_date: date,
        appointment_time: `${slot}:00`,
        symptoms: finalSymptoms, 
        pre_exam_images: uploadedImages,
        pre_notes: `[Khám ${appointmentType}] ${isOldCustomer ? 'Khách cũ' : 'Khách mới'}`
      };

      const res = await fetch('http://localhost:4000/api/booking/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Không thể tạo lịch hẹn');
      const resData = await res.json(); 
      navigate(`/payment/${resData.data.id}?fee=${fee}&type=${appointmentType}`);
    } catch (error) {
      alert('Đã có lỗi xảy ra khi đặt lịch!');
      setStatus('IDLE');
    }
  };

  const triggerGlobalChat = () => window.dispatchEvent(new CustomEvent('open_cskh_chat'));

  const renderSlotButton = (s, isDisabled = false) => {
    let btnClass = 'btn btn-sm ';
    if (isDisabled) btnClass += 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed opacity-70';
    else if (slot === s) btnClass += 'btn-success text-white border-success';
    else btnClass += 'btn-outline border-gray-300 text-gray-700 hover:bg-gray-100';

    return <button key={s} onClick={() => !isDisabled && setSlot(s)} disabled={isDisabled} className={btnClass}><Clock className="w-3 h-3"/> {s}</button>;
  };

  const allDisplaySlots = [...availableSlots, ...disabledSlots].sort((a, b) => a.localeCompare(b));

  return (
    <div className="max-w-5xl mx-auto space-y-6 relative pb-10">
      <h1 className="text-2xl font-bold">Đặt Lịch Khám & Tư Vấn</h1>
      
      {status === 'APPOINTMENT_CONFIRMED' ? (
        <div className="card bg-base-100 shadow-xl border border-success p-8 text-center space-y-6">
          <h2 className="text-2xl font-bold text-success flex justify-center items-center gap-2"><CheckCircle className="w-8 h-8"/> Đặt Lịch Thành Công!</h2>
          <p>Lịch <b>{appointmentType === 'OFFLINE' ? 'Khám trực tiếp' : 'Tư vấn Online'}</b> với Bác sĩ lúc <b>{slot}</b> ngày <b>{dayjs(date).format('DD/MM/YYYY')}</b> đã được lưu.</p>
          <button onClick={() => navigate('/client-appointments')} className="btn btn-primary mt-4">Xem sổ khám bệnh</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
               <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><User className="w-5 h-5"/> Đặt lịch cho ai?</h2>
               <select className="select select-bordered w-full" value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}>
                 <option disabled value="">-- Chọn hồ sơ khám bệnh --</option>
                 {patientProfiles.map(p => (<option key={p.id} value={p.id}>{p.full_name} ({p.relationship})</option>))}
               </select>
            </div>

            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
               <h2 className="font-bold text-lg mb-4">Hình thức khám</h2>
               <div className="flex gap-4">
                 <button onClick={() => setAppointmentType('OFFLINE')} className={`btn flex-1 gap-2 ${appointmentType === 'OFFLINE' ? 'btn-primary' : 'btn-outline'}`}><MapPin className="w-4 h-4"/> Trực tiếp tại quầy</button>
                 <button onClick={() => setAppointmentType('ONLINE')} className={`btn flex-1 gap-2 ${appointmentType === 'ONLINE' ? 'btn-primary' : 'btn-outline'}`}><Video className="w-4 h-4"/> Tư vấn Online</button>
               </div>
            </div>

            {appointmentType === 'ONLINE' && (
              <div className="card bg-info/5 p-6 shadow-xl border border-info">
                <h3 className="font-bold text-info flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5"/> Khai thác thông tin & Hình ảnh</h3>
                
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border border-base-200">
                     <label className="label text-sm font-medium pb-2 text-blue-900 flex justify-between">
                        <span>Ảnh chụp da mặt (Camera thường)</span>
                        {uploadLoading && <span className="text-xs text-primary animate-pulse">Đang tải ảnh...</span>}
                     </label>
                     <div className="flex items-center gap-3">
                       <label className="btn btn-outline btn-info btn-sm gap-2">
                         <UploadCloud className="w-4 h-4" /> Tải ảnh lên
                         <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadLoading} />
                       </label>
                     </div>
                     {uploadedImages.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-4">
                          {uploadedImages.map((img, i) => (
                             <div key={i} className="relative group">
                               <img src={img} alt="Skin" className="w-16 h-16 rounded-md object-cover border" />
                               <button type="button" onClick={() => handleRemoveImage(i)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow cursor-pointer">✕</button>
                             </div>
                          ))}
                        </div>
                     )}
                  </div>
                  <div>
                     <label className="label text-sm font-medium pb-1 text-blue-900">Mô tả tình trạng da hiện tại? *</label>
                     <textarea className="textarea textarea-bordered w-full h-16" value={skinCondition} onChange={(e) => setSkinCondition(e.target.value)}></textarea>
                  </div>
                  <div>
                     <label className="label text-sm font-medium pb-1 text-blue-900">Sản phẩm đang dùng / Tiền sử dị ứng?</label>
                     <input type="text" className="input input-bordered w-full" value={currentProducts} onChange={(e) => setCurrentProducts(e.target.value)} />
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-info/20 flex flex-col md:flex-row justify-between items-center gap-3">
                  <span className="text-sm font-medium text-blue-800">Cần nhân viên hỗ trợ phân tích và ghi nhận hồ sơ?</span>
                  <button onClick={triggerGlobalChat} className="btn btn-sm btn-info text-white gap-2">
                    <MessageSquare className="w-4 h-4"/> Nhờ CSKH Ghi Nhận
                  </button>
                </div>
              </div>
            )}

            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><User/> Chọn Bác sĩ</h2>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {doctors.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`p-4 rounded-xl border cursor-pointer flex items-center gap-4 ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}>
                    <div className="avatar placeholder"><div className="bg-neutral text-neutral-content rounded-full w-12"><span className="text-xl">{doc.Profile?.full_name?.charAt(0) || 'BS'}</span></div></div>
                    <div><p className="font-bold">{doc.Profile?.full_name || 'Bác sĩ'}</p><p className="text-sm opacity-70">{doc.email}</p></div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Calendar/> Chọn Ngày & Giờ</h2>
              <input type="date" value={date} min={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} className="input input-bordered w-full mb-4" />
              
              {!selectedDoc ? (
                <p className="text-sm text-warning italic">Vui lòng chọn Bác sĩ để xem lịch làm việc.</p>
              ) : allDisplaySlots.length === 0 ? (
                <p className="text-sm text-error italic">Bác sĩ không có lịch làm việc vào ngày này.</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-xs font-medium text-gray-500">
                     <span className="flex items-center gap-1"><div className="w-3 h-3 bg-white border border-gray-300 rounded-sm"></div> Trống</span>
                     <span className="flex items-center gap-1"><div className="w-3 h-3 bg-success rounded-sm"></div> Đang chọn</span>
                     <span className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-200 rounded-sm"></div> Đã đặt / Đã qua</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {allDisplaySlots.map(s => renderSlotButton(s, disabledSlots.includes(s)))}
                  </div>
                </>
              )}
            </div>
          </div>
          
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
            
            <button onClick={handleSaveAppointment} disabled={!selectedProfileId || !selectedDoc || !slot || status === 'PAYMENT_PROCESSING' || uploadLoading} className="btn btn-primary w-full mt-2">
              {status === 'PAYMENT_PROCESSING' ? <span className="loading loading-spinner"></span> : 'Xác nhận Đặt lịch'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}