import React, { useState, useEffect } from 'react';
import { ClipboardList, Calendar, Video, MapPin, CheckCircle, XCircle, Clock, FileText, X, HeartPulse, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';

export default function AppointmentHistoryPage() {
  const navigate = useNavigate();
  const [apts, setApts] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [records, setRecords] = useState([]);
  
  const [myProfiles, setMyProfiles] = useState([]);
  const [mySessions, setMySessions] = useState([]);
  const [catalogs, setCatalogs] = useState({ services: [], packages: [], products: [] });
  
  const [loading, setLoading] = useState(true);
  const [selectedApt, setSelectedApt] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null); // BỔ SUNG: State lưu ảnh đang xem phóng to

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token'); 
      if (!token) return navigate('/client-login');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [aptRes, docRes, recRes, profRes, sessionRes, srvRes, pkgRes, prodRes] = await Promise.all([
        axios.get('http://localhost:4000/api/booking/appointments/my-history', { headers }),
        axios.get('http://localhost:4000/api/identity/users/doctors', { headers }),
        axios.get('http://localhost:4000/api/identity/medical-records/my-records', { headers }).catch(() => ({ data: { data: [] } })),
        axios.get('http://localhost:4000/api/identity/users/profile', { headers }).catch(() => ({ data: { data: {} } })),
        axios.get('http://localhost:4000/api/booking/sessions/my-sessions', { headers }).catch(() => ({ data: { data: [] } })),
        axios.get('http://localhost:4000/api/booking/spa-services'),
        axios.get('http://localhost:4000/api/booking/packages'),
        axios.get('http://localhost:4000/api/commerce/products')
      ]);

      setApts(aptRes.data?.data || []);
      setDoctors(docRes.data?.data || []);
      setRecords(recRes.data?.data || []);
      setMyProfiles(profRes.data?.data?.PatientProfiles || []);
      setMySessions(sessionRes.data?.data || []);
      
      setCatalogs({
        services: srvRes.data?.data || [],
        packages: pkgRes.data?.data || [],
        products: prodRes.data?.data || []
      });

    } catch (error) { console.error("Lỗi lấy dữ liệu:", error); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCancel = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy lịch khám này? Giờ khám sẽ được nhường cho người khác.')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://localhost:4000/api/booking/appointments/${id}/cancel`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      alert('Hủy lịch thành công!');
      fetchData(); 
    } catch (error) { alert('Không thể hủy lịch, vui lòng liên hệ CSKH.'); }
  };

  const handleViewRecord = (apt) => {
    setSelectedApt(apt);
    setIsModalOpen(true);
  };

  // BỔ SUNG: Hàm xử lý mở modal xem ảnh phóng to
  const handleImageClick = (imgUrl) => {
    setPreviewImage(imgUrl);
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

  const recordInModal = selectedApt ? records.find(r => r.appointment_id === selectedApt.id) : null;
  const sessionsInModal = selectedApt ? mySessions.filter(s => s.session_date === selectedApt.appointment_date && s.patient_profile_id === selectedApt.patient_profile_id) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 relative">
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
             const profileName = myProfiles.find(p => p.id === apt.patient_profile_id)?.full_name || 'Khách hàng';
             const timeStr = apt.appointment_time ? String(apt.appointment_time).slice(0,5) : '--:--';
             const hasData = records.some(r => r.appointment_id === apt.id) || mySessions.some(s => s.session_date === apt.appointment_date);

             return (
                <div key={apt.id} className="card bg-white shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-primary/40 transition-colors">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-slate-800">{apt.type === 'FOLLOW_UP' ? 'TÁI KHÁM' : 'KHÁM MỚI'}</span>
                      {getStatusUI(apt.status)}
                    </div>
                    <p className="font-bold text-blue-800 text-lg">{docName}</p>
                    <p className="text-sm font-medium text-slate-600">Hồ sơ người khám: <span className="text-slate-800">{profileName}</span></p>
                  </div>
                  
                  <div className="flex flex-col md:items-end gap-3">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[240px] space-y-3">
                      <p className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Thời gian:</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1"><Calendar className="w-4 h-4 text-primary"/> {timeStr} - {dayjs(apt.appointment_date).format('DD/MM/YYYY')}</span>
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
                        <button onClick={() => handleCancel(apt.id)} className="btn btn-sm btn-error btn-outline flex-1 md:flex-none">Hủy lịch</button>
                      )}
                      
                      {(hasData || apt.status === 'COMPLETED' || apt.status === 'WAITING_FOR_SALE') && (
                        <button onClick={() => handleViewRecord(apt)} className="btn btn-sm btn-primary flex-1 md:flex-none gap-1"><FileText className="w-4 h-4"/> Xem hồ sơ</button>
                      )}
                    </div>
                  </div>
                </div>
             );
          })}
        </div>
      )}

      {isModalOpen && selectedApt && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl bg-slate-50 p-0 overflow-hidden">
            <div className="bg-white p-5 flex justify-between items-center border-b sticky top-0 z-10">
               <h3 className="font-bold text-xl text-primary flex items-center gap-2"><FileText/> Chi tiết Lịch Khám & Dịch Vụ</h3>
               <button onClick={() => setIsModalOpen(false)} className="btn btn-sm btn-circle btn-ghost"><X/></button>
            </div>
            
            <div className="p-5 space-y-6 overflow-y-auto max-h-[70vh]">
               {recordInModal && (
                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <h4 className="font-bold text-blue-800 text-lg flex items-center gap-2 border-b pb-2"><HeartPulse className="w-5 h-5"/> Kết luận của Bác sĩ</h4>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1">Triệu chứng lâm sàng</p>
                      <p className="text-sm p-3 bg-slate-50 border rounded-lg whitespace-pre-wrap">{recordInModal.symptoms}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1 text-red-600">Chẩn đoán / Kết luận</p>
                      <p className="text-sm p-3 bg-red-50 text-red-800 border border-red-100 rounded-lg whitespace-pre-wrap font-medium">{recordInModal.diagnosis}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase font-bold mb-1 text-green-600">Dặn dò của bác sĩ</p>
                      <p className="text-sm p-3 bg-green-50 text-green-800 border border-green-100 rounded-lg whitespace-pre-wrap">{recordInModal.doctor_notes}</p>
                    </div>
                 </div>
               )}

               {(selectedApt.prescribed_services?.length > 0 || selectedApt.prescribed_packages?.length > 0 || selectedApt.prescribed_medicines?.length > 0) && (
                 <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h4 className="font-bold text-purple-800 text-lg flex items-center gap-2 border-b pb-2 mb-3"><ShoppingBag className="w-5 h-5"/> Sản phẩm & Dịch vụ được chỉ định</h4>
                    
                    {selectedApt.prescribed_services?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-bold text-slate-700 mb-1">Dịch vụ Spa (Làm ngay):</p>
                        <ul className="list-disc list-inside text-sm text-slate-600">
                           {selectedApt.prescribed_services.map(id => <li key={id}>{catalogs.services.find(s => s.id === id)?.name || 'Dịch vụ'}</li>)}
                        </ul>
                      </div>
                    )}
                    {selectedApt.prescribed_packages?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-bold text-slate-700 mb-1">Gói Liệu Trình (VIP):</p>
                        <ul className="list-disc list-inside text-sm text-slate-600">
                           {selectedApt.prescribed_packages.map(id => <li key={id}>{catalogs.packages.find(p => p.id === id)?.name || 'Gói liệu trình'}</li>)}
                        </ul>
                      </div>
                    )}
                    {selectedApt.prescribed_medicines?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-sm font-bold text-slate-700 mb-1">Dược Mỹ Phẩm (Mua về):</p>
                        <ul className="list-disc list-inside text-sm text-slate-600">
                           {selectedApt.prescribed_medicines.map(id => <li key={id}>{catalogs.products.find(p => p.id === id)?.name || 'Sản phẩm'}</li>)}
                        </ul>
                      </div>
                    )}
                 </div>
               )}

               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">📷 Da trước khám (Before)</h4>
                    {selectedApt.pre_exam_images?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedApt.pre_exam_images.map((img, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleImageClick(img)}
                            className="cursor-pointer overflow-hidden rounded-lg border shadow-sm hover:opacity-80 transition-opacity"
                          >
                            <img 
                              src={img} 
                              alt="Before" 
                              className="w-20 h-20 object-cover" 
                            />
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-slate-400 italic">Không có ảnh chụp</p>}
                  </div>

                  <div>
                    <h4 className="font-bold text-green-700 mb-2 border-b pb-1">✨ Da sau dịch vụ (After)</h4>
                    {sessionsInModal.length > 0 && sessionsInModal.some(s => s.post_treatment_images?.length > 0) ? (
                      <div className="flex flex-wrap gap-2">
                        {sessionsInModal.flatMap(s => s.post_treatment_images || []).map((img, i) => (
                          <div 
                            key={i} 
                            onClick={() => handleImageClick(img)}
                            className="cursor-pointer overflow-hidden rounded-lg border border-green-300 shadow-sm hover:opacity-80 transition-opacity"
                          >
                            <img 
                               src={img} 
                               alt="After" 
                               className="w-20 h-20 object-cover" 
                            />
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-slate-400 italic">Chưa hoàn thành dịch vụ hoặc không có ảnh</p>}
                  </div>
               </div>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}></div>
        </div>
      )}

      {/* BỔ SUNG: Modal xem ảnh phóng to bằng Tailwind & HTML chuẩn */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewImage(null)}>
          <button 
            className="absolute top-4 right-4 text-white hover:text-slate-300 p-2"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={previewImage} 
            alt="Preview" 
            className="max-w-full max-h-full object-contain rounded"
            onClick={(e) => e.stopPropagation()} // Ngăn click vào ảnh bị đóng modal
          />
        </div>
      )}
    </div>
  );
}