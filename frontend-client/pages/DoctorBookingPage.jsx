import React, { useState } from 'react';
import { Calendar, Clock, CreditCard, User, QrCode, Video, MapPin, Wallet, CheckCircle, ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DOCTORS = [
  { id: 1, name: 'BS. CKI Nguyễn Văn An', spec: 'Trị Mụn', fee: 300000 },
  { id: 2, name: 'ThS. BS Trần Thị Mai', spec: 'Trị Nám & Tàn nhang', fee: 350000 },
  { id: 3, name: 'BS. Lê Văn Cường', spec: 'Phục hồi da', fee: 250000 }
];
const SLOTS = ['08:30', '09:30', '14:00', '15:00'];
const CATEGORIES = ['Tất cả', 'Trị Mụn', 'Trị Nám & Tàn nhang', 'Phục hồi da'];

export default function DoctorBookingPage() {
  const [filterSpec, setFilterSpec] = useState('Tất cả');
  const [selectedDoc, setSelectedDoc] = useState(DOCTORS[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slot, setSlot] = useState(SLOTS[0]);
  
  const [appointmentType, setAppointmentType] = useState('OFFLINE'); 
  const [status, setStatus] = useState('IDLE');
  const [payMethod, setPayMethod] = useState('momo'); // State lưu hình thức thanh toán
  
  const navigate = useNavigate();
  const filteredDoctors = filterSpec === 'Tất cả' ? DOCTORS : DOCTORS.filter(d => d.spec === filterSpec);

  // Xử lý khi khách bấm nút "Tiếp tục" ở phần chọn thanh toán
  const handleProceedPayment = () => {
    if (payMethod === 'offline') {
      handleSaveAppointment(); // Nếu tiền mặt, lưu luôn
    } else {
      setStatus('SHOW_PAYMENT_QR'); // Nếu online, hiển thị QR
    }
  };

  // Logic lưu lịch hẹn vào bộ nhớ
  const handleSaveAppointment = () => {
    setStatus('PAYMENT_PROCESSING');
    setTimeout(() => {
      const newAppointment = {
        id: `APT-${Date.now().toString().slice(-4)}`,
        doctorName: selectedDoc.name,
        spec: selectedDoc.spec,
        date: date,
        slot: slot,
        type: appointmentType,
        fee: selectedDoc.fee,
        status: 'UPCOMING'
      };

      const existingApts = JSON.parse(localStorage.getItem('mockAppointments')) || [];
      localStorage.setItem('mockAppointments', JSON.stringify([newAppointment, ...existingApts]));

      setStatus('APPOINTMENT_CONFIRMED');
    }, 1000);
  };

  // Hàm sinh URL ảnh QR Code động theo số tiền và hình thức (Dùng API giả lập)
  const getQrImageUrl = () => {
    const dataString = `PAY_${payMethod.toUpperCase()}_AMOUNT_${selectedDoc.fee}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${dataString}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Đặt Lịch Khám & Tư Vấn</h1>
      
      {status === 'APPOINTMENT_CONFIRMED' ? (
        <div className="card bg-base-100 shadow-xl border border-success p-8 text-center space-y-6 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-success flex justify-center items-center gap-2">
            <QrCode className="w-8 h-8"/> Đặt Lịch Thành Công!
          </h2>
          <p>Lịch <b>{appointmentType === 'OFFLINE' ? 'Khám trực tiếp' : 'Tư vấn Online'}</b> với <b>{selectedDoc.name}</b> lúc <b>{slot}</b> ngày <b>{date}</b> đã được chốt.</p>
          
          {appointmentType === 'OFFLINE' ? (
             <div className="bg-base-200 p-6 rounded-xl inline-block mx-auto border-2 border-dashed border-base-300">
               <p className="text-sm font-bold mb-3 uppercase">Mã QR Check-in tại phòng khám</p>
               <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=APT-${Date.now()}`} alt="QR Checkin" className="mx-auto rounded-lg shadow-sm" />
               <p className="text-xs mt-3 opacity-60">Vui lòng đưa mã này cho Lễ tân khi đến phòng khám.</p>
             </div>
          ) : (
            <div className="bg-info/10 p-6 rounded-xl border border-info mx-auto max-w-sm">
               <Video className="w-10 h-10 text-info mx-auto mb-2"/>
               <p className="font-bold text-info">Link phòng Khám Video sẽ được mở trước 10 phút.</p>
            </div>
          )}

          <div>
            <button onClick={() => navigate('/appointments')} className="btn btn-primary mt-4">Xem sổ khám bệnh</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
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

            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2"><User/> 1. Chọn Bác sĩ</h2>
                <select className="select select-bordered select-sm" value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {filteredDoctors.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`p-4 rounded-xl border cursor-pointer flex justify-between ${selectedDoc?.id === doc.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}>
                    <div><p className="font-bold">{doc.name}</p><p className="text-sm opacity-70">Chuyên khoa: {doc.spec}</p></div>
                    <span className="font-bold text-primary">{doc.fee.toLocaleString()} đ</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Calendar/> 2. Thời gian</h2>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input input-bordered w-full mb-4" />
              <div className="grid grid-cols-4 gap-2">
                {SLOTS.map(s => (
                  <button key={s} onClick={() => setSlot(s)} className={`btn btn-sm ${slot === s ? 'btn-primary' : 'btn-outline'}`}><Clock className="w-3 h-3"/> {s}</button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="card bg-base-100 p-6 shadow-xl border border-primary/20 h-fit space-y-4 sticky top-24">
            <h2 className="font-bold border-b pb-2">Tóm tắt</h2>
            <div className="text-sm space-y-2 opacity-80">
              <p>Loại: <b>{appointmentType === 'OFFLINE' ? 'Trực tiếp' : 'Online'}</b></p>
              <p>BS: {selectedDoc?.name}</p>
              <p>Ngày: {date}</p>
              <p>Giờ: {slot}</p>
            </div>
            <div className="flex justify-between font-bold text-lg text-primary pt-2 border-t">
              <span>Tổng:</span><span>{selectedDoc?.fee.toLocaleString() || 0} đ</span>
            </div>
            
            {status === 'IDLE' && (
              <button onClick={() => setStatus('PAYMENT_PENDING')} disabled={!selectedDoc} className="btn btn-primary w-full mt-2">Xác nhận lịch</button>
            )}
            
            {/* BƯỚC 1: Chọn phương thức */}
            {status === 'PAYMENT_PENDING' && (
              <div className="space-y-3 p-4 bg-base-200 rounded-xl border border-base-300 animate-fade-in-up">
                <p className="font-bold text-sm flex items-center gap-2"><Wallet className="w-4 h-4"/> Chọn thanh toán:</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-lg border hover:border-primary">
                    <input type="radio" name="payMethod" checked={payMethod === 'momo'} onChange={() => setPayMethod('momo')} className="radio radio-primary radio-sm" />
                    <span className="text-sm font-medium">Thanh toán qua Ví MoMo</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-lg border hover:border-primary">
                    <input type="radio" name="payMethod" checked={payMethod === 'vnpay'} onChange={() => setPayMethod('vnpay')} className="radio radio-primary radio-sm" />
                    <span className="text-sm font-medium">Thanh toán qua VNPAY</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-lg border hover:border-primary">
                    <input type="radio" name="payMethod" checked={payMethod === 'bank'} onChange={() => setPayMethod('bank')} className="radio radio-primary radio-sm" />
                    <span className="text-sm font-medium">Chuyển khoản Ngân hàng</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-lg border hover:border-primary">
                    <input type="radio" name="payMethod" checked={payMethod === 'offline'} onChange={() => setPayMethod('offline')} className="radio radio-primary radio-sm" />
                    <span className="text-sm font-medium">Thanh toán tại Phòng khám</span>
                  </label>
                </div>
                <button onClick={handleProceedPayment} className="btn btn-primary w-full gap-2 mt-4">
                  Tiếp tục
                </button>
              </div>
            )}

            {/* BƯỚC 2: Hiển thị QR Code nếu thanh toán Online */}
            {status === 'SHOW_PAYMENT_QR' && (
              <div className="space-y-4 p-5 bg-base-100 rounded-xl border-2 border-primary/50 text-center animate-fade-in-up shadow-lg">
                <h3 className="font-bold text-base flex justify-center items-center gap-2"><ScanLine className="w-5 h-5 text-primary"/> Quét mã để thanh toán</h3>
                <p className="text-sm opacity-80 mb-2">
                  Cổng: <span className="uppercase font-bold text-primary">{payMethod}</span>
                </p>
                
                <div className="bg-white p-2 rounded-xl inline-block shadow-sm border border-base-200">
                  <img src={getQrImageUrl()} alt="Payment QR" className="mx-auto rounded-lg w-48 h-48 object-contain" />
                </div>
                
                <div className="text-lg">
                  Tổng tiền: <span className="font-bold text-error">{selectedDoc.fee.toLocaleString()} đ</span>
                </div>
                <p className="text-xs opacity-60 italic">Sau khi quét mã và chuyển khoản thành công, vui lòng bấm nút xác nhận bên dưới.</p>

                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={handleSaveAppointment} className="btn btn-success text-white w-full gap-2 shadow-md">
                    <CheckCircle className="w-5 h-5"/> Tôi đã thanh toán xong
                  </button>
                  <button onClick={() => setStatus('PAYMENT_PENDING')} className="btn btn-ghost btn-sm w-full text-base-content/60">
                    Quay lại chọn cách khác
                  </button>
                </div>
              </div>
            )}

            {/* BƯỚC 3: Hiệu ứng Loading chờ xử lý */}
            {status === 'PAYMENT_PROCESSING' && (
              <div className="flex flex-col items-center justify-center p-6 space-y-3 bg-base-200 rounded-xl border border-base-300">
                 <span className="loading loading-spinner loading-lg text-primary"></span>
                 <span className="text-sm font-bold text-base-content/80 mt-2">Hệ thống đang xác nhận...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}