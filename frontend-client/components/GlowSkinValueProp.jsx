import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ClinicStats from './ClinicStats';
import { 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight,
  X,
  Check
} from 'lucide-react';

import { SERVICE_GROUPS } from '../utils/serviceGroups';
import { CONSULT_DEPOSIT } from '../utils/consult';

// Phí khám bác sĩ (khớp EXAM_FEE ở service-booking)
const ONLINE_EXAM_FEE = 100000;
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

// 3 lựa chọn: thẻ 1 là các kênh online (nội dung cố định, đúng chức năng hệ thống);
// thẻ 2, 3 lấy dịch vụ + giá thật từ DB theo nhóm. Dịch vụ do bác sĩ chỉ định sau khi khám.
const TREATMENT_TIERS = [
  {
    id: 'online',
    title: 'Khám & Tư Vấn Online',
    tag: 'Không cần đến phòng khám',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80',
    features: [
      `Khám online qua video call với bác sĩ da liễu – ${formatVnd(ONLINE_EXAM_FEE)}đ/lượt`,
      `Tư vấn chuyên gia da liễu, dinh dưỡng, mỹ phẩm – cọc ${formatVnd(CONSULT_DEPOSIT)}đ, được trừ vào phí khám`,
      'Sàng lọc da bằng AI miễn phí trước khi quyết định đặt lịch',
    ],
    target: 'Người bận rộn, ở xa, hoặc muốn hỏi ý kiến trước khi đến phòng khám',
    actionText: 'Đặt lịch khám online',
    actionLink: '/booking',
    secondary: { text: 'Đặt lịch tư vấn chuyên gia', link: '/tu-van' },
  },
  {
    id: 'tai-phong-kham',
    title: 'Trị Liệu Chuẩn Y Khoa Tại Phòng Khám',
    tag: 'Thủ thuật tại phòng khám',
    image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&auto=format&fit=crop&q=80',
    target: 'Da mụn viêm, mụn ẩn, thâm và sẹo sau mụn, da kích ứng cần phục hồi',
    actionText: 'Xem dịch vụ trị mụn & phục hồi',
  },
  {
    id: 'cong-nghe-cao',
    title: 'Công Nghệ Cao: Nám, Tàn Nhang & Trẻ Hoá',
    tag: 'Thiết bị chuyên dụng',
    image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    target: 'Nám, tàn nhang, sạm màu, da chảy xệ và lão hoá',
    actionText: 'Xem dịch vụ công nghệ cao',
  },
];

