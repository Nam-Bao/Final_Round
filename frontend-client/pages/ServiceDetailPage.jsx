import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ServiceDetail from '../components/ServiceDetail';

// Trang riêng /services/:id (dùng khi mở link chia sẻ); trong trang Dịch vụ thì chi tiết hiện dạng popup
export default function ServiceDetailPage() {
  const { id } = useParams();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <Link to="/services" className="btn btn-ghost btn-sm gap-1">
        <ArrowLeft className="w-4 h-4" /> Danh sách dịch vụ
      </Link>
      <ServiceDetail id={id} />
    </div>
  );
}
