import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  CalendarCheck, CalendarX, Video, Receipt, Layers, Truck, PackageX, Undo2, TicketPercent, Star, ShieldCheck, Headphones, ScrollText,
} from 'lucide-react';
import { HOTLINE, HOTLINE_DISPLAY, WORKING_HOURS } from '../utils/contact';

// Các con số dưới đây phải khớp với hằng số trong code server. Sửa ở server thì sửa cả ở đây:
const EXAM_FEE = 100000;           // service-booking appointment.controller EXAM_FEE
const OFFLINE_DEPOSIT = 50000;     // service-booking appointment.controller OFFLINE_DEPOSIT
const PAYMENT_HOLD_MINUTES = 15;   // service-booking PAYMENT_HOLD_MINUTES (mặc định)
const BOOK_AHEAD_DAYS = 30;        // service-booking customerPackage.controller BOOK_AHEAD_DAYS
const VIDEO_CLOSE_AFTER_HOURS = 2; // service-booking video.controller CLOSE_AFTER_MINUTES = 120
const AI_DAILY_LIMIT = 5;          // service-ai-analysis AI_USER_DAILY_LIMIT (mặc định)
const PRIVACY_EMAIL = 'privacy@glowskin.vn';
const IMAGE_RETENTION = '30 ngày kể từ ngày tải lên'; // khớp PhotoConsentModal

const vnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

const SECTIONS = [
  { id: 'dat-lich', icon: CalendarCheck, title: 'Đặt lịch khám & tiền cọc' },
  { id: 'huy-lich', icon: CalendarX, title: 'Hủy, đổi lịch khám' },
  { id: 'kham-online', icon: Video, title: 'Khám trực tuyến' },
  { id: 'thanh-toan', icon: Receipt, title: 'Thanh toán sau buổi khám' },
  { id: 'lieu-trinh', icon: Layers, title: 'Gói liệu trình' },
  { id: 'mua-hang', icon: Truck, title: 'Mua hàng & giao hàng' },
  { id: 'huy-don', icon: PackageX, title: 'Hủy đơn hàng' },
  { id: 'hoan-tra', icon: Undo2, title: 'Hoàn / trả hàng' },
  { id: 'voucher', icon: TicketPercent, title: 'Voucher khuyến mãi' },
  { id: 'danh-gia', icon: Star, title: 'Đánh giá' },
  { id: 'bao-mat', icon: ShieldCheck, title: 'Bảo mật & dữ liệu cá nhân' },
  { id: 'lien-he', icon: Headphones, title: 'Hỗ trợ & khiếu nại' },
];

