import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ClinicStats from './ClinicStats';
import { 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight,
  Plus,
  X,
  Check
} from 'lucide-react';

// Phí khám bác sĩ online (khớp EXAM_FEE ở service-booking)
const ONLINE_EXAM_FEE = 100000;
// Nhóm dịch vụ (theo danh mục trong DB) của 2 lựa chọn trị liệu tại phòng khám
const TIER_CATEGORIES = {
  clinic: ['Trị mụn', 'Phục hồi da', 'Chăm sóc da cơ bản'],
  advanced: ['Trẻ hóa da', 'Trị nám và tàn nhang'],
};
const formatVnd = (n) => Number(n).toLocaleString('vi-VN');

const ADVANTAGES = [
  {
    num: '1',
    icon: Sparkles,
    title: 'Hiệu Quả Từ Khoa Học & AI',
    desc: 'Hệ thống AI Triage sàng lọc tình trạng da chính xác, kết hợp cùng Bác sĩ chuyên khoa đưa ra phác đồ y khoa cá nhân hóa cho từng loại da.',
  },
  {
    num: '2',
    icon: Clock,
    title: 'Tiết Kiệm Thời Gian & Chi Phí',
    desc: 'Đặt lịch hẹn linh hoạt, không mất thời gian chờ đợi. Chi phí liệu trình và sản phẩm minh bạch 100%, không phát sinh hay chèo kéo gói dịch vụ.',
  },
  {
    num: '3',
    icon: ShieldCheck,
    title: 'Giải Pháp Khép Kín O2O',
    desc: 'Kết hợp đồng bộ giữa điều trị chuyên sâu tại phòng khám và routine chăm sóc phục hồi chuẩn y khoa tại nhà qua hệ sinh thái GlowSkin.',
  },
];

const TREATMENT_TIERS = [
  {
    id: 1,
    title: 'Khám Da Liễu & Tư Vấn Online',
    tag: 'Tiện lợi & Nhanh chóng',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80',
    features: [
      'Bác sĩ da liễu soi da & phân tích từ xa qua hình ảnh AI',
      'Kê đơn routine dược mỹ phẩm chính hãng phù hợp ngân sách',
      'Theo dõi tiến triển da trực tuyến định kỳ',
    ],
    target: 'Học sinh, sinh viên, người ở xa hoặc bận rộn',
    actionText: 'Đặt lịch khám online',
    actionLink: '/booking',
  },
  {
    id: 2,
    title: 'Trị Liệu Chuẩn Y Khoa Tại Phòng Khám',
    tag: 'Chuẩn quy trình 14 bước',
    image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
    features: [
      'Lấy nhân mụn chuẩn y khoa 14 bước vô trùng tuyệt đối',
      'Điện di lạnh B5/HA phục hồi nền da tổn thương cấp tốc',
      'Chiếu ánh sáng sinh học Blue/Red Light kháng viêm',
    ],
    target: 'Da mụn viêm, mụn ẩn, da nhạy cảm sau kích ứng',
    actionText: 'Xem các gói dịch vụ',
    actionLink: '/services',
  },
  {
    id: 3,
    title: 'Công Nghệ Cao & Trẻ Hóa Chuyên Sâu',
    tag: 'Phục hồi tầng sâu',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    features: [
      'Peel da sinh học mờ thâm nám và tái sinh biểu bì',
      'Laser Toning chọn lọc xử lý sắc tố và tàn nhang',
      'Cấy vi điểm Meso HA căng bóng, se khít lỗ chân lông',
    ],
    target: 'Da thâm mụn dai dẳng, sẹo rỗ, nám sạm và lão hóa',
    actionText: 'Khám phá liệu trình VIP',
    actionLink: '/services',
  },
];

