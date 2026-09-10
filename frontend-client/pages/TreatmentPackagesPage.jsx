import React, { useState } from 'react';
import { Layers } from 'lucide-react';

export default function TreatmentPackagesPage() {
  // Đã chuyển thành mảng rỗng []
  const [packages, setPackages] = useState([]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="text-primary" /> Lộ Trình Trị Liệu O2O</h1>
      
      {packages.length === 0 ? (
        <div className="text-center py-10 bg-base-100 rounded-xl border border-base-200">
          <p className="text-base-content/60">Bạn chưa đăng ký gói liệu trình nào.</p>
        </div>
      ) : (
        packages.map(pkg => (
          <div key={pkg.id} className="card bg-base-100 shadow-xl border border-base-200 p-6 space-y-4">
             {/* Nội dung giao diện giữ nguyên nếu sau này có dữ liệu */}
          </div>
        ))
      )}
    </div>
  );
}