import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, QrCode, AlertTriangle, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function PaymentPage() {
  const { id } = useParams(); 
  const location = useLocation();
  const navigate = useNavigate();
  const [isPaid, setIsPaid] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const totalFee = parseInt(searchParams.get('fee') || '100000', 10);
  
  const isOnline = searchParams.get('type') === 'ONLINE';
  const amountToPay = totalFee === 0 ? 0 : (isOnline ? totalFee : 50000); 

  // TẠO MÃ GIAO DỊCH DUY NHẤT (6 ký tự đầu của ID Lịch hẹn)
  const orderCode = id.slice(0, 6).toUpperCase();

  // LẤY BIẾN MÔI TRƯỜNG TỪ .ENV
  const BANK_ID = import.meta.env.VITE_BANK_ID;
  const ACCOUNT_NO = import.meta.env.VITE_ACCOUNT_NO;
  const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME;

  // 1. Nếu khách cũ (0đ) -> Bỏ qua QR, gọi API chốt luôn
  useEffect(() => {
    if (amountToPay === 0) {
       const confirmZeroFee = async () => {
          const token = localStorage.getItem('token');
          await axios.put(`http://localhost:4000/api/booking/appointments/${id}/confirm-payment`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
          setIsPaid(true);
       };
       confirmZeroFee();
    }
  }, [amountToPay, id]);

  // 2. CƠ CHẾ POLLING (LÀM THẬT): Cứ 3 giây hỏi Backend 1 lần xem SePay đã bắn tiền về chưa
  useEffect(() => {
    if (amountToPay === 0 || isPaid) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://localhost:4000/api/booking/appointments/${id}/check-payment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Nếu Backend báo là trạng thái không còn là PENDING_PAYMENT nữa -> Đã thu tiền
        if (res.data.isPaid) {
          setIsPaid(true);
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Đang chờ thanh toán...");
      }
    }, 3000); // 3 giây quét 1 lần

    return () => clearInterval(interval); // Dọn dẹp khi rời trang
  }, [id, amountToPay, isPaid]);


  if (isPaid) {
    return (
      <div className="max-w-xl mx-auto mt-10 text-center space-y-6 animate-fade-in-up">
        <CheckCircle className="w-20 h-20 text-success mx-auto" />
        <h1 className="text-3xl font-bold text-slate-800">Đặt Lịch Thành Công!</h1>
        <p className="text-slate-600">Lịch hẹn của bạn đã được chốt và gửi đến Bác sĩ.</p>
        <button onClick={() => navigate('/appointments')} className="btn btn-primary mt-4">
          Vào Sổ Y Bạ của bạn <ArrowRight className="w-4 h-4"/>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
        <QrCode className="text-primary" /> Thanh Toán Đơn Hàng
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CỘT QR CODE */}
        <div className="card bg-white shadow-lg border p-6 flex flex-col items-center text-center space-y-4">
          <p className="text-sm font-bold uppercase text-slate-500">Mã QR Thanh Toán Tự Động</p>
          
          <div className="p-2 border-2 border-primary rounded-xl inline-block bg-white">
            <img 
              src={`https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amountToPay}&addInfo=O2O ${orderCode}&accountName=${ACCOUNT_NAME}`} 
              alt="QR Code" 
              className="w-56 h-56 object-cover"
            />
          </div>
          <p className="text-xs text-slate-400">Sử dụng App Ngân hàng bất kỳ để quét mã</p>
          
          <div className="w-full bg-slate-50 p-4 rounded-lg border text-left text-sm space-y-2">
             <p className="flex justify-between"><span>Ngân hàng:</span> <b>{BANK_ID}</b></p>
             <p className="flex justify-between"><span>Chủ tài khoản:</span> <b>{ACCOUNT_NAME}</b></p>
             <p className="flex justify-between"><span>Số tiền:</span> <b className="text-error text-lg">{amountToPay.toLocaleString()} đ</b></p>
             <p className="flex justify-between items-center">
                <span>Nội dung CK:</span> 
                <b className="text-primary font-mono bg-blue-50 px-2 py-1 rounded text-lg border border-blue-200">O2O {orderCode}</b>
             </p>
          </div>
        </div>

        {/* CỘT THÔNG TIN & XÁC NHẬN */}
        <div className="card bg-white shadow-lg border p-6 space-y-6 flex flex-col justify-between">
          <div>
            <h2 className="font-bold border-b pb-2 mb-4">Chi tiết thanh toán</h2>
            <div className="space-y-3 text-sm">
               <p className="flex justify-between text-slate-600"><span>Tổng phí dịch vụ:</span> <span>{totalFee.toLocaleString()} đ</span></p>
               {!isOnline && totalFee > 0 && (
                 <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning-content flex gap-2">
                   <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                   <p className="text-xs">Vì bạn chọn Khám Trực tiếp, bạn chỉ cần <b>đặt cọc trước {amountToPay.toLocaleString()} đ</b> để giữ chỗ. Số tiền còn lại sẽ thanh toán tại quầy.</p>
                 </div>
               )}
               <div className="flex justify-between font-bold text-xl pt-4 border-t border-dashed">
                  <span>Cần thanh toán:</span>
                  <span className="text-primary">{amountToPay.toLocaleString()} đ</span>
               </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50/50 text-slate-600 p-4 rounded-xl border border-blue-100 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium animate-pulse text-center">Hệ thống đang chờ bạn quét mã...<br/><span className="text-xs font-normal">Trang sẽ tự động chuyển khi nhận được tiền.</span></p>
            </div>
            
            <div className="bg-success/10 text-success p-3 rounded-lg flex gap-2 text-xs">
              <ShieldCheck className="w-8 h-8 flex-shrink-0" /> 
              Hệ thống tự động đối soát bằng SePay. Lưu ý nhập CHÍNH XÁC nội dung chuyển khoản để được xác nhận tự động.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}