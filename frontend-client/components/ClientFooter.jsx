import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, MapPin, Phone, Mail, Clock } from 'lucide-react';

export default function ClientFooter() {
  return (
    <footer className="bg-white border-t border-base-300 mt-16">
      {/* Phần nội dung chính của Footer */}
      <div className="footer p-10 max-w-7xl mx-auto text-base-content">
        
        {/* Cột 1: Dịch vụ O2O */}
        <div>
          <span className="footer-title text-primary opacity-100 font-bold">Dịch vụ O2O</span> 
          <Link to="/sang-loc-da" className="link link-hover">Sàng lọc da AI</Link>
          <Link to="/booking" className="link link-hover">Khám Bác sĩ online</Link>
          <Link to="/services" className="link link-hover">Trị liệu tại phòng khám</Link>
          <Link to="/reviews" className="link link-hover">Đánh giá khách hàng</Link>
        </div> 

        {/* Cột 2: Dược mỹ phẩm & Ưu đãi */}
        <div>
          <span className="footer-title text-primary opacity-100 font-bold">Dược mỹ phẩm</span> 
          <Link to="/services" className="link link-hover">Gói liệu trình chuyên sâu</Link>
          <Link to="/promotions" className="link link-hover">Voucher & Khuyến mãi</Link>
          <Link to="/news" className="link link-hover">Kiến thức chuẩn Da liễu</Link>
          <Link to="/profile" className="link link-hover">Hồ sơ & Đơn hàng của tôi</Link>
        </div> 

        {/* Cột 3: Về GlowSkin Clinic */}
        <div>
          <span className="footer-title text-primary opacity-100 font-bold">Về GlowSkin Clinic</span> 
          <div className="flex items-start gap-2 text-xs text-base-content/70 max-w-[220px]">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>343/5F Tô Hiến Thành, P.12, Q.10, TP.HCM</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/70">
            <Phone className="w-4 h-4 text-primary shrink-0" />
            <span>Hotline: 1900 63 68 83</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-base-content/70">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <span>08:30 - 20:00 (Hàng ngày)</span>
          </div>
        </div> 

        {/* Cột 4: Đăng ký nhận phác đồ & voucher */}
        <div>
          <span className="footer-title text-primary opacity-100 font-bold">Đăng ký nhận ưu đãi</span> 
          <div className="form-control w-full sm:w-80">
            <label className="label py-1">
              <span className="label-text text-xs text-base-content/70">Nhận phác đồ và mã voucher mới nhất</span>
            </label> 
            <div className="relative">
              <input 
                type="email" 
                placeholder="email@gmail.com" 
                className="input input-bordered input-sm w-full pr-20 rounded-lg" 
              /> 
              <button className="btn btn-primary btn-sm absolute top-0 right-0 rounded-l-none rounded-r-lg text-white">
                Đăng ký
              </button>
            </div>
          </div>
        </div>

      </div>
      
      {/* Phần bản quyền (Copyright) */}
      <div className="footer footer-center p-4 bg-base-200 text-base-content/70 text-xs font-medium border-t border-base-300">
        <p>© 2026 GlowSkin O2O Platform. Đồ án Hệ thống thông tin.</p>
      </div>
    </footer>
  );
}