export default function GlowSkinValueProp() {
  const [showModal, setShowModal] = useState(false);
  // Khoảng giá thật của từng nhóm dịch vụ: { clinic: [min, max], advanced: [min, max] }
  const [priceRanges, setPriceRanges] = useState({});

  useEffect(() => {
    let isMounted = true;
    fetch('http://localhost:4000/api/booking/spa-services')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then(({ data = [] }) => {
        if (!isMounted) return;
        const ranges = {};
        Object.entries(TIER_CATEGORIES).forEach(([tier, categories]) => {
          const prices = data.filter((s) => categories.includes(s.category)).map((s) => Number(s.price));
          if (prices.length) ranges[tier] = [Math.min(...prices), Math.max(...prices)];
        });
        setPriceRanges(ranges);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const renderRange = (tier, highlight) => {
    const range = priceRanges[tier];
    if (!range) return <span className="text-slate-400">Đang cập nhật</span>;
    return (
      <>
        <strong className={highlight ? 'text-primary' : 'text-slate-900'}>
          {range[0] === range[1] ? formatVnd(range[0]) : `${formatVnd(range[0])} - ${formatVnd(range[1])}`}
        </strong> <br />
        <span className="text-[11px] text-slate-500">VNĐ/buổi</span>
      </>
    );
  };

  return (
    <div className="space-y-20 py-10">
      
      {/* KHỐI 1: QUOTE & THỐNG KÊ (STYLE BANNER XANH NAVY) */}
      <section className="container mx-auto px-4 max-w-6xl">
        <div className="bg-[#102A43] text-white rounded-3xl p-8 md:p-14 shadow-2xl relative overflow-hidden">
          <span className="text-8xl md:text-9xl font-serif text-teal-400/20 absolute -top-4 left-6 select-none leading-none">
            “
          </span>

          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-4 mb-10">
            <p className="text-base md:text-lg text-slate-200 font-normal leading-relaxed">
              Thấu hiểu những rào cản và nỗi âu lo khi điều trị da, <strong className="text-teal-300 font-semibold">GlowSkin O2O</strong> kết hợp phân tích thông minh từ AI cùng kinh nghiệm lâm sàng của đội ngũ Bác sĩ chuyên khoa, mang đến giải pháp điều trị cá nhân hóa, chuẩn y khoa và minh bạch nhất.
            </p>
          </div>

          {/* Số liệu thật đếm từ hệ thống */}
          <ClinicStats className="relative z-10" />
        </div>
      </section>

      {/* KHỐI 2: 3 CAM KẾT / LỢI ÍCH VỚI SỐ MỜ (1, 2, 3 WATERMARK) */}
      <section className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-2xl md:text-4xl font-extrabold text-secondary leading-snug">
            GlowSkin Tiên Phong Mô Hình <br />
            <span className="text-primary">"Chăm Sóc Da Liễu O2O Chuẩn Y Khoa"</span>
          </h2>
          <p className="text-sm md:text-base text-base-content/70 mt-3">
            Cam kết 100% khách hàng nhận được 3 giá trị thực chất, xóa bỏ mọi rào cản khi điều trị da mụn và tổn thương.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {ADVANTAGES.map((item) => {
            const IconComponent = item.icon;
            return (
              <div
                key={item.num}
                className="relative bg-base-100 rounded-2xl p-7 border border-base-200 shadow-sm hover:shadow-md transition-all group overflow-hidden"
              >
                <span className="absolute top-2 right-4 text-7xl font-extrabold text-base-content/5 select-none pointer-events-none group-hover:text-primary/10 transition-colors">
                  {item.num}
                </span>

                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <IconComponent className="w-6 h-6" />
                </div>

                <h3 className="text-lg font-bold text-secondary mb-3 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>

                <p className="text-sm text-base-content/70 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* KHỐI 3: 3 LỰA CHỌN PHÁC ĐỒ ĐIỀU TRỊ (ĐỒNG BỘ 100%) */}
      <section className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-2xl md:text-4xl font-extrabold text-secondary">
            3 Lựa Chọn Giải Pháp Để Bất Cứ Ai <br />
            <span className="text-primary">Cũng Sở Hữu Làn Da Khỏe Đẹp</span>
          </h2>
          <p className="text-sm md:text-base text-base-content/70 mt-2">
            Lựa chọn linh hoạt theo cấp độ thương tổn, quỹ thời gian và tài chính của bạn.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TREATMENT_TIERS.map((tier) => (
            <div
              key={tier.id}
              className="rounded-3xl bg-base-100 border border-base-200 shadow-md overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300"
            >
              <div>
                <div className="p-6 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="badge badge-primary badge-outline text-xs font-semibold">
                      {tier.tag}
                    </span>
                    <button className="btn btn-circle btn-ghost btn-xs text-base-content/50">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="text-lg font-bold text-secondary leading-snug min-h-[50px]">
                    {tier.title}
                  </h3>
                </div>

                <div className="h-48 w-full bg-base-200 overflow-hidden relative">
                  <img
                    src={tier.image}
                    alt={tier.title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>

                <div className="p-6 space-y-4">
                  <ul className="space-y-2.5">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs md:text-sm text-base-content/80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-3 border-t border-base-200/80">
                    <div className="text-xs font-semibold text-secondary mb-1">
                      Phù hợp với:
                    </div>
                    <div className="text-xs text-base-content/70">
                      {tier.target}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 pt-0">
                <Link
                  to={tier.actionLink}
                  className="btn btn-sm btn-outline btn-primary w-full rounded-xl gap-2 font-medium"
                >
                  {tier.actionText}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* NÚT XEM SO SÁNH CHI TIẾT */}
        <div className="mt-12 text-center">
          <button
            onClick={() => setShowModal(true)}
            className="px-8 py-3.5 rounded-xl bg-[#102A43] hover:bg-[#1C3D5A] text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-sm tracking-wide"
          >
            Xem so sánh chi tiết
          </button>
        </div>
      </section>

      {/* MODAL POPUP BẢNG SO SÁNH */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="overflow-x-auto p-6 md:p-8">
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-[#102A43] text-white text-center">
                      <th className="p-3.5 md:p-4 text-left font-semibold border-r border-slate-600 w-1/4">
                        Tiêu chí so sánh
                      </th>
                      <th className="p-3.5 md:p-4 font-semibold border-r border-slate-600 w-1/4">
                        Tư Vấn Online <br />
                        <span className="text-[11px] font-normal text-teal-300">(AI + Bác Sĩ từ xa)</span>
                      </th>
                      <th className="p-3.5 md:p-4 font-semibold border-r border-slate-600 w-1/4">
                        Trị Liệu Chuẩn Y Khoa <br />
                        <span className="text-[11px] font-normal text-teal-300">(Tại Phòng Khám O2O)</span>
                      </th>
                      <th className="p-3.5 md:p-4 font-semibold w-1/4">
                        Công Nghệ Cao <br />
                        <span className="text-[11px] font-normal text-teal-300">(Laser & Meso Vi Điểm)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Thời gian phác đồ
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">1 - 2 tháng</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200 font-medium">2 - 3 tháng</td>
                      <td className="p-3 md:p-4 text-center">3 - 4 tháng</td>
                    </tr>

                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Chi phí dự kiến
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <strong className="text-slate-900">{formatVnd(ONLINE_EXAM_FEE)}</strong> <br />
                        <span className="text-[11px] text-slate-500">VNĐ/lượt khám</span>
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        {renderRange('clinic', true)}
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        {renderRange('advanced')}
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Phân tích da thông minh bằng AI
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Kê đơn Dược mỹ phẩm chính hãng
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Chăm sóc & Xử lý y khoa vô trùng
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200 text-slate-300">—</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                      <td className="p-3 md:p-4 text-center">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Xử lý thâm mụn, nám, tàn nhang tầng sâu
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200 text-slate-300">—</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200 text-slate-300">—</td>
                      <td className="p-3 md:p-4 text-center">
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      </td>
                    </tr>

                    <tr className="bg-slate-50/80">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">
                        Đánh giá giải pháp
                      </td>
                      <td className="p-3 md:p-4 border-r border-slate-200 text-xs">
                        <strong>Tiện lợi nhất:</strong> Phù hợp theo dõi từ xa và nhận đơn thuốc giao tận nơi.
                      </td>
                      <td className="p-3 md:p-4 border-r border-slate-200 text-xs">
                        <strong>Được chọn nhiều nhất:</strong> Hiệu quả gom cồi mụn, phục hồi da nhanh, chi phí hợp lý.
                      </td>
                      <td className="p-3 md:p-4 text-xs">
                        <strong>Toàn diện nhất:</strong> Tái sinh tầng sâu, căng bóng da, dứt điểm thâm sạm và lỗ chân lông.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-[11px] md:text-xs text-slate-500 leading-relaxed">
                * <strong>Lưu ý:</strong> Hiệu quả điều trị tùy thuộc vào mức độ thương tổn ban đầu và khả năng tuân thủ routine của từng cá nhân. GlowSkin cam kết đồng hành và minh bạch liệu trình trong suốt quá trình điều trị.
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/booking"
                  onClick={() => setShowModal(false)}
                  className="inline-block px-10 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
                >
                  Đặt Hẹn Tư Vấn
                </Link>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}