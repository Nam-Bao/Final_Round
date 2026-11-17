// Chứng từ in cho khách, khổ A5 dọc: phiếu thanh toán sau khám, đơn thuốc / chỉ định điều trị, hóa đơn bán lẻ tại quầy.
// Mở ở tab riêng (utils/print.js), tự mở hộp thoại in: chọn máy in để in thẳng hoặc "Lưu dưới dạng PDF".
// Chỉ in nét đen trên nền trắng để máy in laser đen trắng vẫn rõ.
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCode, Button, Result, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { CLIENT_URL } from '../components/content/contentApi';

const API = 'http://localhost:4000/api';
const SOURCES = {
  invoice: { url: (id) => `${API}/booking/appointments/${id}/print/invoice`, title: 'Phiếu thanh toán' },
  prescription: { url: (id) => `${API}/booking/appointments/${id}/print/prescription`, title: 'Đơn thuốc' },
  order: { url: (id) => `${API}/commerce/orders/admin/${id}/print`, title: 'Hóa đơn bán lẻ' },
};
const DEFAULT_NAME = 'Phòng khám da liễu GlowSkin';
// Ô trống trong "Thông tin phòng khám" => dùng giá trị mặc định giống website khách hàng (địa chỉ trong frontend-admin/.env)
const withDefaults = (c = {}) => ({ ...c, hotline: c.hotline || '0869694064', address: c.address || import.meta.env.VITE_CLINIC_ADDRESS || '', working_hours: c.working_hours || '08:00 - 17:00 (Hàng ngày)' });
// Tên sản phẩm thường đã có dung tích ("... 40ml") => không ghi lặp
const withCapacity = (name, cap) => (cap && !String(name).toLowerCase().includes(String(cap).toLowerCase()) ? `${name} (${cap})` : name);
const GENDER = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
const money = (n) => (n === null || n === undefined ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')} đ`);
const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');
const fmtDateTime = (d) => (d ? dayjs(d).format('HH:mm DD/MM/YYYY') : '—');

// Tuổi: trẻ dưới 72 tháng ghi số tháng (cách ghi trên đơn thuốc)
const ageText = (dob) => {
  if (!dob) return null;
  const months = dayjs().diff(dayjs(dob), 'month');
  return months < 72 ? `${months} tháng` : `${Math.floor(months / 12)} tuổi`;
};

// Đọc số tiền bằng chữ: 1250000 => "Một triệu hai trăm năm mươi nghìn đồng"
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const readTriple = (n, full) => {
  const a = Math.floor(n / 100); const b = Math.floor((n % 100) / 10); const c = n % 10;
  const out = [];
  if (full || a) out.push(`${DIGITS[a]} trăm`);
  if (b === 0 && c) { if (full || a) out.push('lẻ'); } else if (b === 1) out.push('mười'); else if (b > 1) out.push(`${DIGITS[b]} mươi`);
  if (c) out.push(c === 1 && b > 1 ? 'mốt' : c === 5 && b > 0 ? 'lăm' : DIGITS[c]);
  return out.join(' ');
};
export const moneyInWords = (value) => {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (!n) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const words = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (!groups[i]) continue;
    words.push(readTriple(groups[i], i < groups.length - 1), units[i] || '');
  }
  const s = words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} đồng`;
};

const CSS = `
@page { size: A5 portrait; margin: 9mm 10mm; }
.print-root { background: #e5e7eb; min-height: 100vh; padding: 16px 0 40px; color: #111; font-family: 'Times New Roman', Times, serif; }
.print-bar { width: 148mm; margin: 0 auto 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-family: system-ui, sans-serif; font-size: 13px; color: #374151; }
.sheet { width: 148mm; min-height: 210mm; margin: 0 auto; background: #fff; padding: 9mm 10mm; box-shadow: 0 2px 10px rgba(0,0,0,.15); box-sizing: border-box; position: relative; font-size: 10.5pt; line-height: 1.35; }
.head { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1.5px solid #111; padding-bottom: 5px; }
.head .org { font-size: 9pt; } .head .org b { font-size: 11pt; text-transform: uppercase; }
.head .qr { text-align: center; font-size: 7pt; width: 24mm; flex-shrink: 0; }
.title { text-align: center; margin: 8px 0 2px; font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; }
.sub { text-align: center; font-size: 9pt; margin-bottom: 8px; }
.info { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 12px; font-size: 10pt; margin-bottom: 6px; }
.info .full { grid-column: 1 / -1; }
.lbl { color: #333; }
table.items { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 4px 0; }
table.items th, table.items td { border: 1px solid #555; padding: 2px 4px; vertical-align: top; }
table.items th { background: #f1f1f1; font-weight: bold; text-align: center; }
table.items td.num { text-align: right; white-space: nowrap; } table.items td.c { text-align: center; }
table.items tr.group td { font-weight: bold; background: #fafafa; }
.totals { margin-left: auto; width: 70%; font-size: 10pt; } .totals div { display: flex; justify-content: space-between; padding: 1px 0; }
.totals .grand { border-top: 1px solid #111; font-weight: bold; font-size: 11.5pt; margin-top: 2px; padding-top: 2px; }
.words { font-style: italic; font-size: 9.5pt; margin: 4px 0; }
.box { border: 1px dashed #777; padding: 4px 6px; font-size: 9.5pt; margin: 6px 0; }
.rx-item { margin: 0 0 5px; } .rx-item .usage { margin-left: 16px; font-style: italic; }
.sign { display: flex; justify-content: space-between; margin-top: 10px; text-align: center; font-size: 10pt; } .sign > div { width: 45%; } .sign .space { height: 16mm; }
.foot { margin-top: 8px; border-top: 1px solid #999; padding-top: 3px; font-size: 7.5pt; color: #333; display: flex; justify-content: space-between; gap: 6px; }
.stamp { position: absolute; top: 70mm; left: 50%; transform: translateX(-50%) rotate(-18deg); border: 3px solid #111; color: #111; padding: 4px 14px; font-size: 20pt; font-weight: bold; opacity: .35; letter-spacing: 2px; white-space: nowrap; }
.note-legacy { font-size: 8pt; font-style: italic; color: #444; }
@media print {
  html, body, #root { height: auto !important; min-height: 0 !important; background: #fff !important; }
  .print-root { background: #fff; padding: 0; min-height: 0; }
  .print-bar { display: none; }
  .sheet { width: auto; min-height: auto; box-shadow: none; margin: 0; padding: 0; }
  .stamp { top: 60mm; }
}
`;

function Header({ clinic, docTitle, docNo, date, qrValue, qrLabel }) {
  return (
    <>
      <div className="head">
        <div className="org">
          <b>{clinic.business_name || DEFAULT_NAME}</b>
          {clinic.address && <div>Địa chỉ: {clinic.address}</div>}
          <div>{clinic.hotline && <>Hotline: {clinic.hotline}</>}{clinic.working_hours && <> · Giờ khám: {clinic.working_hours}</>}</div>
          {(clinic.tax_code || clinic.license_no) && <div>{clinic.tax_code && <>MST: {clinic.tax_code}</>}{clinic.tax_code && clinic.license_no && ' · '}{clinic.license_no && <>Giấy phép: {clinic.license_no}</>}</div>}
        </div>
        {qrValue && (
          <div className="qr">
            <QRCode value={qrValue} size={80} type="svg" bordered={false} errorLevel="M" style={{ padding: 0, margin: '0 auto' }} />
            <div>{qrLabel}</div>
          </div>
        )}
      </div>
      <div className="title">{docTitle}</div>
      <div className="sub">Số: <b>{docNo}</b> · Ngày {fmtDateTime(date)}</div>
    </>
  );
}

function Footer({ data, note }) {
  return (
    <div className="foot">
      <span>In lúc {fmtDateTime(data.printed_at)}{data.printed_by ? ` bởi ${data.printed_by}` : ''}</span>
      <span>{note}</span>
    </div>
  );
}

function Invoice({ d }) {
  const t = d.totals;
  return (
    <>
      {d.status === 'REFUNDED' && <div className="stamp">ĐÃ HOÀN TIỀN</div>}
      <Header clinic={d.clinic} docTitle="Phiếu thanh toán" docNo={d.doc_no} date={d.checked_out_at} qrValue={`${CLIENT_URL}/appointments`} qrLabel="Xem lịch sử khám" />
      <div className="info">
        <div><span className="lbl">Khách hàng:</span> <b>{d.patient?.name || '—'}</b></div>
        <div><span className="lbl">Điện thoại:</span> {d.patient?.phone || '—'}</div>
        {d.account && d.account.name && d.account.name !== d.patient?.name && <div className="full"><span className="lbl">Chủ tài khoản:</span> {d.account.name}{d.patient?.relationship ? ` (người khám: ${d.patient.relationship})` : ''}</div>}
        <div><span className="lbl">Ngày khám:</span> {fmtDate(d.appointment.date)} {d.appointment.time}</div>
        <div><span className="lbl">Bác sĩ:</span> {d.doctor ? `${d.doctor.title ? `${d.doctor.title} ` : ''}${d.doctor.name}` : '—'}</div>
      </div>
      <table className="items">
        <thead><tr><th style={{ width: '6%' }}>TT</th><th>Nội dung</th><th style={{ width: '8%' }}>SL</th><th style={{ width: '20%' }}>Đơn giá</th><th style={{ width: '21%' }}>Thành tiền</th></tr></thead>
        <tbody>
          {d.groups.map((g) => (
            <React.Fragment key={g.key}>
              <tr className="group"><td colSpan={5}>{g.label}{g.total !== undefined && g.items.some((i) => i.amount === null) ? ` (tổng ${money(g.total)})` : ''}</td></tr>
              {g.items.map((it, i) => (
                <tr key={`${g.key}${i}`}><td className="c">{i + 1}</td><td>{it.name}</td><td className="c">{it.quantity}</td><td className="num">{money(it.price)}</td><td className="num">{money(it.amount)}</td></tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="totals">
        <div><span>Tạm tính</span><span>{money(t.gross)}</span></div>
        {t.discount > 0 && <div><span>Giảm giá{t.voucher_code ? ` (mã ${t.voucher_code})` : ''}</span><span>-{money(t.discount)}</span></div>}
        <div className="grand"><span>Tổng thanh toán</span><span>{money(t.total)}</span></div>
        {t.consult_credit > 0 && <div><span>Trừ cọc tư vấn chuyên gia</span><span>-{money(t.consult_credit)}</span></div>}
        {t.deposit_paid > 0 && <div><span>Đã trả khi đặt lịch</span><span>-{money(t.deposit_paid)}</span></div>}
        {t.amount_due_now !== null && <div><b>Thu tại quầy</b><b>{money(t.amount_due_now)}</b></div>}
      </div>
      <div className="words">Tổng thanh toán bằng chữ: {moneyInWords(t.total)}.</div>
      <div className="info">
        <div><span className="lbl">Hình thức thanh toán:</span> {d.payment_method}</div>
        <div><span className="lbl">Thu ngân:</span> {d.cashier || '—'}</div>
      </div>
      {d.payments.length > 0 && (
        <div className="box">
          <b>Các khoản đã thu:</b>
          {d.payments.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.label} ({fmtDateTime(p.at)})</span><span>{money(p.amount)}</span></div>)}
        </div>
      )}
      {d.groups.some((g) => g.key === 'packages' || g.key === 'services') && <div className="box">Dịch vụ / gói liệu trình đã mua: khách xem lịch và số buổi còn lại tại mục "Gói liệu trình" trên website hoặc hỏi quầy CSKH.</div>}
      {d.legacy && <div className="note-legacy">Hóa đơn chốt trước khi hệ thống lưu chi tiết đơn giá: một số dòng chỉ ghi tổng nhóm.</div>}
      <div className="sign">
        <div><b>Khách hàng</b><div className="space" /><i>(Ký, ghi rõ họ tên)</i></div>
        <div><b>Thu ngân</b><div className="space" />{d.cashier || ''}</div>
      </div>
      <Footer data={d} note="Phiếu này không thay thế hóa đơn GTGT. Cảm ơn quý khách!" />
    </>
  );
}

function Prescription({ d }) {
  const p = d.patient || {};
  return (
    <>
      <Header clinic={d.clinic} docTitle={d.has_rx ? 'Đơn thuốc' : 'Đơn chăm sóc da & chỉ định điều trị'} docNo={d.doc_no} date={d.prescribed_at} qrValue={`${CLIENT_URL}/appointments`} qrLabel="Xem lịch sử khám" />
      <div className="info">
        <div className="full"><span className="lbl">Họ tên:</span> <b style={{ textTransform: 'uppercase' }}>{p.name || '—'}</b></div>
        <div><span className="lbl">Ngày sinh:</span> {fmtDate(p.dob)}{ageText(p.dob) ? ` (${ageText(p.dob)})` : ''}</div>
        <div><span className="lbl">Giới tính:</span> {GENDER[p.gender] || '—'}</div>
        <div className="full"><span className="lbl">Điện thoại:</span> {p.phone || '—'}</div>
        {d.exam.symptoms && <div className="full"><span className="lbl">Triệu chứng:</span> {d.exam.symptoms}</div>}
        <div className="full"><span className="lbl">Chẩn đoán:</span> <b>{d.exam.diagnosis || '—'}</b></div>
      </div>
      {d.items.length > 0 && (
        <>
          <div style={{ fontWeight: 'bold', margin: '6px 0 3px' }}>{d.has_rx ? 'Thuốc / mỹ phẩm điều trị' : 'Sản phẩm chăm sóc da'}</div>
          {d.items.map((it, i) => (
            <div className="rx-item" key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span><b>{i + 1}. {withCapacity(it.name, it.capacity)}</b>{it.is_prescription ? ' [thuốc kê đơn]' : ''}</span>
                <span style={{ whiteSpace: 'nowrap' }}>SL: <b>{it.quantity}</b></span>
              </div>
              <div className="usage">Cách dùng: {it.usage}</div>
            </div>
          ))}
        </>
      )}
      {(d.services.length > 0 || d.packages.length > 0) && (
        <div className="box">
          <b>Chỉ định điều trị tại phòng khám:</b>
          {[...d.services, ...d.packages].map((x, i) => <div key={i}>- {x}</div>)}
        </div>
      )}
      {!d.items.length && !d.services.length && !d.packages.length && <div className="box">Bác sĩ không kê sản phẩm hay chỉ định dịch vụ trong lần khám này.</div>}
      {d.exam.notes && <div style={{ margin: '6px 0' }}><b>Lời dặn:</b> {d.exam.notes}</div>}
      <div><b>Hẹn tái khám:</b> {d.exam.follow_up_date ? fmtDate(d.exam.follow_up_date) : 'Khi có bất thường hoặc theo lời dặn của bác sĩ'}</div>
      <div className="sign">
        <div style={{ textAlign: 'left', fontSize: '8.5pt' }}><i>Mang theo đơn này khi tái khám. Ngưng dùng và liên hệ phòng khám nếu da kích ứng (đỏ rát, ngứa, sưng).</i></div>
        <div>
          <i>Ngày {dayjs(d.prescribed_at).format('DD')} tháng {dayjs(d.prescribed_at).format('MM')} năm {dayjs(d.prescribed_at).format('YYYY')}</i>
          <div><b>Bác sĩ khám bệnh</b></div>
          <div className="space" />
          <b>{d.doctor ? `${d.doctor.title ? `${d.doctor.title} ` : ''}${d.doctor.name}` : ''}</b>
          {d.doctor?.license_number && <div style={{ fontSize: '8.5pt' }}>CCHN: {d.doctor.license_number}</div>}
        </div>
      </div>
      {d.legacy && <div className="note-legacy">Lần khám trước khi hệ thống lưu đơn riêng: đơn in theo dữ liệu còn trên lịch hẹn.</div>}
      <Footer data={d} note="Đơn chỉ có giá trị cho người có tên trên đơn." />
    </>
  );
}

function CounterOrder({ d }) {
  const t = d.totals;
  return (
    <>
      {d.order.returned && <div className="stamp">ĐÃ TRẢ HÀNG</div>}
      <Header clinic={d.clinic} docTitle="Hóa đơn bán lẻ" docNo={d.doc_no} date={d.order.created_at} qrValue={`${CLIENT_URL}/orders`} qrLabel="Xem đơn hàng" />
      <div className="info">
        <div><span className="lbl">Khách hàng:</span> <b>{d.customer.name}</b></div>
        <div><span className="lbl">Điện thoại:</span> {d.customer.phone || '—'}</div>
        <div><span className="lbl">Nhân viên bán:</span> {d.seller || '—'}</div>
        <div><span className="lbl">Thanh toán:</span> {d.order.payment_method}</div>
      </div>
      <table className="items">
        <thead><tr><th style={{ width: '6%' }}>TT</th><th>Sản phẩm</th><th style={{ width: '8%' }}>SL</th><th style={{ width: '20%' }}>Đơn giá</th><th style={{ width: '21%' }}>Thành tiền</th></tr></thead>
        <tbody>
          {d.items.map((it, i) => <tr key={i}><td className="c">{i + 1}</td><td>{withCapacity(it.name, it.capacity)}</td><td className="c">{it.quantity}</td><td className="num">{money(it.price)}</td><td className="num">{money(it.amount)}</td></tr>)}
        </tbody>
      </table>
      <div className="totals">
        <div><span>Tạm tính</span><span>{money(t.gross)}</span></div>
        {t.discount > 0 && <div><span>Giảm giá{t.voucher_code ? ` (mã ${t.voucher_code})` : ''}</span><span>-{money(t.discount)}</span></div>}
        <div className="grand"><span>Tổng thanh toán</span><span>{money(t.total)}</span></div>
      </div>
      <div className="words">Bằng chữ: {moneyInWords(t.total)}.</div>
      {d.safety.length > 0 && (
        <div className="box">
          <b>Lưu ý an toàn nhân viên đã tư vấn:</b>
          {d.safety.map((w, i) => <div key={i}>- {w.item}: {w.message}{w.label ? ` (${w.label})` : ''}</div>)}
        </div>
      )}
      <div className="box">Mỹ phẩm không nhận trả vì đổi ý. Sản phẩm lỗi hoặc không đúng mô tả: mang sản phẩm (còn đủ hộp, tem) cùng hóa đơn này đến phòng khám, chi tiết tại mục Hoàn / trả hàng trên website. Hotline: {d.clinic.hotline}</div>
      <div className="sign">
        <div><b>Khách hàng</b><div className="space" /><i>(Ký, ghi rõ họ tên)</i></div>
        <div><b>Nhân viên bán hàng</b><div className="space" />{d.seller || ''}</div>
      </div>
      <Footer data={d} note="Phiếu này không thay thế hóa đơn GTGT. Cảm ơn quý khách!" />
    </>
  );
}

export default function PrintPage() {
  const { type, id } = useParams();
  const [search] = useSearchParams();
  const [state, setState] = useState({ loading: true });
  const printed = useRef(false);
  const source = SOURCES[type];

  useEffect(() => {
    if (!source) return setState({ error: 'Loại chứng từ không hợp lệ' });
    const token = sessionStorage.getItem('admin_token');
    if (!token) return setState({ error: 'Phiên đăng nhập đã hết. Hãy đăng nhập lại trang quản trị rồi bấm in lại.' });
    axios.get(source.url(id), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setState({ data: { ...res.data.data, clinic: withDefaults(res.data.data.clinic) } });
      })
      .catch((err) => setState({ error: err.response?.status === 403 && /^Truy cập bị từ chối/.test(err.response?.data?.message || '')
        ? 'Tài khoản của bạn không có quyền in chứng từ này'
        : err.response?.data?.message || 'Không tải được chứng từ' }));
  }, [type, id]);

  useEffect(() => {
    if (!state.data) return;
    const label = type === 'prescription' && !state.data.has_rx ? 'Đơn chăm sóc da' : source.title;
    document.title = `${label} ${state.data.doc_no}`; // tên file gợi ý khi "Lưu dưới dạng PDF"
    if (printed.current || search.get('noprint')) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 500); // chờ mã QR vẽ xong
    return () => clearTimeout(t);
  }, [state.data]);

  if (state.loading) return <div className="flex justify-center py-24"><Spin size="large" /></div>;
  if (state.error) return <Result status="warning" title={state.error} extra={<Button onClick={() => window.close()}>Đóng tab</Button>} />;
  const d = state.data;
  return (
    <div className="print-root">
      <style>{CSS}</style>
      <div className="print-bar">
        <span>Khổ A5. Trong hộp thoại in chọn máy in, hoặc chọn <b>"Lưu dưới dạng PDF"</b> để gửi khách.</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>In / Lưu PDF</Button>
          <Button onClick={() => window.close()}>Đóng</Button>
        </span>
      </div>
      <div className="sheet">
        {type === 'invoice' && <Invoice d={d} />}
        {type === 'prescription' && <Prescription d={d} />}
        {type === 'order' && <CounterOrder d={d} />}
      </div>
    </div>
  );
}
