import React from 'react';
import { AlertTriangle, RefreshCw, Banknote, ShieldCheck } from 'lucide-react';

const CONCERNS = [
  {
    id: 1,
    icon: AlertTriangle,
    iconColor: 'text-amber-500 bg-amber-50',
    title: 'Lo lắng trị không hiệu quả hoặc để lại biến chứng',
    desc: 'Nhiều bạn chia sẻ với Bác sĩ những lo lắng về việc điều trị không đạt được kết quả như mong muốn, khiến da tổn thương, mụn trở nặng và để lại sẹo rỗ, vết thâm lâu năm.',
  },
  {
    id: 2,
    icon: RefreshCw,
    iconColor: 'text-sky-500 bg-sky-50',
    title: 'Lo lắng mụn tái phát sau khi ngưng liệu trình',
    desc: 'Tâm lý chung của khách hàng là sợ mụn chỉ hết tạm thời rồi nhanh chóng bùng phát trở lại, khó kiểm soát, phải tốn thêm nhiều thời gian, công sức và tiền bạc để bắt đầu lại từ đầu.',
  },
  {
    id: 3,
    icon: Banknote,
    iconColor: 'text-rose-500 bg-rose-50',
    title: 'Lo lắng bị chèo kéo, tốn kém chi phí không cần thiết',
    desc: 'Tình trạng bị ép mua các gói liệu trình dài ngày, đắt đỏ hoặc sản phẩm không rõ nguồn gốc khiến nhiều người e ngại khi đến các cơ sở điều trị da liễu.',
  },
];

export default function CustomerConcerns() {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-base-100 to-base-200/50">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Tiêu đề chính */}
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <span className="badge badge-primary badge-outline font-semibold mb-3">
            Thấu hiểu làn da
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-secondary leading-tight tracking-tight">
            99% Khách Hàng Tìm Nơi Trị Mụn <br className="hidden sm:inline" />
            <span className="text-primary">Đều Mang Chung Nỗi Lo</span>
          </h2>
          <p className="mt-3 text-base-content/70 text-sm md:text-base">
            GlowSkin hiểu rõ những băn khoăn của bạn trước khi bắt đầu hành trình khôi phục làn da khỏe đẹp.
          </p>
        </div>

        {/* Nội dung: Chia 2 cột (Ảnh chân dung bên trái & Danh sách nỗi lo bên phải) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Cột trái: Hình ảnh chân dung thấu hiểu */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm">
              {/* Vòng nền phát sáng nhẹ */}
              <div className="absolute inset-0 bg-primary/10 rounded-3xl transform -rotate-2 scale-105 filter blur-lg"></div>

              {/* Khung ảnh chính */}
              <div className="relative rounded-3xl overflow-hidden bg-base-100 border border-base-300 shadow-xl">
                <img
                  src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80"
                  alt="Khách hàng lo lắng về làn da mụn"
                  className="w-full h-[420px] object-cover object-top"
                />

                {/* Badge cam kết nổi phía dưới góc ảnh */}
                <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md rounded-2xl p-3.5 border border-white/60 shadow-lg flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Cam kết Chuẩn Y Khoa</h4>
                    <p className="text-[11px] text-slate-500">100% Bác sĩ Da liễu trực tiếp thăm khám</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Cột phải: 3 thẻ thấu hiểu nỗi đau */}
          <div className="lg:col-span-7 space-y-4">
            {CONCERNS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="p-5 md:p-6 rounded-2xl bg-base-100 border border-base-200/80 shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 group"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon đại diện */}
                    <div className={`p-3 rounded-xl shrink-0 ${item.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Nội dung chi tiết */}
                    <div className="space-y-1.5">
                      <h3 className="text-base md:text-lg font-bold text-secondary group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs md:text-sm text-base-content/70 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}