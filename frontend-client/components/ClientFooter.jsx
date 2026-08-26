import React from 'react'

export default function ClientFooter() {
  return (
    <footer className="bg-white border-t border-base-300 mt-12">
      {/* Phần nội dung chính của Footer */}
      <div className="footer p-10 max-w-7xl mx-auto text-base-content">
        <div>
          <span className="footer-title text-primary opacity-100">Dịch vụ O2O</span> 
          <a className="link link-hover">Khám Video Call</a>
          <a className="link link-hover">Khám tại cơ sở</a>
          <a className="link link-hover">Lộ trình chăm sóc da</a>
          <a className="link link-hover">Phân tích da AI</a>
        </div> 
        <div>
          <span className="footer-title text-primary opacity-100">Dược mỹ phẩm</span> 
          <a className="link link-hover">Sản phẩm trị mụn</a>
          <a className="link link-hover">Sản phẩm phục hồi</a>
          <a className="link link-hover">Theo dõi đơn hàng</a>
        </div> 
        <div>
          <span className="footer-title text-primary opacity-100">Chăm sóc khách hàng</span> 
          <a className="link link-hover">Về GlowSkin</a>
          <a className="link link-hover">Hướng dẫn đặt lịch</a>
          <a className="link link-hover">Chính sách đổi trả</a>
        </div> 
        <div>
          <span className="footer-title text-primary opacity-100">Đăng ký nhận ưu đãi</span> 
          <div className="form-control w-80">
            <label className="label">
              <span className="label-text">Nhận phác đồ và mã giảm giá mới nhất</span>
            </label> 
            <div className="relative">
              <input type="text" placeholder="email@gmail.com" className="input input-bordered w-full pr-16" /> 
              <button className="btn btn-primary absolute top-0 right-0 rounded-l-none">Đăng ký</button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Phần bản quyền (Copyright) */}
      <div className="footer footer-center p-4 bg-base-200 text-base-content font-medium">
        <p>© 2026 GlowSkin O2O Platform. Đồ án Hệ thống thông tin.</p>
      </div>
    </footer>
  )
}