export default function GlowSkinValueProp() {
  const [showModal, setShowModal] = useState(false);
  // Dịch vụ thật của từng nhóm (sắp theo giá) và khoảng giá: { [nhóm]: { services: [...], range: [min, max] } }
  const [groups, setGroups] = useState({});

  useEffect(() => {
    let isMounted = true;
    fetch('http://localhost:4000/api/booking/spa-services')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then(({ data = [] }) => {
        if (!isMounted) return;
        const result = {};
        Object.entries(SERVICE_GROUPS).forEach(([key, g]) => {
          const services = data.filter((s) => g.categories.includes(s.category)).sort((a, b) => Number(a.price) - Number(b.price));
          const prices = services.map((s) => Number(s.price));
          if (services.length) result[key] = { services, range: [Math.min(...prices), Math.max(...prices)] };
        });
        setGroups(result);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const renderRange = (tier, highlight) => {
    const range = groups[tier]?.range;
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
          {TREATMENT_TIERS.map((tier) => {
            // Thẻ dịch vụ: 3 dịch vụ thật đầu tiên của nhóm (kèm giá) + số dịch vụ còn lại
            const group = groups[tier.id];
            const features = tier.features || (group
              ? group.services.slice(0, 3).map((s) => `${s.name} – ${formatVnd(s.price)}đ/buổi`)
              : ['Đang tải danh sách dịch vụ...']);
            const more = group ? group.services.length - 3 : 0;
            const actionLink = tier.actionLink || `/services?nhom=${tier.id}`;
            return (
            <div
              key={tier.id}
              className="rounded-3xl bg-base-100 border border-base-200 shadow-md overflow-hidden flex flex-col justify-between hover:shadow-xl transition-all duration-300"
            >
              <div>
                <div className="p-6 pb-4">
                  <div className="mb-2">
                    <span className="badge badge-primary badge-outline text-xs font-semibold">
                      {tier.tag}
                    </span>
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
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs md:text-sm text-base-content/80">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {more > 0 && <li className="text-xs text-base-content/60 pl-6">và {more} dịch vụ khác</li>}
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

              <div className="p-6 pt-0 space-y-2">
                <Link
                  to={actionLink}
                  className="btn btn-sm btn-outline btn-primary w-full rounded-xl gap-2 font-medium"
                >
                  {tier.actionText}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                {tier.secondary ? (
                  <Link to={tier.secondary.link} className="block text-center text-xs link link-primary">{tier.secondary.text}</Link>
                ) : (
                  <p className="text-center text-xs text-base-content/60">
                    Bác sĩ chỉ định dịch vụ phù hợp sau buổi khám · <Link to="/booking" className="link link-primary">Đặt lịch khám</Link>
                  </p>
                )}
              </div>
            </div>
            );
          })}
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
                        Khám & Tư Vấn Online <br />
                        <span className="text-[11px] font-normal text-teal-300">(Video call với bác sĩ / chuyên gia)</span>
                      </th>
                      <th className="p-3.5 md:p-4 font-semibold border-r border-slate-600 w-1/4">
                        Trị Liệu Chuẩn Y Khoa <br />
                        <span className="text-[11px] font-normal text-teal-300">(Tại phòng khám)</span>
                      </th>
                      <th className="p-3.5 md:p-4 font-semibold w-1/4">
                        Công Nghệ Cao <br />
                        <span className="text-[11px] font-normal text-teal-300">(Laser, Peel, Meso, RF)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">Chi phí</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">
                        <strong className="text-slate-900">{formatVnd(ONLINE_EXAM_FEE)}</strong> <br />
                        <span className="text-[11px] text-slate-500">VNĐ/lượt khám</span> <br />
                        <span className="text-[11px] text-slate-500">Tư vấn chuyên gia: cọc {formatVnd(CONSULT_DEPOSIT)}đ</span>
                      </td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">{renderRange('tai-phong-kham', true)}</td>
                      <td className="p-3 md:p-4 text-center">{renderRange('cong-nghe-cao')}</td>
                    </tr>
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">Số dịch vụ hiện có</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200 text-slate-300">—</td>
                      <td className="p-3 md:p-4 text-center border-r border-slate-200">{groups['tai-phong-kham']?.services.length ?? '—'}</td>
                      <td className="p-3 md:p-4 text-center">{groups['cong-nghe-cao']?.services.length ?? '—'}</td>
                    </tr>
                    {[
                      ['Gặp bác sĩ da liễu', [true, true, true]],
                      ['Kê đơn dược mỹ phẩm', [true, true, true]],
                      ['Thủ thuật trị liệu trực tiếp trên da', [false, true, true]],
                      ['Xử lý nám, tàn nhang, lão hoá bằng thiết bị chuyên dụng', [false, false, true]],
                    ].map(([label, cols]) => (
                      <tr key={label} className="hover:bg-slate-50/60">
                        <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">{label}</td>
                        {cols.map((ok, i) => (
                          <td key={i} className={`p-3 md:p-4 text-center ${i < 2 ? 'border-r border-slate-200' : ''} ${ok ? '' : 'text-slate-300'}`}>
                            {ok ? <Check className="w-5 h-5 text-emerald-500 mx-auto" /> : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-slate-50/80">
                      <td className="p-3 md:p-4 font-semibold text-slate-900 border-r border-slate-200">Cách bắt đầu</td>
                      <td className="p-3 md:p-4 border-r border-slate-200 text-xs">Đặt lịch khám online hoặc tư vấn chuyên gia, vào phòng video đúng giờ hẹn.</td>
                      <td className="p-3 md:p-4 border-r border-slate-200 text-xs">Đặt lịch khám trực tiếp. Bác sĩ khám và chỉ định dịch vụ / gói liệu trình phù hợp.</td>
                      <td className="p-3 md:p-4 text-xs">Đặt lịch khám trực tiếp. Bác sĩ đánh giá mức độ nám, lão hoá trước khi chỉ định công nghệ.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-[11px] md:text-xs text-slate-500 leading-relaxed">
                * <strong>Lưu ý:</strong> Giá dịch vụ lấy trực tiếp từ bảng giá hiện hành của phòng khám. Dịch vụ và số buổi điều trị do bác sĩ chỉ định sau khi khám, tuỳ mức độ tổn thương của từng người.
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/booking"
                  onClick={() => setShowModal(false)}
                  className="inline-block px-10 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
                >
                  Đặt Lịch Khám
                </Link>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}