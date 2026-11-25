// Mẫu email gửi khách (tiếng Việt, HTML đơn giản để hiển thị tốt trên Gmail / điện thoại).
// Nguyên tắc: email chỉ báo sự kiện + link về website, KHÔNG chứa chẩn đoán / kết quả y tế (email dễ bị người khác đọc).
// Mỗi mẫu: { kind: 'security' | 'transaction' | 'reminder', sensitive: [trường không lưu vào nhật ký], build(ctx) => { subject, title, lines, cta } }
// ctx: { name, data, people: { [userId]: { name, title } }, patients: { [id]: { name, relationship } }, clinic, link(path) }

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const day = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); const w = new Date(Number(y), Number(m) - 1, Number(dd)).getDay(); return `${WEEKDAY[w]}, ${dd}/${m}/${y}`; };
const hm = (t) => String(t || '').slice(0, 5);
const code = (id) => String(id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
const doctorName = (ctx, id) => { const d = ctx.people[id]; return d ? `${d.title ? `${d.title} ` : ''}${d.name}` : 'Bác sĩ của phòng khám'; };
const forPatient = (ctx, id) => { const p = ctx.patients[id]; return p && p.relationship && p.relationship !== 'Bản thân' ? ` cho ${esc(p.name)} (${esc(p.relationship)})` : ''; };
const row = (label, value) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;color:#111827"><b>${value}</b></td></tr>`;
const table = (rows) => `<table role="presentation" style="border-collapse:collapse;margin:8px 0 4px;font-size:14px">${rows.join('')}</table>`;
const p = (html) => `<p style="margin:10px 0;line-height:1.55">${html}</p>`;
const note = (html) => `<p style="margin:12px 0;padding:10px 12px;background:#f0fdfa;border-left:3px solid #14b8a6;font-size:13px;line-height:1.5;color:#134e4a">${html}</p>`;
const warn = (html) => `<p style="margin:12px 0;padding:10px 12px;background:#fff7ed;border-left:3px solid #f97316;font-size:13px;line-height:1.5;color:#7c2d12">${html}</p>`;
const examPlace = (ctx, online) => (online ? 'Khám online qua video' : `Tại phòng khám${ctx.clinic.address ? ` - ${esc(ctx.clinic.address)}` : ''}`);
const onlineHow = 'Đến giờ khám, đăng nhập website → <b>Sổ lịch khám</b> → bấm <b>Vào phòng khám online</b>. Nên dùng điện thoại / máy tính có camera, nơi đủ sáng để bác sĩ quan sát da.';
const clinicHow = 'Vui lòng đến trước giờ hẹn khoảng 10 phút để CSKH tiếp nhận. Không trang điểm vùng da cần khám.';

const T = {
  OTP_RESET: {
    kind: 'security', sensitive: ['otp'],
    build: (ctx) => ({
      subject: `${ctx.data.otp} là mã đặt lại mật khẩu GlowSkin`,
      title: 'Mã đặt lại mật khẩu',
      lines: [
        p('Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản GlowSkin bằng email này. Mã xác nhận của bạn:'),
        `<p style="margin:16px 0;font-size:30px;letter-spacing:8px;font-weight:bold;color:#0f766e;text-align:center">${esc(ctx.data.otp)}</p>`,
        p(`Mã có hiệu lực <b>${esc(ctx.data.minutes || 15)} phút</b> và chỉ dùng được 1 lần. Nhập sai quá 5 lần thì cần yêu cầu mã mới.`),
        warn('Không chia sẻ mã này cho bất kỳ ai, kể cả nhân viên GlowSkin. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này, mật khẩu hiện tại vẫn giữ nguyên.'),
      ],
    }),
  },
  PASSWORD_CHANGED: {
    kind: 'security',
    build: (ctx) => ({
      subject: 'Mật khẩu tài khoản GlowSkin vừa được thay đổi',
      title: 'Mật khẩu đã được thay đổi',
      lines: [
        p(`Mật khẩu tài khoản GlowSkin của bạn đã được đặt lại lúc <b>${esc(ctx.data.at)}</b>.`),
        warn(`Nếu không phải bạn thực hiện, hãy dùng chức năng <b>Quên mật khẩu</b> để đặt lại ngay và gọi hotline ${esc(ctx.clinic.hotline)}.`),
      ],
      cta: { label: 'Đăng nhập', path: '/login' },
    }),
  },
  APPOINTMENT_BOOKED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: `Xác nhận lịch khám ${hm(d.time)} ${day(d.date)}`,
        title: 'Đặt lịch khám thành công',
        lines: [
          p(`GlowSkin đã nhận lịch khám${forPatient(ctx, d.patient_profile_id)} của bạn.`),
          table([
            row('Mã lịch', code(d.appointment_id)),
            row('Thời gian', `${hm(d.time)} - ${day(d.date)}`),
            row('Bác sĩ', esc(doctorName(ctx, d.doctor_id))),
            row('Hình thức', examPlace(ctx, d.online)),
            ...(Number(d.paid) > 0 ? [row(d.online ? 'Đã thanh toán' : 'Đã đặt cọc', money(d.paid))] : [row('Phí khám', 'Miễn phí (khách đã từng khám)')]),
          ]),
          note(d.online ? onlineHow : clinicHow),
          p('Cần đổi giờ? Bạn được tự đổi lịch 1 lần trước giờ khám ít nhất 24 giờ tại <b>Sổ lịch khám</b>. Quy định hủy lịch và tiền cọc xem tại trang Chính sách.'),
        ],
        cta: { label: 'Xem sổ lịch khám', path: '/appointments' },
      };
    },
  },
  APPOINTMENT_RESCHEDULED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: `Lịch khám đã đổi sang ${hm(d.time)} ${day(d.date)}`,
        title: 'Lịch khám đã được đổi',
        lines: [
          p(d.by === 'CUSTOMER' ? 'Bạn vừa đổi lịch khám thành công.' : `Theo trao đổi với CSKH, lịch khám${forPatient(ctx, d.patient_profile_id)} của bạn đã được đổi.`),
          table([
            row('Mã lịch', code(d.appointment_id)),
            row('Lịch cũ', `<s style="color:#9ca3af">${hm(d.old_time)} - ${day(d.old_date)}</s>`),
            row('Lịch mới', `${hm(d.time)} - ${day(d.date)}`),
            row('Bác sĩ', esc(doctorName(ctx, d.doctor_id))),
            row('Hình thức', examPlace(ctx, d.online)),
          ]),
          ...(d.note ? [p(`Ghi chú: ${esc(d.note)}`)] : []),
          note(d.online ? onlineHow : clinicHow),
          ...(d.by === 'CUSTOMER' ? [p('Mỗi lịch khám chỉ được tự đổi 1 lần. Cần đổi thêm, vui lòng liên hệ CSKH.')] : [p(`Thông tin chưa đúng, vui lòng gọi hotline ${esc(ctx.clinic.hotline)}.`)]),
        ],
        cta: { label: 'Xem sổ lịch khám', path: '/appointments' },
      };
    },
  },
  DEPOSIT_REFUNDED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const what = d.kind === 'CONSULTATION' ? 'lịch tư vấn chuyên gia' : 'lịch khám';
      return {
        subject: `GlowSkin đã hoàn ${money(d.amount)} tiền cọc`,
        title: 'Đã hoàn tiền cọc',
        lines: [
          p(`GlowSkin đã chuyển khoản hoàn tiền cọc ${what} ${d.date ? `ngày ${day(d.date)}` : ''} cho bạn.`),
          table([row('Số tiền', money(d.amount)), row('Mã giao dịch', esc(d.ref)), row('Mã lịch', code(d.source_id))]),
          p(`Tiền thường về tài khoản trong 1 - 3 ngày làm việc tùy ngân hàng. Quá thời gian trên chưa nhận được, vui lòng gọi hotline ${esc(ctx.clinic.hotline)} kèm mã giao dịch.`),
        ],
        cta: { label: d.kind === 'CONSULTATION' ? 'Xem lịch tư vấn' : 'Xem sổ lịch khám', path: '/appointments' },
      };
    },
  },
  POINTS_CREDITED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const what = d.source === 'CONSULTATION' ? 'lịch tư vấn chuyên gia' : 'lịch khám';
      const pts = Number(d.points).toLocaleString('vi-VN');
      const order = `#${code(d.order_id || d.source_id)}`;
      const reason = {
        CLINIC_REFUND: `Phòng khám đã hủy ${what} #${code(d.source_id)}. Khoản ${money(d.amount_vnd)} được hoàn bằng <b>${pts} điểm</b>${d.bonus_percent ? ` (đã cộng thêm ${d.bonus_percent}% vì lỗi từ phía phòng khám)` : ''}.`,
        CANCEL_REFUND: `Bạn đã hủy ${what} #${code(d.source_id)} trước giờ hẹn từ 24 giờ. Khoản ${money(d.amount_vnd)} không bị mất mà được đổi thành <b>${pts} điểm</b>.`,
        ORDER_CANCEL: `Đơn hàng ${order} đã hủy theo yêu cầu của bạn. Khoản ${money(d.amount_vnd)} đã thanh toán được hoàn bằng <b>${pts} điểm</b> như bạn chọn.`,
        ORDER_REFUND: `Đơn hàng ${order} trả bằng Điểm GlowSkin đã bị hủy. Bạn được hoàn lại <b>${pts} điểm</b>.`,
        RETURN_REFUND: `Yêu cầu hoàn trả của đơn ${order} đã được duyệt hoàn. Đơn trả bằng điểm nên khoản ${money(d.amount_vnd)} được hoàn bằng <b>${pts} điểm</b>.`,
        EXCHANGE_DIFF: `Sản phẩm đổi cho đơn ${order} rẻ hơn hàng bạn trả lại. Phần chênh ${money(d.amount_vnd)} được cộng thành <b>${pts} điểm</b>.`,
      }[d.kind] || `Bạn vừa được cộng <b>${pts} điểm</b>.`;
      return {
        subject: `Bạn vừa nhận ${pts} Điểm GlowSkin`,
        title: 'Đã cộng Điểm GlowSkin',
        lines: [
          p(reason),
          table([row('Điểm vừa cộng', `+${pts} điểm`), ...(d.balance != null ? [row('Số dư hiện tại', `${Number(d.balance).toLocaleString('vi-VN')} điểm`)] : []), row('Quy đổi', `1 điểm = ${money(d.value_vnd || 100)}`), row('Hạn dùng', `${d.expire_months || 12} tháng kể từ hôm nay`)]),
          note('Dùng điểm để trả cọc lịch khám, phí tư vấn chuyên gia, hoặc mua mỹ phẩm theo giá niêm yết (cần đủ điểm cho toàn bộ khoản thanh toán). Điểm không đổi ra tiền mặt và không chuyển cho người khác.'),
        ],
        cta: { label: 'Xem Điểm GlowSkin', path: '/profile' },
      };
    },
  },
  POINTS_EXPIRING: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const pts = Number(d.points).toLocaleString('vi-VN');
      return {
        subject: `${pts} Điểm GlowSkin của bạn sắp hết hạn ngày ${day(d.expires_at)}`,
        title: 'Điểm sắp hết hạn',
        lines: [
          p(`Bạn có <b>${pts} điểm</b> (tương đương ${money(Number(d.points) * (d.value_vnd || 100))}) sẽ hết hạn vào <b>${day(d.expires_at)}</b>. Điểm hết hạn sẽ bị trừ khỏi tài khoản và không khôi phục được.`),
          note('Dùng điểm để trả cọc lịch khám, phí tư vấn chuyên gia hoặc mua mỹ phẩm trước ngày hết hạn. Điểm cộng sớm hơn được dùng trước.'),
        ],
        cta: { label: 'Xem Điểm GlowSkin', path: '/profile' },
      };
    },
  },
  CONSULT_BOOKED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: `Xác nhận lịch tư vấn chuyên gia ${hm(d.time)} ${day(d.date)}`,
        title: 'Đặt lịch tư vấn thành công',
        lines: [
          table([
            row('Mã lịch', code(d.consultation_id)),
            row('Chuyên gia', esc(d.expert_name || 'Chuyên gia GlowSkin')),
            row('Thời gian', `${hm(d.time)} - ${day(d.date)}`),
            row('Hình thức', 'Tư vấn online qua video'),
            row('Đã đặt cọc', money(d.amount)),
          ]),
          note('Đến giờ hẹn, đăng nhập website → <b>Sổ lịch khám</b> → mục tư vấn chuyên gia → bấm <b>Vào phòng tư vấn</b>. Chuẩn bị sẵn câu hỏi và sản phẩm đang dùng để buổi tư vấn hiệu quả hơn.'),
        ],
        cta: { label: 'Xem lịch tư vấn', path: '/appointments' },
      };
    },
  },
  CONSULT_RESULT: {
    kind: 'transaction',
    build: (ctx) => ({
      subject: 'Chuyên gia đã gửi kết quả tư vấn cho bạn',
      title: 'Đã có kết quả tư vấn',
      lines: [
        p(`${esc(ctx.data.expert_name || 'Chuyên gia')} đã gửi kết quả buổi tư vấn ngày ${day(ctx.data.date)}: nhận định, lời khuyên và sản phẩm gợi ý.`),
        p('Vì lý do bảo mật, nội dung chỉ xem được khi đăng nhập website. Sau khi xem, bạn có thể đánh giá buổi tư vấn.'),
      ],
      cta: { label: 'Xem kết quả tư vấn', path: '/appointments' },
    }),
  },
  CONSULT_EXPERT_ABSENT: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: 'Xin lỗi: buổi tư vấn chuyên gia không diễn ra như hẹn',
        title: 'Buổi tư vấn không diễn ra',
        lines: [
          p(`GlowSkin thành thật xin lỗi: buổi tư vấn với ${esc(d.expert_name || 'chuyên gia')} lúc ${hm(d.time)} ${day(d.date)} không diễn ra / chưa có kết quả do lỗi từ phía phòng khám.`),
          d.points
            ? p(`Phí tư vấn bạn đã trả bằng Điểm GlowSkin được <b>hoàn lại ${Number(d.points).toLocaleString('vi-VN')} điểm</b> (đã cộng thêm vì lỗi từ phía phòng khám). CSKH có thể sắp xếp buổi tư vấn khác nếu bạn muốn.`)
            : p(`Bạn được <b>hoàn lại toàn bộ tiền cọc ${money(d.amount)}</b>. CSKH sẽ liên hệ để lấy thông tin tài khoản nhận hoàn và có thể sắp xếp buổi tư vấn khác nếu bạn muốn.`),
        ],
        cta: { label: 'Xem lịch tư vấn', path: '/appointments' },
      };
    },
  },
  ORDER_PLACED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const items = (d.items || []).map((i) => `<tr><td style="padding:4px 8px 4px 0">${esc(i.name)} × ${esc(i.quantity)}</td><td style="padding:4px 0;text-align:right;white-space:nowrap">${money(i.price * i.quantity)}</td></tr>`).join('');
      const total = Number(d.total) - Number(d.discount || 0) + Number(d.shipping_fee || 0);
      return {
        subject: `Đã nhận đơn hàng #${code(d.order_id)}`,
        title: d.paid ? 'Đã nhận thanh toán đơn hàng' : 'Đặt hàng thành công',
        lines: [
          p(d.paid ? 'GlowSkin đã nhận đủ tiền chuyển khoản. Đơn đang chờ nhân viên duyệt và đóng gói.' : 'GlowSkin đã nhận đơn hàng của bạn. Đơn đang chờ nhân viên duyệt và đóng gói.'),
          `<table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px;margin:8px 0">${items}
            ${Number(d.discount) > 0 ? `<tr><td style="padding:4px 8px 4px 0;color:#6b7280">Giảm giá</td><td style="text-align:right">-${money(d.discount)}</td></tr>` : ''}
            <tr><td style="padding:4px 8px 4px 0;color:#6b7280">Phí vận chuyển</td><td style="text-align:right">${money(d.shipping_fee)}</td></tr>
            <tr><td style="padding:6px 8px 4px 0;border-top:1px solid #e5e7eb"><b>Tổng thanh toán</b></td><td style="padding-top:6px;border-top:1px solid #e5e7eb;text-align:right"><b>${money(total)}</b></td></tr></table>`,
          table([row('Thanh toán', d.payment_method === 'POINTS' ? `Điểm GlowSkin (${Number(d.points_used || 0).toLocaleString('vi-VN')} điểm)` : d.payment_method === 'VIETQR_SEPAY' ? 'Chuyển khoản (đã thanh toán)' : 'Thanh toán khi nhận hàng (COD)'), row('Giao đến', esc(`${d.recipient_name} - ${d.shipping_phone}, ${d.shipping_address}`))]),
          p('Bạn sẽ nhận email kèm mã vận đơn khi đơn được giao cho đơn vị vận chuyển.'),
        ],
        cta: { label: 'Xem đơn hàng', path: '/orders' },
      };
    },
  },
  ORDER_SHIPPING: {
    kind: 'transaction',
    build: (ctx) => ({
      subject: `Đơn hàng #${code(ctx.data.order_id)} đang được giao`,
      title: 'Đơn hàng đang được giao',
      lines: [
        p('Đơn hàng đã được đóng gói và giao cho Giao Hàng Nhanh (GHN).'),
        table([row('Mã đơn', code(ctx.data.order_id)), row('Mã vận đơn GHN', esc(ctx.data.tracking_code))]),
        p(`Tra cứu hành trình: <a href="https://donhang.ghn.vn/?order_code=${encodeURIComponent(ctx.data.tracking_code)}" style="color:#0f766e">donhang.ghn.vn</a>. Vui lòng kiểm tra hàng trước khi nhận; khi đơn chuyển "Đã nhận", bạn có 7 ngày để yêu cầu hoàn trả nếu sản phẩm lỗi.`),
      ],
      cta: { label: 'Xem đơn hàng', path: '/orders' },
    }),
  },
  ORDER_CANCELLED: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const who = { CUSTOMER: 'theo yêu cầu của bạn', CLINIC: 'bởi phòng khám', CARRIER: 'bởi đơn vị vận chuyển', SYSTEM: 'tự động' }[d.initiator] || '';
      return {
        subject: `Đơn hàng #${code(d.order_id)} đã bị hủy`,
        title: 'Đơn hàng đã bị hủy',
        lines: [
          p(`Đơn hàng #${code(d.order_id)} đã được hủy ${who}.`),
          ...(d.reason ? [table([row('Lý do', esc(d.reason))])] : []),
          ...(d.refund_pending ? [note(`Đơn đã thanh toán chuyển khoản <b>${money(d.refund_amount)}</b>: GlowSkin sẽ hoàn tiền cho bạn và gửi email kèm mã giao dịch khi đã chuyển.`)] : []),
          ...(d.points_refunded ? [note(`Bạn được hoàn <b>${Number(d.points_refunded).toLocaleString('vi-VN')} Điểm GlowSkin</b> vào tài khoản.`)] : []),
          ...(d.voucher_returned ? [p('Mã giảm giá đã dùng cho đơn đã được trả lại vào ví voucher của bạn.')] : []),
        ],
        cta: { label: 'Xem đơn hàng', path: '/orders' },
      };
    },
  },
  ORDER_REFUNDED: {
    kind: 'transaction',
    build: (ctx) => ({
      subject: `GlowSkin đã hoàn ${money(ctx.data.amount)} cho đơn #${code(ctx.data.order_id)}`,
      title: 'Đã hoàn tiền đơn hàng',
      lines: [
        table([row('Đơn hàng', code(ctx.data.order_id)), row('Số tiền', money(ctx.data.amount)), row('Mã giao dịch', esc(ctx.data.ref))]),
        p(`Tiền thường về tài khoản trong 1 - 3 ngày làm việc. Chưa nhận được, vui lòng gọi hotline ${esc(ctx.clinic.hotline)} kèm mã giao dịch.`),
      ],
      cta: { label: 'Xem đơn hàng', path: '/orders' },
    }),
  },
  RETURN_UPDATE: {
    kind: 'transaction',
    build: (ctx) => {
      const d = ctx.data;
      const map = {
        APPROVED: ['Yêu cầu hoàn trả đã được duyệt', [p('Nhân viên đã duyệt yêu cầu hoàn trả. GHN sẽ liên hệ lấy hàng tại địa chỉ nhận hàng của đơn, <b>GlowSkin trả phí vận chuyển</b>. Vui lòng đóng gói đủ sản phẩm, hộp và tem.')]],
        REJECTED: ['Yêu cầu hoàn trả không được chấp nhận', [table([row('Lý do', esc(d.reason))]), p(`Cần trao đổi thêm, vui lòng gọi hotline ${esc(ctx.clinic.hotline)}.`)]],
        REFUNDED: d.points ? ['Đã hoàn điểm hàng trả lại', [table([row('Điểm hoàn', `+${Number(d.points).toLocaleString('vi-VN')} điểm`)]), p('Đơn trả bằng Điểm GlowSkin nên được hoàn lại bằng điểm, không hoàn tiền mặt.')]] : ['Đã hoàn tiền hàng trả lại', [table([row('Số tiền', money(d.amount)), row('Mã giao dịch', esc(d.ref))]), p('Tiền thường về tài khoản trong 1 - 3 ngày làm việc.')]],
        EXCHANGED: ['Sản phẩm đổi đang được chuẩn bị', [table([row('Đơn giao hàng đổi', `#${code(d.exchange_order_id)}`)]), p('Hàng trả lại đã được kiểm tra đạt. GlowSkin giao sản phẩm đổi tới địa chỉ nhận hàng của đơn, bạn không trả thêm tiền.'), ...(d.diff_points ? [note(`Sản phẩm đổi rẻ hơn hàng bạn trả: phần chênh được cộng <b>${Number(d.diff_points).toLocaleString('vi-VN')} Điểm GlowSkin</b>.`)] : [])]],
      }[d.status];
      return {
        subject: `${map[0]} (đơn #${code(d.order_id)})`,
        title: map[0],
        lines: [p(`Đơn hàng #${code(d.order_id)}.`), ...map[1]],
        cta: { label: 'Xem đơn hàng', path: '/orders' },
      };
    },
  },
  REMIND_APPOINTMENT: {
    kind: 'reminder',
    build: (ctx) => {
      const d = ctx.data;
      const soon = Number(d.hours) <= 2;
      return {
        subject: soon ? `Sắp đến giờ khám: ${hm(d.time)} hôm nay` : `Nhắc lịch khám ${hm(d.time)} ${day(d.date)}`,
        title: soon ? 'Sắp đến giờ khám' : 'Nhắc lịch khám ngày mai',
        lines: [
          p(`Bạn có lịch khám${forPatient(ctx, d.patient_profile_id)} tại GlowSkin:`),
          table([row('Thời gian', `${hm(d.time)} - ${day(d.date)}`), row('Bác sĩ', esc(doctorName(ctx, d.doctor_id))), row('Hình thức', examPlace(ctx, d.online)), row('Mã lịch', code(d.appointment_id))]),
          note(d.online ? onlineHow : clinicHow),
          ...(soon ? [] : [p('Không đến được? Vui lòng đổi lịch tại <b>Sổ lịch khám</b> (trước giờ khám ít nhất 24 giờ) hoặc gọi CSKH để được hỗ trợ.')]),
        ],
        cta: { label: 'Xem sổ lịch khám', path: '/appointments' },
      };
    },
  },
  REMIND_CONSULT: {
    kind: 'reminder',
    build: (ctx) => {
      const d = ctx.data;
      const soon = Number(d.hours) <= 1;
      return {
        subject: soon ? `Sắp đến giờ tư vấn: ${hm(d.time)} hôm nay` : `Nhắc lịch tư vấn chuyên gia ${hm(d.time)} ${day(d.date)}`,
        title: soon ? 'Sắp đến giờ tư vấn' : 'Nhắc lịch tư vấn ngày mai',
        lines: [
          table([row('Chuyên gia', esc(d.expert_name || 'Chuyên gia GlowSkin')), row('Thời gian', `${hm(d.time)} - ${day(d.date)}`)]),
          note('Đến giờ hẹn, vào <b>Sổ lịch khám</b> → mục tư vấn chuyên gia → <b>Vào phòng tư vấn</b>. Không vào phòng trong thời gian phòng mở thì lịch được tính là vắng mặt và không hoàn cọc.'),
        ],
        cta: { label: 'Xem lịch tư vấn', path: '/appointments' },
      };
    },
  },
  REMIND_FOLLOW_UP: {
    kind: 'reminder',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: `Nhắc tái khám ngày ${day(d.follow_up_date)}`,
        title: 'Đến hẹn tái khám',
        lines: [
          p(`${esc(doctorName(ctx, d.doctor_id))} hẹn tái khám${forPatient(ctx, d.patient_profile_id)} vào <b>${day(d.follow_up_date)}</b> để đánh giá tiến triển và điều chỉnh liệu trình.`),
          p('Bạn chưa có lịch khám nào sắp tới. Đặt lịch sớm để chọn được giờ phù hợp; tái khám được miễn phí khám.'),
        ],
        cta: { label: 'Đặt lịch tái khám', path: '/booking' },
      };
    },
  },
  REMIND_PACKAGE: {
    kind: 'reminder',
    build: (ctx) => {
      const d = ctx.data;
      return {
        subject: `Gói ${d.package_name} còn ${d.remaining} buổi chưa sử dụng`,
        title: 'Liệu trình của bạn đang dang dở',
        lines: [
          p(`Gói <b>${esc(d.package_name)}</b> của bạn còn <b>${esc(d.remaining)} buổi</b>${d.last_date ? `, buổi gần nhất ngày ${day(d.last_date)}` : ''}.`),
          p('Liệu trình đều đặn theo lịch giúp da đạt kết quả tốt nhất. Bạn có thể đặt lịch buổi tiếp theo hoặc gọi CSKH để được sắp xếp.'),
        ],
        cta: { label: 'Xem gói liệu trình', path: '/treatments' },
      };
    },
  },
  SKIN_REVIEWED: {
    kind: 'transaction',
    build: () => ({
      subject: 'Bác sĩ đã xem lại kết quả soi da của bạn',
      title: 'Kết quả soi da đã được bác sĩ xác nhận',
      lines: [
        p('Bác sĩ GlowSkin đã xem lại lượt soi da của bạn, hiệu chỉnh vùng da AI khoanh (nếu cần) và để lại ghi chú.'),
        p('Vì lý do bảo mật, kết quả chỉ xem được khi đăng nhập website.'),
      ],
      cta: { label: 'Xem lịch sử soi da', path: '/lich-su-soi-da' },
    }),
  },
};

