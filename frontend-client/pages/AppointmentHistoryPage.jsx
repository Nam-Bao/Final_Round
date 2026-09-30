import React, { useState, useEffect } from 'react';
import { ClipboardList, Calendar, Video, MapPin, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AppointmentHistoryPage() {
  const navigate = useNavigate();
  const [apts, setApts] = useState([]);

  // Kéo toàn bộ lịch sử khám từ bộ nhớ tạm ra lúc vừa load trang
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('mockAppointments')) || [];
    setApts(saved);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
        <ClipboardList className="text-primary" /> Sổ Lịch Khám
      </h1>

      {apts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 mb-4">Bạn chưa có lịch hẹn khám nào với Bác sĩ.</p>
          <button onClick={() => navigate('/booking')} className="btn btn-primary">Đặt lịch khám ngay</button>
        </div>
      ) : (
        <div className="space-y-4">
          {apts.map((apt) => (
            <div key={apt.id} className="card bg-white shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-primary/40 transition-colors">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-slate-800">{apt.id}</span>
                  <span className="badge badge-success gap-1 text-white"><CheckCircle className="w-3 h-3"/> {apt.status}</span>
                </div>
                <p className="font-bold text-blue-800 text-lg">{apt.doctorName}</p>
                <p className="text-sm text-slate-600 bg-slate-100 inline-block px-2 py-1 rounded">Chuyên khoa: {apt.spec}</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[240px] space-y-3">
                <p className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Thời gian:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-primary"/> {apt.slot} - {apt.date}
                  </span>
                </p>
                <p className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Hình thức:</span>
                  <span className={`font-bold flex items-center gap-1 ${apt.type === 'OFFLINE' ? 'text-orange-600' : 'text-info'}`}>
                    {apt.type === 'OFFLINE' ? <MapPin className="w-4 h-4"/> : <Video className="w-4 h-4"/>} 
                    {apt.type === 'OFFLINE' ? 'Khám trực tiếp' : 'Tư vấn Online'}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}