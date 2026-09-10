import React, { useState } from 'react';
import { ClipboardList, Calendar, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AppointmentHistoryPage() {
  const navigate = useNavigate();
  // Đã chuyển thành mảng rỗng []
  const [apts, setApts] = useState([]);

  const handlePushCart = (items) => {
    localStorage.setItem('cartItems', JSON.stringify(items));
    navigate('/orders');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="text-primary" /> Sổ Lịch Khám</h1>
      
      {apts.length === 0 ? (
        <div className="text-center py-10 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Bạn chưa có lịch hẹn khám nào với Bác sĩ.</p>
        </div>
      ) : (
        apts.map(apt => (
          <div key={apt.id} className="card bg-base-100 shadow-xl border border-base-200 p-6 space-y-4">
            {/* Nội dung giao diện */}
          </div>
        ))
      )}
    </div>
  );
}