// Khung chung: logo chữ, tiêu đề, lời chào, nội dung, nút, chân trang thông tin phòng khám
const render = (tpl, ctx) => {
  const b = tpl.build(ctx);
  const c = ctx.clinic;
  const cta = b.cta ? `<p style="margin:22px 0 8px"><a href="${esc(ctx.link(b.cta.path))}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">${esc(b.cta.label)}</a></p>` : '';
  const optOut = tpl.kind === 'reminder' ? `<br>Không muốn nhận email nhắc lịch? Tắt tại <a href="${esc(ctx.link('/profile'))}" style="color:#6b7280">Hồ sơ cá nhân</a>.` : '';
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:600px;margin:0 auto;padding:16px">
  <div style="padding:14px 4px;font-size:20px;font-weight:bold;color:#0f766e">GlowSkin <span style="font-size:13px;font-weight:normal;color:#6b7280">${esc(c.business_name || 'Phòng khám da liễu')}</span></div>
  <div style="background:#fff;border-radius:12px;padding:22px 24px;font-size:15px">
    <h1 style="margin:0 0 12px;font-size:20px;color:#111827">${esc(b.title)}</h1>
    <p style="margin:0 0 10px">Chào ${esc(ctx.name || 'bạn')},</p>
    ${b.lines.join('\n')}
    ${cta}
    <p style="margin:18px 0 0;color:#374151">Trân trọng,<br>Phòng khám da liễu GlowSkin</p>
  </div>
  <div style="padding:14px 6px;font-size:12px;color:#6b7280;line-height:1.6">
    ${c.address ? `${esc(c.address)}<br>` : ''}Hotline: ${esc(c.hotline)}${c.working_hours ? ` · Giờ khám: ${esc(c.working_hours)}` : ''}<br>
    Email gửi tự động, vui lòng không trả lời email này.${optOut}
  </div>
</div></body></html>`;
  const text = `${b.title}\n\nChào ${ctx.name || 'bạn'},\n\n${b.lines.join('\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|tr)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()}\n\n${b.cta ? `${b.cta.label}: ${ctx.link(b.cta.path)}\n\n` : ''}GlowSkin - Hotline ${c.hotline}`;
  return { subject: b.subject, html, text };
};

module.exports = { TEMPLATES: T, render };
