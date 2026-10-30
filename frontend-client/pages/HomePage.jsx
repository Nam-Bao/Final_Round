import React from 'react';
import { Link } from 'react-router-dom';
import { Scan, CalendarCheck, Stethoscope, ShoppingBag, ArrowRight, ShieldCheck } from 'lucide-react';
import CustomerConcerns from '../components/CustomerConcerns';
import GlowSkinValueProp from '../components/GlowSkinValueProp';

// Hành trình O2O: soi da AI -> khám bác sĩ -> chăm sóc tại nhà
const STEPS = [
  {
    icon: Scan,
    title: 'Soi da bằng AI',
    desc: 'Tải ảnh khuôn mặt để AI khoanh vùng mụn, thâm và các khuyết điểm. Kết quả chỉ mang tính tham khảo.',
    link: '/sang-loc-da',
    linkText: 'Soi da ngay',
  },
  {
    icon: Stethoscope,
    title: 'Khám với bác sĩ da liễu',
    desc: 'Đặt lịch khám online qua video hoặc trực tiếp tại phòng khám để bác sĩ chẩn đoán và lên phác đồ.',
    link: '/booking',
    linkText: 'Đặt lịch khám',
  },
  {
    icon: ShoppingBag,
    title: 'Chăm sóc tại nhà',
    desc: 'Nhận routine dược mỹ phẩm chính hãng theo đơn của bác sĩ, theo dõi tiến triển qua từng buổi.',
    link: '/shops',
    linkText: 'Xem mỹ phẩm',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Banner giới thiệu */}
      <section className="bg-gradient-to-br from-primary/10 via-base-100 to-teal-50 rounded-3xl border border-base-200 px-6 py-12 md:px-14 md:py-16">
        <div className="max-w-3xl">
          <span className="badge badge-primary badge-outline font-semibold mb-4">Phòng khám da liễu O2O</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-secondary leading-tight">
            Chăm sóc da chuẩn y khoa, <span className="text-primary">từ online đến phòng khám</span>
          </h1>
          <p className="text-base md:text-lg text-base-content/70 mt-4 leading-relaxed">
            GlowSkin kết hợp công cụ sàng lọc da bằng AI với đội ngũ bác sĩ da liễu, giúp bạn hiểu làn da của mình và
            điều trị đúng cách, minh bạch chi phí.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/sang-loc-da" className="btn btn-primary gap-2">
              <Scan className="w-5 h-5" /> Soi da miễn phí bằng AI
            </Link>
            <Link to="/booking" className="btn btn-outline btn-primary gap-2">
              <CalendarCheck className="w-5 h-5" /> Đặt lịch khám
            </Link>
          </div>
          <p className="flex items-center gap-2 text-xs text-base-content/60 mt-4">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Ảnh của bạn chỉ được tải lên khi bạn đồng ý với chính sách sử dụng ảnh.
          </p>
        </div>
      </section>

      {/* Hành trình 3 bước */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="bg-base-100 rounded-2xl border border-base-200 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-base-content/50">BƯỚC {idx + 1}</span>
              </div>
              <h3 className="text-lg font-bold text-secondary mb-2">{step.title}</h3>
              <p className="text-sm text-base-content/70 leading-relaxed flex-1">{step.desc}</p>
              <Link to={step.link} className="btn btn-sm btn-ghost text-primary gap-1 self-start mt-4 px-0">
                {step.linkText} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          );
        })}
      </section>

      {/* Khối Thấu hiểu nỗi lo khách hàng */}
      <CustomerConcerns />

      {/* 3 Khối Giá Trị & Phác Đồ GlowSkin (Style O2 SKIN) */}
      <GlowSkinValueProp />
    </div>
  );
}
