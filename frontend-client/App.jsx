import React from 'react'

// Import components
import ClientNavbar from './components/ClientNavbar'
import ServiceCard from './components/ServiceCard'
import ClientFooter from './components/ClientFooter'

export default function App() {
  return (
    <div data-theme="cupcake" className="min-h-screen bg-base-200 font-sans">
      <ClientNavbar />

      <div className="hero min-h-[40vh] bg-base-100">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-4xl font-bold">Làn da hoàn hảo bắt đầu từ đây</h1>
            <p className="py-6">Trải nghiệm công nghệ AI phân tích da mặt độc quyền.</p>
            <button className="btn btn-primary rounded-full px-8 shadow-lg">Phân tích ngay</button>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6 mt-8">
        <h2 className="text-2xl font-bold text-center mb-8">Dịch vụ nổi bật</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Tái sử dụng Component bằng cách truyền Props */}
          <ServiceCard 
            image="https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500&q=80"
            title="Khám Video Call"
            description="Tư vấn 1-1 với Bác sĩ chuyên khoa tại nhà."
            buttonText="Đặt lịch hẹn"
          />
          <ServiceCard 
            image="https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=500&q=80"
            title="Dược Mỹ Phẩm"
            description="Sản phẩm chính hãng theo phác đồ cá nhân hóa."
            buttonText="Mua sắm"
          />
        </div>
      </div>
      <ClientFooter />
    </div>
  )
}