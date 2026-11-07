import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, MapPin, Phone, Clock, CalendarCheck, MessageCircle, Navigation } from 'lucide-react';
import { SOCIAL_LINKS, HOTLINE, HOTLINE_DISPLAY, ZALO_URL, WORKING_HOURS, CONSULT_HOURS, CLINIC_ADDRESS, MAP_EMBED_URL, MAP_DIRECTIONS_URL, HAS_CLINIC_MAP } from '../utils/contact';

const LINK_GROUPS = [
  {
    title: 'Dịch vụ O2O',
    links: [
      ['/sang-loc-da', 'Sàng lọc da AI'],
      ['/booking', 'Khám Bác sĩ online'],
      ['/services', 'Trị liệu tại phòng khám'],
      ['/doi-ngu-bac-si', 'Đội ngũ bác sĩ'],
      ['/reviews', 'Đánh giá khách hàng'],
    ],
  },
  {
    title: 'Dược mỹ phẩm',
    links: [
      ['/shops', 'Cửa hàng mỹ phẩm'],
      ['/goi-lieu-trinh', 'Gói liệu trình chuyên sâu'],
      ['/promotions', 'Voucher & Khuyến mãi'],
      ['/news', 'Kiến thức chuẩn Da liễu'],
      ['/profile', 'Hồ sơ & Đơn hàng của tôi'],
    ],
  },
];

export default function ClientFooter() {
  return (
    <footer className="mt-8 md:mt-16 bg-gradient-to-b from-white to-teal-50/60 border-t border-base-300 text-base-content">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12 grid grid-cols-2 gap-x-6 gap-y-8 lg:gap-10 lg:grid-cols-12">

        {/* Thương hiệu + kêu gọi đặt lịch */}
        <div className="col-span-2 lg:col-span-4 space-y-4">
          <Link to="/" className="inline-flex items-center gap-2 text-xl font-bold text-primary">
            <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><Sparkles className="w-5 h-5" /></span>
            GlowSkin O2O
          </Link>
          <p className="text-sm text-base-content/70 leading-relaxed max-w-sm">
            Phòng khám da liễu kết hợp online và tại chỗ: sàng lọc da bằng AI, bác sĩ tư vấn phác đồ và dược mỹ phẩm chính hãng giao tận nơi.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/booking" className="btn btn-primary btn-sm rounded-full text-white gap-1.5">
              <CalendarCheck className="w-4 h-4" /> Đặt lịch khám
            </Link>
            <a href={ZALO_URL} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-primary btn-sm rounded-full gap-1.5">
              <MessageCircle className="w-4 h-4" /> Chat Zalo
            </a>
            {SOCIAL_LINKS.map(({ label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-primary btn-sm rounded-full">{label}</a>
            ))}
          </div>
        </div>

        {/* Các nhóm liên kết */}
        {LINK_GROUPS.map((group) => (
          <nav key={group.title} className="lg:col-span-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary mb-4">{group.title}</h3>
            <ul className="space-y-1 lg:space-y-2.5 text-sm">
              {group.links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="inline-block py-1 lg:py-0 text-base-content/70 hover:text-primary transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {/* Liên hệ + bản đồ */}
        <div className="col-span-2 lg:col-span-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary mb-4">Về GlowSkin Clinic</h3>
          <ul className="space-y-2.5 text-sm text-base-content/70">
            <li className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{CLINIC_ADDRESS}</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <span>Hotline: <a href={`tel:${HOTLINE}`} className="font-semibold text-base-content hover:text-primary">{HOTLINE_DISPLAY}</a></span>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Khám tại phòng khám: {WORKING_HOURS}
                <br />Tư vấn chuyên gia online: {CONSULT_HOURS}
              </span>
            </li>
          </ul>
          {HAS_CLINIC_MAP && (
          <a href={MAP_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer" className="sm:hidden btn btn-sm btn-outline btn-primary gap-1 mt-3">
            <Navigation className="w-4 h-4" /> Chỉ đường đến phòng khám
          </a>
          )}
          {HAS_CLINIC_MAP && (
          <div className="hidden sm:block relative mt-4 rounded-2xl overflow-hidden border border-base-300 shadow-sm">
            <iframe title="Bản đồ GlowSkin Clinic" src={MAP_EMBED_URL} className="w-full h-40 border-0 block" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
            <a href={MAP_DIRECTIONS_URL} target="_blank" rel="noopener noreferrer"
              className="absolute bottom-2 right-2 btn btn-xs bg-white/95 border-base-300 shadow gap-1 text-primary hover:bg-white">
              <Navigation className="w-3 h-3" /> Chỉ đường
            </a>
          </div>
          )}
        </div>
      </div>

      {/* Chính sách + bản quyền */}
      <div className="border-t border-base-300 bg-white/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col-reverse md:flex-row items-center justify-between gap-2 text-xs text-base-content/60">
          <p className="text-center">© 2026 GlowSkin O2O Platform. Đồ án Hệ thống thông tin.</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 font-medium">
            <Link to="/chinh-sach" className="hover:text-primary">Chính sách & Quy định</Link>
            <Link to="/chinh-sach#hoan-tra" className="hover:text-primary">Hoàn / trả hàng</Link>
            <Link to="/chinh-sach-bao-mat" className="hover:text-primary">Bảo mật dữ liệu</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
