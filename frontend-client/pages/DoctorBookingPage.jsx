import React, { useState } from 'react';
import { Calendar, Clock, CreditCard, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DOCTORS = [
  { id: 1, name: 'BS. CKI Nguyễn Văn An', spec: 'Chuyên khoa Da liễu', fee: 300000 },
  { id: 2, name: 'ThS. BS Trần Thị Mai', spec: 'Trị Mụn & Phục hồi', fee: 350000 }
];
const SLOTS = ['08:30', '09:30', '14:00', '15:00'];

export default function DoctorBookingPage() {
  const [selectedDoc, setSelectedDoc] = useState(DOCTORS[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [status, setStatus] = useState('IDLE');
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Đặt Lịch Khám Chuyên Khoa</h1>
      
      {status === 'APPOINTMENT_CONFIRMED' ? (
        <div className="card bg-base-100 shadow-xl border border-success p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-success">Thanh Toán Thành Công!</h2>
          <div className="badge badge-success text-white py-3 px-4">APPOINTMENT_CONFIRMED</div>
          <p>Lịch khám với {selectedDoc.name} lúc {slot} ngày {date} đã được chốt.</p>
          <button onClick={() => navigate('/appointments')} className="btn btn-primary mt-4">Xem sổ khám bệnh</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="card bg-base-100 p-6 shadow-xl border border-base-200">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><User/> 1. Chọn Bác sĩ</h2>
              <div className="space-y-3">
                {DOCTORS.map(doc => (
                  <div key={doc.id} onClick={() => setSelectedDoc(doc)} className={`p-4 rounded-xl border cursor-pointer flex justify-between ${selectedDoc.id === doc.id ? 'border-primary bg-primary/10' : 'hover:border-base-300'}`}>
                    <div><p className="font-bold">{doc.name}</p><p className="text-sm opacity-70">{doc.spec}</p></div>
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
          
          <div className="card bg-base-100 p-6 shadow-xl border border-base-200 h-fit space-y-4">
            <h2 className="font-bold border-b pb-2">Tóm tắt</h2>
            <div className="text-sm space-y-2 opacity-80"><p>BS: {selectedDoc.name}</p><p>Ngày: {date}</p><p>Giờ: {slot}</p></div>
            <div className="flex justify-between font-bold text-lg text-primary pt-2 border-t"><span>Tổng:</span><span>{selectedDoc.fee.toLocaleString()} đ</span></div>
            
            {status === 'IDLE' && <button onClick={() => setStatus('PAYMENT_PENDING')} className="btn btn-primary w-full">Xác nhận lịch</button>}
            {status === 'PAYMENT_PENDING' && (
              <div className="space-y-2">
                <div className="badge badge-warning w-full py-3 text-xs font-bold">PAYMENT_PENDING</div>
                <button onClick={() => setTimeout(() => setStatus('APPOINTMENT_CONFIRMED'), 1000)} className="btn btn-success text-white w-full gap-2"><CreditCard className="w-4 h-4"/> Thanh toán VNPAY</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}