function Section({ id, children }) {
  const meta = SECTIONS.find((s) => s.id === id);
  const Icon = meta.icon;
  const index = SECTIONS.indexOf(meta) + 1;
  return (
    <section id={id} className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h2 className="flex items-center gap-3 text-lg font-bold text-slate-800 mb-4">
        <span className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
        <span><span className="text-teal-600 mr-1">{index}.</span>{meta.title}</span>
      </h2>
      <div className="space-y-4 text-sm text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}

// Danh sách quy tắc đánh số (dễ trích dẫn khi giải quyết khiếu nại, vd. "mục 8.3")
function Rules({ section, items }) {
  const index = SECTIONS.findIndex((s) => s.id === section) + 1;
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="text-xs font-semibold text-teal-700 bg-teal-50 rounded-md px-1.5 py-0.5 h-fit shrink-0">{index}.{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

const Note = ({ children }) => (
  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">{children}</div>
);

export default function PolicyPage() {
  const location = useLocation();
  const [returnPolicy, setReturnPolicy] = useState(null);

  // Quy định hoàn trả lấy trực tiếp từ server => luôn khớp với bước kiểm tra khi khách gửi yêu cầu
  useEffect(() => {
    axios.get('http://localhost:4000/api/commerce/returns/policy').then((res) => setReturnPolicy(res.data.data)).catch(() => {});
  }, []);

  // /chinh-sach-bao-mat (link trong hộp thoại đồng ý dùng ảnh) hoặc /chinh-sach#muc => cuộn tới mục tương ứng
  useEffect(() => {
    const target = location.pathname === '/chinh-sach-bao-mat' ? 'bao-mat' : location.hash.slice(1);
    if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [location.pathname, location.hash]);

  const returnDays = returnPolicy?.window_days ?? 7;
  const returnReasons = returnPolicy ? Object.values(returnPolicy.reasons) : [];

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="bg-gradient-to-br from-teal-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 text-teal-100 text-sm mb-2"><ScrollText className="w-4 h-4" /> Áp dụng cho mọi khách hàng của GlowSkin Clinic</div>
          <h1 className="text-3xl font-bold mb-2">Chính sách & Quy định</h1>
          <p className="text-teal-50 max-w-2xl text-sm">
            Các quy định dưới đây được hệ thống áp dụng tự động khi bạn đặt lịch, thanh toán, mua hàng và gửi yêu cầu hỗ trợ.
            Khi sử dụng dịch vụ của GlowSkin, bạn đồng ý với các chính sách này.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-[240px_1fr] gap-8">
        {/* Mục lục */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase px-2 mb-2">Mục lục</p>
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-teal-50 hover:text-teal-700">
                <span className="text-xs text-slate-400 w-4">{i + 1}</span> {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="space-y-6 min-w-0">
          <Section id="dat-lich">
            <Rules section="dat-lich" items={[
              <>Phí khám bác sĩ là <b>{vnd(EXAM_FEE)}</b>/lần. Mỗi lịch khám gắn với một <b>hồ sơ người khám</b> thuộc tài khoản của bạn (bản thân hoặc người thân).</>,
              <><b>Khám tại phòng khám:</b> đặt cọc <b>{vnd(OFFLINE_DEPOSIT)}</b>. Tiền cọc được trừ vào phí khám khi thanh toán hóa đơn sau buổi khám.</>,
              <><b>Khám trực tuyến:</b> thanh toán trước toàn bộ phí khám <b>{vnd(EXAM_FEE)}</b>.</>,
              <><b>Hồ sơ đã từng khám</b> (đã có lịch khám được thanh toán / phục vụ) được <b>miễn tiền cọc và miễn phí khám</b>. Ưu đãi xét theo từng hồ sơ người khám: người thân khám lần đầu vẫn phải đặt cọc. Lịch đã hủy hoặc chưa thanh toán không được tính.</>,
              <>Sau khi bấm đặt lịch, khung giờ được <b>giữ trong {PAYMENT_HOLD_MINUTES} phút</b> để bạn chuyển khoản. Quá thời gian này hoặc rời trang thanh toán mà chưa trả tiền, lịch bị hủy và khung giờ được trả lại cho người khác.</>,
              <>Thanh toán bằng chuyển khoản VietQR, hệ thống tự xác nhận khi nhận được tiền. Nếu nộp tiền mặt tại quầy, nhân viên xác nhận cho bạn.</>,
              <>Chỉ đặt được giờ trong tương lai, đúng ca làm việc của bác sĩ (sáng 08:00 - 11:00, chiều 13:00 - 16:00; mỗi lượt khám 1 giờ) và chưa có người khác đặt.</>,
            ]} />
          </Section>

          <Section id="huy-lich">
            <Rules section="huy-lich" items={[
              <>Bạn tự hủy được lịch <b>chưa khám</b> (chờ xác nhận, đã xác nhận, cần xếp lại lịch) ngay trong mục Sổ lịch khám. Lịch khám trực tuyến đã thanh toán tự hủy được trước giờ khám.</>,
              <>Lịch đã đặt cọc mà bị hủy trước khi khám thì <b>mất 100% tiền cọc</b>, dù bạn tự hủy trên website hay nhờ CSKH hủy hộ. Với lịch khám trực tuyến, khoản mất là toàn bộ phí khám {vnd(EXAM_FEE)} đã trả trước. Hệ thống yêu cầu bạn xác nhận số tiền cọc bị mất trước khi hủy.</>,
              <>Trường hợp <b>phòng khám chủ động hủy lịch</b> (bác sĩ vắng, sự cố...), bạn được <b>hoàn lại 100% tiền cọc</b>. Lý do hủy và số tiền được hoàn hiển thị trong Sổ lịch khám; vui lòng liên hệ CSKH để cung cấp tài khoản nhận tiền. Khi chuyển khoản xong, mã giao dịch hoàn tiền được cập nhật vào lịch của bạn.</>,
              <>Lịch đã check-in, đang khám hoặc đã khám xong <b>không thể hủy</b>.</>,
              <>Đổi ngày, giờ hoặc bác sĩ do nhân viên CSKH thực hiện; khung giờ mới cũng phải đúng ca làm và chưa có người đặt.</>,
            ]} />
          </Section>

          <Section id="kham-online">
            <Rules section="kham-online" items={[
              <>Phòng khám video mở cho bạn <b>từ đúng giờ hẹn</b> và đóng sau <b>{VIDEO_CLOSE_AFTER_HOURS} giờ</b> kể từ giờ hẹn. Chỉ bạn và bác sĩ phụ trách lịch đó được vào phòng.</>,
              <>Vui lòng chuẩn bị nơi đủ sáng, mạng ổn định và cho phép trình duyệt dùng camera, micro.</>,
              <>Bác sĩ chỉ tư vấn dựa trên thông tin và hình ảnh trong buổi khám. Các trường hợp cần soi da, làm thủ thuật sẽ được hẹn khám tại phòng khám.</>,
            ]} />
          </Section>

          <Section id="thanh-toan">
            <Rules section="thanh-toan" items={[
              <>Sau buổi khám, nhân viên tư vấn lập hóa đơn gồm: phí khám + dịch vụ, gói liệu trình, mỹ phẩm bạn đồng ý sử dụng. Giá lấy theo bảng giá hiện hành của hệ thống.</>,
              <>Số tiền cần trả = tổng hóa đơn − voucher (nếu có) − tiền cọc đã trả. Tiền cọc chỉ được trừ một lần.</>,
              <>Mỹ phẩm mua tại quầy được ghi thành đơn hàng trong mục Đơn hàng Mỹ phẩm của bạn (đã thanh toán, nhận ngay tại phòng khám).</>,
              <>Dịch vụ lẻ và buổi đầu tiên của gói liệu trình được xếp kỹ thuật viên thực hiện <b>ngay trong ngày</b> thanh toán.</>,
            ]} />
          </Section>

          <Section id="lieu-trinh">
            <Note>Gói liệu trình <b>chỉ được bán sau khi bác sĩ khám và chỉ định</b>, để đảm bảo phù hợp với tình trạng da. Bạn có thể xem trước các gói tại trang <Link to="/goi-lieu-trinh" className="underline font-semibold">Gói liệu trình</Link>.</Note>
            <Rules section="lieu-trinh" items={[
              <>Giá gói áp dụng giá ưu đãi (nếu có) tại thời điểm thanh toán. Mỗi gói có số buổi, khoảng cách tối thiểu giữa các buổi và thời hạn sử dụng được ghi rõ.</>,
              <><b>Thời hạn sử dụng tính từ ngày mua.</b> Gói hết hạn thì không đặt thêm buổi được nữa.</>,
              <>Buổi 1 thực hiện ngay ngày mua. Các buổi sau bạn tự đặt trong mục Gói liệu trình của tôi, với điều kiện:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>cách buổi trước ít nhất số ngày quy định của gói;</li>
                  <li>đặt trước tối đa {BOOK_AHEAD_DAYS} ngày và không quá ngày hết hạn của gói;</li>
                  <li>chỉ có <b>một buổi chưa thực hiện</b> tại một thời điểm (làm xong buổi đang đặt mới đặt được buổi tiếp theo);</li>
                  <li>chỉ chọn được ngày có kỹ thuật viên trực; hệ thống tự phân công kỹ thuật viên.</li>
                </ul>
              </>,
              <>Bạn hủy được buổi đã đặt khi buổi đó chưa bắt đầu và chưa qua ngày hẹn, để đặt lại ngày khác. Buổi đã qua ngày, vui lòng liên hệ CSKH.</>,
              <>Các buổi của gói dùng cho đúng hồ sơ người khám đã được bác sĩ chỉ định, không chuyển cho người khác.</>,
            ]} />
          </Section>

          <Section id="mua-hang">
            <Rules section="mua-hang" items={[
              <>Thanh toán: <b>khi nhận hàng (COD)</b> hoặc <b>chuyển khoản VietQR</b>. Đơn chuyển khoản chỉ được duyệt sau khi hệ thống nhận được tiền.</>,
              <>Phí vận chuyển do Giao Hàng Nhanh (GHN) tính theo địa chỉ và cân nặng đơn hàng, hệ thống tự tính lại khi đặt. Đơn COD: shipper thu tiền hàng sau giảm giá cộng phí vận chuyển.</>,
              <>Đơn hàng đi qua các bước: <b>Chờ duyệt → Đã duyệt → Đang đóng gói → Đang giao → Đã nhận</b>. Mã vận đơn GHN có khi đơn chuyển sang Đang giao.</>,
              <>Khi nhận hàng, bạn <b>được kiểm tra hàng nhưng không được dùng thử</b>. Nên quay video lúc mở hộp để làm bằng chứng nếu cần hoàn trả.</>,
              <>Đặt hàng chỉ thành công khi kho còn đủ số lượng; sản phẩm hết hàng sẽ báo ngay lúc đặt.</>,
            ]} />
          </Section>

          <Section id="huy-don">
            <Rules section="huy-don" items={[
              <>Bạn không tự hủy đơn trên website. Liên hệ hotline / nhân viên bán hàng để được hủy.</>,
              <>Đơn chỉ hủy được khi <b>chưa giao thành công</b>. Đơn đang giao chỉ hủy được nếu GHN chấp nhận hủy vận đơn.</>,
              <>Đơn đã chuyển khoản khi bị hủy sẽ được hoàn tiền. Voucher đã dùng cho đơn <b>không được trả lại lượt sử dụng</b>.</>,
              <>GHN giao không thành công và chuyển hàng về kho thì đơn tự động bị hủy.</>,
            ]} />
          </Section>

          <Section id="hoan-tra">
            <Rules section="hoan-tra" items={[
              <>Áp dụng cho đơn <b>giao qua GHN đã nhận hàng</b>, gửi yêu cầu trong <b>{returnDays} ngày</b> kể từ khi đơn chuyển sang Đã nhận. Đơn mua tại quầy, vui lòng mang sản phẩm đến phòng khám.</>,
              <>Chỉ chấp nhận các lý do sau{returnReasons.length ? ':' : '.'}
                {returnReasons.length > 0 && <ul className="list-disc pl-5 mt-1 space-y-0.5">{returnReasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                <span className="block mt-1"><b>Không nhận trả hàng vì đổi ý</b>, vì mỹ phẩm là sản phẩm dùng cho cá nhân.</span>
              </>,
              <>Hồ sơ yêu cầu bắt buộc: chọn sản phẩm và số lượng trả (không vượt số đã mua), mô tả tình trạng ít nhất 20 ký tự, 1 - {returnPolicy?.max_images ?? 5} ảnh chụp sản phẩm, tài khoản ngân hàng nhận hoàn tiền.</>,
              <>Sản phẩm trả phải còn đủ hộp, tem, phụ kiện và chưa qua sử dụng (trừ lỗi chỉ phát hiện được khi mở).</>,
              <><b>Mỗi đơn chỉ được yêu cầu hoàn trả một lần.</b> Yêu cầu bị từ chối không được gửi lại. Bạn được hủy yêu cầu khi nhân viên chưa duyệt, và gửi lại nếu còn trong thời hạn.</>,
              <>Quy trình: nhân viên duyệt hồ sơ (phản hồi trong 24 giờ làm việc) → GHN đến lấy hàng tại địa chỉ nhận hàng của đơn, <b>GlowSkin trả phí vận chuyển</b> → kho nhận và kiểm tra → hoàn tiền qua chuyển khoản.</>,
              <><b>Số tiền hoàn</b> = giá các sản phẩm trả lại − phần voucher đã giảm tương ứng (chia theo tỷ lệ giá trị). Trả lại toàn bộ đơn thì được hoàn thêm phí vận chuyển ban đầu. Voucher đã dùng không được hoàn lại.</>,
              <>Hàng nhận về không đúng mô tả, thiếu số lượng hoặc không đạt điều kiện ở mục {SECTIONS.findIndex((s) => s.id === 'hoan-tra') + 1}.4, yêu cầu sẽ bị từ chối và nhân viên liên hệ để gửi trả lại hàng cho bạn.</>,
            ]} />
          </Section>

          <Section id="voucher">
            <Rules section="voucher" items={[
              <>Mỗi đơn hàng / hóa đơn chỉ áp dụng <b>một mã</b>. Mỗi khách hàng chỉ dùng mỗi mã <b>một lần</b>.</>,
              <>Mã phải còn trong thời gian áp dụng và còn lượt sử dụng. Lượt được tính ngay khi đơn / hóa đơn được tạo thành công.</>,
              <>Mỗi mã có phạm vi riêng: toàn bộ đơn, dịch vụ spa, sản phẩm hoặc gói liệu trình. Giá trị đơn tối thiểu và số tiền giảm chỉ tính trên phần thuộc phạm vi của mã.</>,
              <>Mã giảm theo % có thể có mức giảm tối đa. Số tiền giảm không vượt quá phần tiền thuộc phạm vi và không trừ vào phí vận chuyển.</>,
              <>Voucher đã dùng không được hoàn lại khi đơn bị hủy hoặc hoàn trả.</>,
            ]} />
          </Section>

          <Section id="danh-gia">
            <Rules section="danh-gia" items={[
              <>Chỉ khách đã sử dụng mới được đánh giá: sản phẩm sau khi đơn ở trạng thái Đã nhận; bác sĩ sau buổi khám hoàn tất; dịch vụ / buổi liệu trình sau khi buổi đó hoàn thành.</>,
              <>Mỗi sản phẩm trong một đơn, mỗi buổi khám, mỗi buổi dịch vụ được đánh giá <b>một lần</b>: 1 - 5 sao, nhận xét tối đa 1000 ký tự.</>,
              <>GlowSkin có quyền ẩn đánh giá chứa nội dung xúc phạm, quảng cáo, thông tin cá nhân của người khác hoặc không liên quan đến dịch vụ.</>,
            ]} />
          </Section>

          <Section id="bao-mat">
            <Rules section="bao-mat" items={[
              <><b>Dữ liệu thu thập:</b> thông tin tài khoản (email, họ tên, số điện thoại), hồ sơ người khám, lịch sử khám và ghi chú của bác sĩ, địa chỉ giao hàng, ảnh da bạn tải lên.</>,
              <><b>Mục đích:</b> đặt lịch, khám và điều trị, giao hàng, thanh toán, chăm sóc sau điều trị. GlowSkin không bán hoặc dùng dữ liệu của bạn cho mục đích quảng cáo của bên thứ ba.</>,
              <><b>Bên xử lý được chia sẻ dữ liệu cần thiết:</b> Cloudinary (lưu ảnh), Roboflow (phân tích ảnh da), Giao Hàng Nhanh (họ tên, số điện thoại, địa chỉ nhận hàng), SePay (đối soát chuyển khoản).</>,
              <><b>Ảnh da cho sàng lọc AI:</b> chỉ phân tích khi bạn đồng ý chính sách sử dụng hình ảnh; hệ thống lưu phiên bản chính sách và thời điểm bạn đồng ý. Việc cho phép dùng ảnh để cải thiện mô hình là lựa chọn riêng, mặc định không cho phép. Ảnh và kết quả được lưu trong {IMAGE_RETENTION}.</>,
              <>Kết quả sàng lọc AI <b>chỉ mang tính tham khảo</b>, không thay thế chẩn đoán của bác sĩ da liễu. Mỗi tài khoản được phân tích tối đa {AI_DAILY_LIMIT} lượt / ngày.</>,
              <>Hồ sơ khám và ảnh của bạn chỉ nhân sự được phân quyền (bác sĩ, tư vấn viên, kỹ thuật viên phụ trách) mới xem được.</>,
              <>Bạn có quyền yêu cầu xem, chỉnh sửa hoặc xóa dữ liệu cá nhân và rút lại sự đồng ý sử dụng ảnh qua email <a href={`mailto:${PRIVACY_EMAIL}`} className="text-teal-600 underline">{PRIVACY_EMAIL}</a>.</>,
            ]} />
          </Section>

          <Section id="lien-he">
            <Rules section="lien-he" items={[
              <>Hotline: <a href={`tel:${HOTLINE}`} className="text-teal-600 font-semibold">{HOTLINE_DISPLAY}</a> ({WORKING_HOURS}). Bạn cũng có thể nhắn tin cho nhân viên tư vấn ngay trên website.</>,
              <>Khi khiếu nại, vui lòng cung cấp mã đơn hàng / mã lịch khám và số mục chính sách liên quan (ví dụ: mục 8.3) để được xử lý nhanh.</>,
              <>GlowSkin có thể cập nhật chính sách; các quy định mới áp dụng cho đơn hàng và lịch khám phát sinh sau thời điểm cập nhật.</>,
            ]} />
          </Section>
        </main>
      </div>
    </div>
  );
}
