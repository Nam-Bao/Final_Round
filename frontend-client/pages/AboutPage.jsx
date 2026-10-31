import React from 'react';
import { Link } from 'react-router-dom';
import { Scan, Stethoscope, Sparkles, ShoppingBag, ShieldCheck, Receipt, MapPin, Phone, Clock } from 'lucide-react';
import ClinicStats from '../components/ClinicStats';
import { HOTLINE, HOTLINE_DISPLAY, WORKING_HOURS } from '../utils/contact';

// Mô hình O2O mà hệ thống đang vận hành (mỗi bước ứng với một chức năng có thật trên website)
const JOURNEY = [
  { icon: Scan, title: 'Sàng lọc da bằng AI', desc: 'Khách tải ảnh để AI khoanh vùng khuyết điểm, tham khảo trước khi đi khám.' },
  { icon: Stethoscope, title: 'Khám với bác sĩ', desc: 'Khám trực tiếp tại phòng khám hoặc khám online qua video call đúng giờ hẹn.' },
  { icon: Sparkles, title: 'Điều trị tại phòng khám', desc: 'Bác sĩ chỉ định dịch vụ, gói liệu trình; kỹ thuật viên thực hiện và ghi nhận ảnh sau điều trị.' },
  { icon: ShoppingBag, title: 'Chăm sóc tại nhà', desc: 'Dược mỹ phẩm theo đơn bác sĩ, đặt mua online hoặc nhận tại quầy.' },
];

const COMMITMENTS = [
  { icon: Stethoscope, title: 'Bác sĩ chỉ định', desc: 'Dịch vụ điều trị chỉ thực hiện sau khi bác sĩ thăm khám, không tự ý làm theo yêu cầu.' },
  { icon: Receipt, title: 'Giá công khai', desc: 'Giá dịch vụ và sản phẩm niêm yết trên website; hóa đơn do hệ thống tính, trừ đúng tiền cọc đã đóng.' },
  { icon: ShieldCheck, title: 'Đánh giá thật', desc: 'Chỉ khách đã khám, làm dịch vụ hoặc nhận hàng mới được đánh giá; mỗi lượt dùng chỉ đánh giá một lần.' },
];

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-12">
      {/* Giới thiệu */}
      <section className="bg-[#102A43] text-white rounded-3xl p-8 md:p-12 space-y-8">
        <div className="max-w-3xl space-y-3">
          <span className="badge badge-outline text-teal-300 border-teal-300">Về GlowSkin</span>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Phòng khám da liễu theo mô hình O2O</h1>
          <p className="text-slate-200 leading-relaxed">
            GlowSkin kết nối trải nghiệm trực tuyến (sàng lọc AI, khám online, mua dược mỹ phẩm) với điều trị tại phòng khám,
            để khách hàng được bác sĩ theo dõi xuyên suốt từ lúc soi da đến khi chăm sóc tại nhà.
          </p>
        </div>
        <ClinicStats />
      </section>

      {/* Hành trình */}
      <section className="space-y-6">
        <h2 className="text-2xl font-extrabold text-secondary text-center">Hành trình chăm sóc da tại GlowSkin</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="bg-base-100 border border-base-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                  <span className="text-xs font-semibold text-base-content/50">BƯỚC {idx + 1}</span>
                </div>
                <h3 className="font-bold text-secondary">{step.title}</h3>
                <p className="text-sm text-base-content/70 leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cam kết */}
      <section className="grid gap-6 md:grid-cols-3">
        {COMMITMENTS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="bg-base-100 border border-base-200 rounded-2xl p-6 space-y-2">
              <Icon className="w-6 h-6 text-primary" />
              <h3 className="font-bold text-secondary">{item.title}</h3>
              <p className="text-sm text-base-content/70 leading-relaxed">{item.desc}</p>
            </div>
          );
        })}
      </section>

      {/* Liên hệ nhanh */}
      <section className="bg-base-100 border border-base-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> 343/5F Tô Hiến Thành, P.12, Q.10, TP.HCM</p>
          <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Hotline: <a href={`tel:${HOTLINE}`} className="font-semibold text-primary">{HOTLINE_DISPLAY}</a></p>
          <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> {WORKING_HOURS}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/doi-ngu-bac-si" className="btn btn-outline btn-primary">Đội ngũ bác sĩ</Link>
          <Link to="/booking" className="btn btn-primary">Đặt lịch khám</Link>
        </div>
      </section>
    </div>
  );
}
