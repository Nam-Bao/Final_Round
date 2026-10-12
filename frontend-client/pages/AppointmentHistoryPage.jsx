import React, { useState, useEffect } from 'react';
import { ClipboardList, Calendar, Video, MapPin, CheckCircle, XCircle, Clock, FileText, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

export default function AppointmentHistoryPage() {
  const navigate = useNavigate();
  const [apts, setApts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token'); // Token của khách hàng
      if (!token) return navigate('/client-login');

      const headers = { 'Authorization': `Bearer ${token}` };

      // Kéo song song: Lịch sử đặt hẹn + Danh sách Bác sĩ + Sổ y bạ của khách
      const [aptRes, docRes, recRes] = await Promise.all([
        axios.get('http://localhost:4000/api/booking/appointments/my-history', { headers }),
        axios.get('http://localhost:4000/api/identity/users/doctors', { headers }),
        axios.get('http://localhost:4000/api/identity/medical-records/my-records', { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      setApts(aptRes.data?.data || []);
      setDoctors(docRes.data?.data || []);
      setRecords(recRes.data?.data || []);
    } catch (error) {
      console.error("Lỗi lấy dữ liệu:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCancel = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy lịch khám này? Giờ khám sẽ được nhường cho người khác.')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${id}/cancel`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert('Hủy lịch thành công!');
      fetchData(); // Tải lại danh sách
    } catch (error) {
      alert('Không thể hủy lịch, vui lòng liên hệ CSKH.');
    }
  };

  const handleViewRecord = (aptId) => {
    const record = records.find(r => r.appointment_id === aptId);
    if (record) {
      setSelectedRecord(record);
      setIsModalOpen(true);
    } else {
      alert('Chưa có hồ sơ y tế chi tiết cho buổi khám này.');
    }
  };

  const getStatusUI = (status) => {
    switch(status) {
      case 'PENDING': return <span className="badge badge-warning gap-1"><Clock className="w-3 h-3"/> Chờ xác nhận</span>;
      case 'CONFIRMED': return <span className="badge badge-info gap-1 text-white"><CheckCircle className="w-3 h-3"/> Đã chốt giờ</span>;
      case 'WAITING':
      case 'IN_PROGRESS': return <span className="badge badge-primary gap-1"><Clock className="w-3 h-3"/> Đang tiến hành</span>;
      case 'WAITING_FOR_SALE':
      case 'COMPLETED': return <span className="badge badge-success gap-1 text-white"><CheckCircle className="w-3 h-3"/> Đã hoàn thành</span>;
      case 'CANCELLED': return <span className="badge badge-error gap-1 text-white"><XCircle className="w-3 h-3"/> Đã hủy</span>;
      default: return <span className="badge badge-ghost">{status}</span>;
    }
  };

  if (loading) return <div className="text-center py-20"><span className="loading loading-spinner loading-lg text-primary"></span></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
        <ClipboardList className="text-primary" /> Sổ Lịch Khám & Y Bạ
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
          {apts.map((apt) => {
             const doc = doctors.find(d => d.id === apt.doctor_id);
             const docName = doc ? doc.Profile?.full_name : 'Bác sĩ Da liễu';
             const timeStr = apt.appointment_time ? String(apt.appointment_time).slice(0,5) : '--:--';
             const hasRecord = records.some(r => r.appointment_id === apt.id);

             return (
                <div key={apt.id} className="card bg-white shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-primary/40 transition-colors">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-slate-800">
                        {apt.type === 'FOLLOW_UP' ? 'TÁI KHÁM' : 'KHÁM MỚI'}
                      </span>
                      {getStatusUI(apt.status)}
                    </div>
                    <p className="font-bold text-blue-800 text-lg">{docName}</p>
                    {apt.symptoms && <p className="text-sm text-slate-500 italic max-w-sm truncate">Lý do: {apt.symptoms}</p>}
                  </div>
                  
                  <div className="flex flex-col md:items-end gap-3">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[240px] space-y-3">
                      <p className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Thời gian:</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-primary"/> {timeStr} - {dayjs(apt.appointment_date).format('DD/MM/YYYY')}
                        </span>
                      </p>
                      <p className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Hình thức:</span>
                        <span className={`font-bold flex items-center gap-1 ${apt.type === 'OFFLINE' ? 'text-orange-600' : 'text-info'}`}>
                          {apt.pre_notes?.includes('[ONLINE]') ? <Video className="w-4 h-4"/> : <MapPin className="w-4 h-4"/>} 
                          {apt.pre_notes?.includes('[ONLINE]') ? 'Tư vấn Online' : 'Khám trực tiếp'}
                        </span>
                      </p>
                    </div>

                    <div className="flex gap-2 w-full justify-end">
                      {(apt.status === 'PENDING' || apt.status === 'CONFIRMED') && (
                        <button onClick={() => handleCancel(apt.id)} className="btn btn-sm btn-error btn-outline flex-1 md:flex-none">
                          Hủy lịch
                        </button>
                      )}
                      
                      {(hasRecord || apt.status === 'COMPLETED' || apt.status === 'WAITING_FOR_SALE') && (
                        <button onClick={() => handleViewRecord(apt.id)} className="btn btn-sm btn-primary flex-1 md:flex-none gap-1">
                          <FileText className="w-4 h-4"/> Xem hồ sơ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
             );
          })}
        </div>
      )}

      {/* MODAL XEM HỒ SƠ Y TẾ */}
      {isModalOpen && selectedRecord && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-xl text-primary flex items-center gap-2">
                 <FileText/> Hồ Sơ Y Tế
               </h3>
               <button onClick={() => setIsModalOpen(false)} className="btn btn-sm btn-circle btn-ghost"><X/></button>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border space-y-4">
               <div className="grid grid-cols-2 gap-4 border-b pb-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Ngày Khám</p>
                    <p className="font-medium text-slate-800">{dayjs(selectedRecord.exam_date).format('DD/MM/YYYY HH:mm')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Bác sĩ phụ trách</p>
                    <p className="font-medium text-blue-700">{selectedRecord.Doctor?.Profile?.full_name}</p>
                  </div>
               </div>

               <div>
                 <p className="text-xs text-slate-500 uppercase font-bold mb-1">Triệu chứng lâm sàng</p>
                 <p className="text-sm p-3 bg-white border rounded-lg whitespace-pre-wrap">{selectedRecord.symptoms}</p>
               </div>

               <div>
                 <p className="text-xs text-slate-500 uppercase font-bold mb-1 text-red-600">Chẩn đoán / Kết luận</p>
                 <p className="text-sm p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg whitespace-pre-wrap font-medium">{selectedRecord.diagnosis}</p>
               </div>

               <div>
                 <p className="text-xs text-slate-500 uppercase font-bold mb-1 text-green-600">Dặn dò của bác sĩ</p>
                 <p className="text-sm p-3 bg-green-50 text-green-800 border border-green-100 rounded-lg whitespace-pre-wrap">{selectedRecord.doctor_notes}</p>
               </div>

               {selectedRecord.follow_up_date && (
                 <div className="mt-4 flex items-center gap-2 bg-orange-50 p-3 rounded-lg border border-orange-100 text-orange-800">
                    <Calendar className="w-5 h-5"/>
                    <span className="font-medium">Lịch tái khám dự kiến: {dayjs(selectedRecord.follow_up_date).format('DD/MM/YYYY')}</span>
                 </div>
               )}
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}></div>
        </div>
      )}
    </div>
  );
}